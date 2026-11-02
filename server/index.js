import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDb, insertEvent, getEvents, getTeamStatuses, getDiscordRejectionCount, upsertMachineStatus, getMachineStatuses } from './db.js'
import { parseEvent, statusFromSummary, updateSummary } from './events.js'
import { startBot } from './bot.js'
import { seedEvents } from './seed.js'
import { attachTopology, loadTopology, MACHINE_STATES, MACHINE_ZONES } from './topology.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3001
const EVENT_API_KEY = process.env.EVENT_API_KEY || ''
const inventory = loadTopology()

// Persistence: Postgres if DATABASE_URL is set, otherwise in-memory fallback
let useDb = false
const memoryEvents = []
const memorySources = new Map()
const memorySummary = new Map()
const memoryMachines = new Map()

app.get('/api/health', async (req, res) => {
  try {
    res.json({ status: 'ok', persistence: useDb ? 'postgres' : 'memory',
      discord_rejections: useDb ? await getDiscordRejectionCount() : 0 })
  } catch (error) {
    res.status(503).json({ status: 'degraded', error: error.message })
  }
})

// Returns an array of team status objects derived from event history
app.get('/api/status', async (req, res) => {
  try {
    const summaries = useDb ? await getTeamStatuses() : [...memorySummary.values()]
    const observations = useDb ? await getMachineStatuses() : [...memoryMachines.values()]
    res.json(attachTopology(summaries.map(summary => statusFromSummary(summary)), inventory, observations))
  } catch (err) {
    console.error('/api/status error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Explicit machine health reports. Operation events alone cannot prove a target is online.
app.post('/api/machines/heartbeat', async (req, res) => {
  if (!EVENT_API_KEY) return res.status(503).json({ error: 'EVENT_API_KEY is required for machine reports' })
  if (req.headers.authorization !== `Bearer ${EVENT_API_KEY}`) {
    return res.status(401).json({ error: 'Invalid or missing API key' })
  }

  const { team_id, machine_id, label, zone, address, status } = req.body || {}
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
  if (!validId(team_id) || !validId(machine_id) || !MACHINE_ZONES.includes(zone) ||
      !MACHINE_STATES.includes(status) ||
      (label !== undefined && (typeof label !== 'string' || label.length > 80)) ||
      (address !== undefined && (typeof address !== 'string' || address.length > 120))) {
    return res.status(400).json({ error: 'Invalid machine report' })
  }

  const configured = inventory.find(team => team.team_id === team_id)?.machines.find(
    machine => machine.machine_id === machine_id
  )
  const machine = {
    team_id, machine_id, label: label || configured?.label || machine_id,
    zone: configured?.zone || zone, address: address || configured?.address || null,
    status, last_seen: new Date().toISOString(),
  }
  try {
    if (useDb) await upsertMachineStatus(machine)
    else memoryMachines.set(`${team_id}:${machine_id}`, machine)
    res.status(201).json(machine)
  } catch (err) {
    console.error('/api/machines/heartbeat error:', err.message)
    res.status(500).json({ error: 'Unable to save machine report' })
  }
})

// Returns the most recent events
app.get('/api/events', async (req, res) => {
  try {
    const requested = Number(req.query.limit)
    const limit = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, 100) : 100
    if (useDb) {
      const events = await getEvents(limit)
      res.json(events)
    } else {
      res.json(memoryEvents.slice(-limit))
    }
  } catch (err) {
    console.error('/api/events error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Submit a new event — requires EVENT_API_KEY when configured
app.post('/api/events', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && !EVENT_API_KEY) {
    return res.status(503).json({ error: 'EVENT_API_KEY is required in production' })
  }
  // Auth check: if EVENT_API_KEY is set, require it in the Authorization header
  if (EVENT_API_KEY) {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (token !== EVENT_API_KEY) {
      return res.status(401).json({ error: 'Invalid or missing API key' })
    }
  }

  const event = parseEvent(req.body)
  if (!event) return res.status(400).json({ error: 'Invalid event fields' })

  try {
    if (useDb) {
      const saved = await insertEvent(event)
      return res.status(saved.duplicate ? 200 : 201).json({ ...saved.event, duplicate: saved.duplicate })
    } else {
      if (event.source_id && memorySources.has(event.source_id)) {
        const previous = memorySources.get(event.source_id)
        if (['team_id', 'tool', 'target', 'result', 'details'].some(field => previous[field] !== event[field])) {
          return res.status(409).json({ error: 'source_id already used for different telemetry' })
        }
        return res.status(200).json({ ...previous, duplicate: true })
      }
      memoryEvents.push(event)
      memorySummary.set(event.team_id, updateSummary(memorySummary.get(event.team_id), event))
      if (event.source_id) memorySources.set(event.source_id, event)
      if (memoryEvents.length > 1000) {
        const removed = memoryEvents.shift()
        if (removed.source_id) memorySources.delete(removed.source_id)
      }
    }
    res.status(201).json({ ...event, duplicate: false })
  } catch (err) {
    console.error('/api/events POST error:', err.message)
    if (err.code === 'SOURCE_CONFLICT') return res.status(409).json({ error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// ── DEV ONLY ──────────────────────────────────────────────────────────────────
// POST /api/seed  — loads mock events into the in-memory store for UI testing.
// Blocked in production so it can never be accidentally deployed live.
// ──────────────────────────────────────────────────────────────────────────────
app.post('/api/seed', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Seed endpoint is disabled in production' })
  }
  for (const event of seedEvents) {
    memoryEvents.push(event)
    memorySummary.set(event.team_id, updateSummary(memorySummary.get(event.team_id), event))
  }
  console.log(`[seed] Loaded ${seedEvents.length} mock events into memory store`)
  res.json({ seeded: seedEvents.length })
})

// Serve the built frontend
app.use(express.static(path.join(__dirname, '../dist')))

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

// Boot
async function start() {
  try {
    useDb = await initDb()
  } catch (err) {
    console.error('PostgreSQL initialization failed:', err)
    if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) throw err
  }

  if (process.env.NODE_ENV === 'production' && (!useDb || !EVENT_API_KEY)) {
    throw new Error('Production requires DATABASE_URL and EVENT_API_KEY')
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
    console.log(`Persistence: ${useDb ? 'PostgreSQL' : 'in-memory (events lost on restart)'}`)
    if (!EVENT_API_KEY) console.warn('WARNING: EVENT_API_KEY is not set — POST /api/events is unauthenticated')
    startBot()
  })
}

start()
