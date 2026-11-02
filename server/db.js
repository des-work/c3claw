import pg from 'pg'

const { Pool } = pg
let pool = null

export function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    })
  }
  return pool
}

export async function initDb() {
  const db = getPool()
  if (!db) return false
  await db.query(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tool TEXT NOT NULL, target TEXT NOT NULL, result TEXT NOT NULL, details TEXT DEFAULT '',
    source_id TEXT
  )`)
  await db.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS source_id TEXT')
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS events_source_id_unique ON events (source_id) WHERE source_id IS NOT NULL')
  await db.query('CREATE INDEX IF NOT EXISTS events_recent_idx ON events (timestamp DESC, id DESC)')
  await db.query(`CREATE TABLE IF NOT EXISTS team_status (
    team_id TEXT PRIMARY KEY, last_seen TIMESTAMPTZ NOT NULL, last_action TEXT NOT NULL,
    event_count BIGINT NOT NULL, blocked_count BIGINT NOT NULL
  )`)
  // Backfill once for deployments with event history; normal reads use this small table.
  const { rows: summaryExists } = await db.query('SELECT 1 FROM team_status LIMIT 1')
  if (!summaryExists.length) await db.query(`INSERT INTO team_status (team_id, last_seen, last_action, event_count, blocked_count)
    SELECT latest.team_id, latest.timestamp,
      latest.tool || ' → ' || latest.target || ' [' || latest.result || ']',
      totals.event_count, totals.blocked_count
    FROM (SELECT DISTINCT ON (team_id) * FROM events ORDER BY team_id, timestamp DESC, id DESC) latest
    JOIN (SELECT team_id, COUNT(*) AS event_count,
      COUNT(*) FILTER (WHERE UPPER(result) = 'BLOCKED') AS blocked_count
      FROM events GROUP BY team_id) totals USING (team_id)
    ON CONFLICT (team_id) DO NOTHING`)
  await db.query(`CREATE TABLE IF NOT EXISTS machine_status (
    team_id TEXT NOT NULL, machine_id TEXT NOT NULL, label TEXT NOT NULL, zone TEXT NOT NULL,
    address TEXT, status TEXT NOT NULL, last_seen TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (team_id, machine_id)
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS discord_cursors (
    channel_id TEXT PRIMARY KEY, message_id TEXT NOT NULL
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS discord_rejections (
    message_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, reason TEXT NOT NULL,
    content TEXT NOT NULL, rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  console.log('PostgreSQL connected — events, summaries, and machines ready')
  return true
}

export async function upsertMachineStatus(machine) {
  await getPool().query(`INSERT INTO machine_status (team_id, machine_id, label, zone, address, status, last_seen)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (team_id, machine_id) DO UPDATE SET
      label = EXCLUDED.label, zone = EXCLUDED.zone, address = EXCLUDED.address,
      status = EXCLUDED.status, last_seen = EXCLUDED.last_seen`,
  [machine.team_id, machine.machine_id, machine.label, machine.zone,
    machine.address, machine.status, machine.last_seen])
}

export async function getMachineStatuses() {
  const { rows } = await getPool().query('SELECT * FROM machine_status ORDER BY team_id, machine_id')
  return rows
}

export async function insertEvent(event) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`INSERT INTO events
      (id, team_id, timestamp, tool, target, result, details, source_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING RETURNING *`,
    [event.id, event.team_id, event.timestamp, event.tool, event.target,
      event.result, event.details, event.source_id])
    if (!rows.length) {
      const existing = await client.query('SELECT * FROM events WHERE source_id = $1', [event.source_id])
      if (!existing.rows.length) throw new Error('Event ID collision')
      const saved = existing.rows[0]
      if (['team_id', 'tool', 'target', 'result', 'details'].some(field => saved[field] !== event[field])) {
        const conflict = new Error('source_id already used for different telemetry')
        conflict.code = 'SOURCE_CONFLICT'
        throw conflict
      }
      await client.query('COMMIT')
      return { event: saved, duplicate: true }
    }
    await client.query(`INSERT INTO team_status
      (team_id, last_seen, last_action, event_count, blocked_count)
      VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT (team_id) DO UPDATE SET
        event_count = team_status.event_count + 1,
        blocked_count = team_status.blocked_count + EXCLUDED.blocked_count,
        last_seen = GREATEST(team_status.last_seen, EXCLUDED.last_seen),
        last_action = CASE WHEN EXCLUDED.last_seen >= team_status.last_seen
          THEN EXCLUDED.last_action ELSE team_status.last_action END`,
    [event.team_id, event.timestamp, `${event.tool} → ${event.target} [${event.result}]`,
      event.result.toUpperCase() === 'BLOCKED' ? 1 : 0])
    await client.query('COMMIT')
    return { event: rows[0], duplicate: false }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getEvents(limit = 100) {
  const { rows } = await getPool().query(
    'SELECT * FROM events ORDER BY timestamp DESC, id DESC LIMIT $1', [limit])
  return rows.reverse()
}

export async function getTeamStatuses() {
  const { rows } = await getPool().query('SELECT * FROM team_status ORDER BY team_id')
  return rows
}

export async function getDiscordCursor(channelId) {
  const { rows } = await getPool().query(
    'SELECT message_id FROM discord_cursors WHERE channel_id = $1', [channelId])
  return rows[0]?.message_id || null
}

export async function saveDiscordCursor(channelId, messageId) {
  await getPool().query(`INSERT INTO discord_cursors (channel_id, message_id)
    VALUES ($1, $2) ON CONFLICT (channel_id) DO UPDATE SET message_id = EXCLUDED.message_id
    WHERE discord_cursors.message_id::numeric < EXCLUDED.message_id::numeric`,
  [channelId, messageId])
}

export async function recordDiscordRejection(message, reason) {
  await getPool().query(`INSERT INTO discord_rejections (message_id, channel_id, reason, content)
    VALUES ($1, $2, $3, $4) ON CONFLICT (message_id) DO NOTHING`,
  [message.id, message.channelId, reason.slice(0, 500), message.content.slice(0, 2000)])
}

export async function getDiscordRejectionCount() {
  const { rows } = await getPool().query('SELECT COUNT(*) AS count FROM discord_rejections')
  return Number(rows[0].count)
}
