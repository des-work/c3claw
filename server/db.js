import pg from 'pg'

const { Pool } = pg

let pool = null

export function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
    })
  }
  return pool
}

export async function initDb() {
  const db = getPool()
  if (!db) return false

  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      tool TEXT NOT NULL,
      target TEXT NOT NULL,
      result TEXT NOT NULL,
      details TEXT DEFAULT ''
    )
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS machine_status (
      team_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      label TEXT NOT NULL,
      zone TEXT NOT NULL,
      address TEXT,
      status TEXT NOT NULL,
      last_seen TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (team_id, machine_id)
    )
  `)
  console.log('PostgreSQL connected — events table ready')
  return true
}

export async function upsertMachineStatus(machine) {
  const db = getPool()
  await db.query(
    `INSERT INTO machine_status (team_id, machine_id, label, zone, address, status, last_seen)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (team_id, machine_id) DO UPDATE SET
       label = EXCLUDED.label, zone = EXCLUDED.zone, address = EXCLUDED.address,
       status = EXCLUDED.status, last_seen = EXCLUDED.last_seen`,
    [machine.team_id, machine.machine_id, machine.label, machine.zone,
      machine.address, machine.status, machine.last_seen]
  )
}

export async function getMachineStatuses() {
  const db = getPool()
  const { rows } = await db.query('SELECT * FROM machine_status ORDER BY team_id, machine_id')
  return rows
}

export async function insertEvent(event) {
  const db = getPool()
  await db.query(
    `INSERT INTO events (id, team_id, timestamp, tool, target, result, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [event.id, event.team_id, event.timestamp, event.tool, event.target, event.result, event.details]
  )
}

export async function getEvents(limit = 100) {
  const db = getPool()
  const { rows } = await db.query(
    `SELECT * FROM events ORDER BY timestamp DESC LIMIT $1`,
    [limit]
  )
  return rows.reverse()
}
