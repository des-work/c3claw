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
const HEROKU_API_KEY = process.env.HEROKU_API_KEY
const TEAM_APP_PREFIX = process.env.TEAM_APP_PREFIX || ''
const EVENT_API_KEY = process.env.EVENT_API_KEY || ''

// Persistence: Postgres if DATABASE_URL is set, otherwise in-memory fallback
let useDb = false
const memoryEvents = []

async function fetchHerokuApps() {
  if (!HEROKU_API_KEY) throw new Error('HEROKU_API_KEY is not set')
  const response = await fetch('https://api.heroku.com/apps', {
    headers: {
      'Authorization': `Bearer ${HEROKU_API_KEY}`,
      'Accept': 'application/vnd.heroku+json; version=3'
    }
  })
  if (!response.ok) throw new Error(`Heroku API error: ${response.status} ${response.statusText}`)
  const apps = await response.json()

  // Filter to only team apps when a prefix is configured
  if (TEAM_APP_PREFIX) {
    return apps.filter(a => a.name.startsWith(TEAM_APP_PREFIX))
  }
  return apps
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', persistence: useDb ? 'postgres' : 'memory' })
})

// Returns an array of team status objects derived from Heroku app data
app.get('/api/status', async (req, res) => {
  try {
    const apps = await fetchHerokuApps()
    const allEvents = useDb ? await getEvents(10000) : memoryEvents

    const teams = apps.map((app, i) => ({
      team_id: app.name,
      status: app.state === 'errored' ? 'offline' : 'online',
      phase: 1,
      last_action: app.released_at ?? 'No releases',
      last_seen: app.updated_at,
      cidr: `10.0.${i + 1}.0/24`,
      blocked_count: 0,
      event_count: allEvents.filter(e => e.team_id === app.name).length
    }))
    res.json(teams)
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
    if (!HEROKU_API_KEY) console.warn('WARNING: HEROKU_API_KEY is not set — /api/status will return errors')
    if (!TEAM_APP_PREFIX) console.warn('WARNING: TEAM_APP_PREFIX is not set — all Heroku apps will appear as teams')
    if (!EVENT_API_KEY) console.warn('WARNING: EVENT_API_KEY is not set — POST /api/events is unauthenticated')
    startBot()
  })
}

start()
