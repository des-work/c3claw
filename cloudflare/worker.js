import { createHash, timingSafeEqual } from 'node:crypto'
import { parseEvent, statusFromSummary } from '../shared/events.js'
import { parseTopology, attachTopology, MACHINE_STATES, MACHINE_ZONES } from '../shared/topology.js'
import { mergeEnrollmentInventory, parseEnrollmentSnapshot } from '../shared/enrollment.js'
import { Store } from './store.js'
import { syncDiscord, discordHealth } from './discord.js'
import { syncBackend } from './backend.js'
import { STANDARD_POLICY, machineFreshness } from '../shared/refresh-policy.js'

const MAX_BODY = 16_384
const ID = /^[A-Za-z0-9_-]{1,64}$/
const securityHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }
function json(body, status = 200) { return Response.json(body, { status, headers: securityHeaders }) }
function snapshotJson(body, request) {
  const privateRequest = ['authorization', 'cookie', 'cf-access-jwt-assertion'].some(name => request.headers.has(name))
  return Response.json(body, { headers: { ...securityHeaders,
    'Cache-Control': privateRequest ? 'private, no-store' : `public, max-age=${STANDARD_POLICY.cache_seconds}, must-revalidate`,
    'X-Snapshot-At': body.generated_at || new Date().toISOString(),
  } })
}
function authorized(request, secret) {
  const actual = request.headers.get('authorization') || ''
  if (!secret || actual.length > 1024) return false
  const digest = value => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(actual), digest(`Bearer ${secret}`))
}
export async function requestJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Content-Type must be application/json'); error.status = 415; throw error
  }
  const reader = request.body?.getReader()
  if (!reader) { const error = new Error('JSON body is required'); error.status = 400; throw error }
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY) { const error = new Error('Request exceeds 16 KiB'); error.status = 413; throw error }
      chunks.push(Buffer.from(value))
    }
  } finally { await reader.cancel() }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
    const error = new Error('Invalid JSON'); error.status = 400; throw error
  }
}
export function topology(env) {
  if (!env.TOPOLOGY_JSON) return []
  if (env.TOPOLOGY_JSON.length > 1024 * 1024) throw new Error('Topology configuration exceeds 1 MiB')
  const inventory = parseTopology(JSON.parse(env.TOPOLOGY_JSON))
  const teams = new Set()
  for (const team of inventory) {
    if (!ID.test(team.team_id) || teams.has(team.team_id) || team.machines.length > 200) throw new Error('Invalid or duplicate topology team')
    teams.add(team.team_id)
    const machines = new Set()
    for (const machine of team.machines) {
      if (!ID.test(machine.machine_id) || machines.has(machine.machine_id) || machine.label.length > 80 ||
          (machine.address && machine.address.length > 120)) throw new Error('Invalid or duplicate topology machine')
      machines.add(machine.machine_id)
    }
  }
  if (inventory.length > 1000) throw new Error('Topology exceeds 1000 teams')
  return inventory
}

export async function health(store, env) {
  await store.first('SELECT id FROM events LIMIT 1')
  const discord = await discordHealth(store, env)
  const backend = env.TELEMETRY_SOURCE === 'backend' ? (await store.state('backend') || { enabled: true }) : { enabled: false }
  const enrollment = env.BACKEND_EXPORT_URL ? (await store.state('enrollment') || { enabled: true }) : { enabled: false }
  const problems = []
  const stale = value => !value || !Number.isFinite(Date.parse(value)) || Date.now() - Date.parse(value) > STANDARD_POLICY.sync_stale_after_seconds * 1000
  if (!env.EVENT_API_KEY) problems.push('event_api_key_missing')
  if (!['discord', 'backend'].includes(env.TELEMETRY_SOURCE)) problems.push('telemetry_source_missing')
  if (env.TELEMETRY_SOURCE === 'discord' && (!discord.configured || discord.failed_channels ||
      discord.synced_channels !== discord.channels || stale(discord.oldest_sync))) problems.push('discord_not_current')
  if (env.TELEMETRY_SOURCE === 'backend' && (!env.BACKEND_EXPORT_URL || !env.BACKEND_EXPORT_SECRET ||
      backend.last_error || stale(backend.last_success) || backend.pending_events > 0)) problems.push('backend_not_current')
  if (enrollment.enabled && (enrollment.last_error || stale(enrollment.last_success))) problems.push('enrollment_not_current')
  const count = await store.first('SELECT COUNT(*) AS count FROM discord_rejections')
  return { status: problems.length ? 'degraded' : 'ok', persistence: 'd1', hosting: 'cloudflare-workers',
    release: env.RELEASE_ID || 'unknown', semester_start_at: env.SEMESTER_START_AT,
    policy: STANDARD_POLICY, problems, discord, backend_sync: backend, enrollment_sync: enrollment, discord_rejections: count.count }
}

async function teamsFor(store, env) {
  const [summaries, machines, saved] = await Promise.all([
    store.rows('SELECT * FROM team_status ORDER BY team_id'),
    store.rows('SELECT * FROM machine_status ORDER BY team_id, machine_id'), store.snapshot(),
  ])
  const enrollment = saved ? parseEnrollmentSnapshot(saved.payload).teams : []
  return attachTopology(summaries.map(summary => statusFromSummary(summary)),
    mergeEnrollmentInventory(topology(env), enrollment), machines, Date.now(), machineFreshness())
}

export async function handleApi(request, env) {
  const url = new URL(request.url)
  const store = new Store(env.DB)
  if (request.method === 'GET' && url.pathname === '/api/dashboard') {
    const [teams, events, pipelineHealth] = await Promise.all([teamsFor(store, env), store.recent(20), health(store, env)])
    return snapshotJson({ generated_at: new Date().toISOString(), policy: STANDARD_POLICY,
      teams, events, health: pipelineHealth }, request)
  }
  if (request.method === 'GET' && url.pathname === '/api/health') {
    const body = await health(store, env)
    return json(body, body.status === 'ok' ? 200 : 503)
  }
  if (request.method === 'GET' && url.pathname === '/api/events') {
    const requested = Number(url.searchParams.get('limit'))
    const limit = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, 100) : 100
    return snapshotJson(await store.recent(limit), request)
  }
  if (request.method === 'GET' && url.pathname === '/api/status') {
    return snapshotJson(await teamsFor(store, env), request)
  }
  if (request.method === 'POST' && ['/api/events', '/api/machines/heartbeat'].includes(url.pathname)) {
    if (!env.EVENT_API_KEY) return json({ error: 'Event ingestion is not configured' }, 503)
    if (!authorized(request, env.EVENT_API_KEY)) return json({ error: 'Invalid or missing API key' }, 401)
    const payload = await requestJson(request)
    if (url.pathname === '/api/events') {
      const event = parseEvent(payload)
      if (!event || /^(discord|backend):/.test(event.source_id || '')) {
        return json({ error: 'Invalid event fields or reserved source ID' }, 400)
      }
      if (!Number.isFinite(Date.parse(env.SEMESTER_START_AT)) || Date.parse(event.timestamp) < Date.parse(env.SEMESTER_START_AT)) {
        return json({ error: 'Event predates the active semester; retain it in the historical archive' }, 422)
      }
      const saved = await store.ingest(event)
      return json({ ...saved.event, duplicate: saved.duplicate }, saved.duplicate ? 200 : 201)
    }
    const { team_id, machine_id, label, zone, address, status } = payload || {}
    if (typeof team_id !== 'string' || !ID.test(team_id) || typeof machine_id !== 'string' || !ID.test(machine_id) || !MACHINE_ZONES.includes(zone) ||
        !MACHINE_STATES.includes(status) ||
        (label !== undefined && (typeof label !== 'string' || label.length > 80)) ||
        (address !== undefined && (typeof address !== 'string' || address.length > 120))) {
      return json({ error: 'Invalid machine report' }, 400)
    }
    const configured = topology(env).find(team => team.team_id === team_id)?.machines.find(machine => machine.machine_id === machine_id)
    const machine = { team_id, machine_id, label: label || configured?.label || machine_id,
      zone: configured?.zone || zone, address: address || configured?.address || null,
      status, last_seen: new Date().toISOString() }
    const receipt = await store.heartbeat(machine, STANDARD_POLICY.heartbeat_seconds)
    if (!receipt.meta.changes) return Response.json({ error: 'Standard reporting allows one heartbeat per machine every five minutes',
      retry_after_seconds: STANDARD_POLICY.heartbeat_seconds }, { status: 429,
      headers: { ...securityHeaders, 'Retry-After': String(STANDARD_POLICY.heartbeat_seconds) } })
    return json(machine, 201)
  }
  return json({ error: 'Unknown API endpoint or method' }, 404)
}

export async function runScheduled(env, fetchFn = fetch) {
  const store = new Store(env.DB)
  const owner = await store.lease()
  if (!owner) return
  try {
    const inventory = topology(env)
    if (env.TELEMETRY_SOURCE === 'discord' && env.DISCORD_BOT_TOKEN) await syncDiscord(store, env, fetchFn)
    await syncBackend(store, env, inventory, fetchFn)
    console.log(JSON.stringify({ process: 'scheduled-sync',
      outcome: env.TELEMETRY_SOURCE === 'discord' && !env.DISCORD_BOT_TOKEN ? 'awaiting_discord_configuration' : 'completed',
      release: env.RELEASE_ID }))
  } catch {
    console.error(JSON.stringify({ process: 'scheduled-sync', outcome: 'failed', action: 'Check source configuration and service health; durable checkpoints retained' }))
    throw new Error('Scheduled synchronization failed; durable checkpoints retained')
  } finally { await store.release(owner) }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname
    if (pathname !== '/api' && !pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try { return await handleApi(request, env) } catch (error) {
      if (error.status) return json({ error: error.message }, error.status)
      if (String(error.message).includes('SOURCE_CONFLICT')) return json({ error: 'source_id already used for different telemetry' }, 409)
      const requestId = crypto.randomUUID()
      console.error(JSON.stringify({ process: 'api', request_id: requestId, outcome: 'failed' }))
      return json({ error: 'Request failed; contact the administrator', request_id: requestId }, 503)
    }
  },
  async scheduled(_controller, env) { await runScheduled(env) },
}
