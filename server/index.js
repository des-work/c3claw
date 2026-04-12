import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDb, insertEvent, getEvents } from './db.js'
import { startBot } from './bot.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3001
const EVENT_API_KEY = process.env.EVENT_API_KEY || ''

// Persistence: Postgres if DATABASE_URL is set, otherwise in-memory fallback
let useDb = false
const memoryEvents = []

// Derive team status from event history
function buildTeamStatus(allEvents) {
  const now = Date.now()
  const byTeam = {}

  for (const evt of allEvents) {
    if (!byTeam[evt.team_id]) {
      byTeam[evt.team_id] = { events: [], blocked_count: 0 }
    }
    byTeam[evt.team_id].events.push(evt)
    if (evt.result === 'BLOCKED') byTeam[evt.team_id].blocked_count++
  }

  return Object.entries(byTeam).map(([team_id, data]) => {
    const sorted = data.events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    const latest = sorted[0]
    const lastSeenMs = now - new Date(latest.timestamp).getTime()

    let status = 'online'
    if (lastSeenMs > 15 * 60 * 1000) status = 'offline'
    else if (lastSeenMs > 5 * 60 * 1000) status = 'idle'
    else if (lastSeenMs > 60 * 1000) status = 'degraded'

    // Derive CIDR from team_id number (e.g. TEAM_03 → 10.0.3.0/24)
    const num = parseInt(team_id.replace(/\D/g, ''), 10) || 0

    return {
      team_id,
      status,
      phase: 1,
      last_action: `${latest.tool} → ${latest.target} [${latest.result}]`,
      last_seen: latest.timestamp,
      cidr: `10.0.${num}.0/24`,
      blocked_count: data.blocked_count,
      event_count: data.events.length
    }
  }).sort((a, b) => a.team_id.localeCompare(b.team_id))
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', persistence: useDb ? 'postgres' : 'memory' })
})

// Returns an array of team status objects derived from event history
app.get('/api/status', async (req, res) => {
  try {
    const allEvents = useDb ? await getEvents(10000) : memoryEvents
    res.json(buildTeamStatus(allEvents))
  } catch (err) {
    console.error('/api/status error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Returns the most recent events
app.get('/api/events', async (req, res) => {
  try {
    if (useDb) {
      const events = await getEvents(100)
      res.json(events)
    } else {
      res.json(memoryEvents.slice(-100))
    }
  } catch (err) {
    console.error('/api/events error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Submit a new event — requires EVENT_API_KEY when configured
app.post('/api/events', async (req, res) => {
  // Auth check: if EVENT_API_KEY is set, require it in the Authorization header
  if (EVENT_API_KEY) {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (token !== EVENT_API_KEY) {
      return res.status(401).json({ error: 'Invalid or missing API key' })
    }
  }

  const { team_id, tool, target, result, details } = req.body
  if (!team_id || !tool || !target || !result) {
    return res.status(400).json({ error: 'team_id, tool, target, and result are required' })
  }

  const event = {
    id: `evt_${Date.now()}`,
    team_id,
    timestamp: new Date().toISOString(),
    tool,
    target,
    result,
    details: details ?? ''
  }

  try {
    if (useDb) {
      await insertEvent(event)
    } else {
      memoryEvents.push(event)
    }
    res.status(201).json(event)
  } catch (err) {
    console.error('/api/events POST error:', err.message)
    res.status(500).json({ error: err.message })
  }
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
    console.warn('PostgreSQL unavailable, using in-memory event store:', err.message)
    useDb = false
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
    console.log(`Persistence: ${useDb ? 'PostgreSQL' : 'in-memory (events lost on restart)'}`)
    if (!EVENT_API_KEY) console.warn('WARNING: EVENT_API_KEY is not set — POST /api/events is unauthenticated')
    startBot()
  })
}

start()
