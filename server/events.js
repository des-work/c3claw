import { randomUUID } from 'node:crypto'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX = { tool: 100, target: 200, result: 40, details: 2000 }

export function parseEvent(input) {
  if (!input || typeof input !== 'object' || !ID.test(input.team_id || '')) return null
  for (const field of ['tool', 'target', 'result']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > MAX[field]) return null
  }
  if (input.details !== undefined && (typeof input.details !== 'string' || input.details.length > MAX.details)) return null
  if (input.source_id !== undefined &&
      (typeof input.source_id !== 'string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(input.source_id))) return null
  return {
    id: randomUUID(), team_id: input.team_id, timestamp: new Date().toISOString(),
    tool: input.tool.trim(), target: input.target.trim(), result: input.result.trim(),
    details: input.details || '', source_id: input.source_id || null,
  }
}

export function statusFromSummary(summary, now = Date.now()) {
  const age = now - Date.parse(summary.last_seen)
  const status = !Number.isFinite(age) ? 'unknown' : age > 15 * 60_000 ? 'offline' :
    age > 5 * 60_000 ? 'idle' : age > 60_000 ? 'degraded' : 'online'
  return { ...summary, status, phase: null, cidr: null }
}

export function updateSummary(previous, event) {
  return {
    team_id: event.team_id, last_seen: event.timestamp,
    last_action: `${event.tool} → ${event.target} [${event.result}]`,
    event_count: (previous?.event_count || 0) + 1,
    blocked_count: (previous?.blocked_count || 0) + (event.result.toUpperCase() === 'BLOCKED' ? 1 : 0),
  }
}
