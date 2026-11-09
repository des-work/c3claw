import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare'
import { Store } from './store.js'
import { pollChannel, initialCursor, syncDiscord, discordHealth } from './discord.js'
import { syncBackend } from './backend.js'

const channel = '123456789012345678'
const webhook = '123456789012345679'
const guild = '123456789012345680'
const bot = '123456789012345681'
const startAt = '2026-11-04T00:00:00.000Z'
const floor = BigInt(initialCursor(startAt))
const policy = new Map([[`${channel}:${webhook}`, new Set(['ClassA_01'])]])
const envConfig = { TELEMETRY_SOURCE: 'discord', EVENT_API_KEY: 'test-only-secret', SEMESTER_START_AT: startAt,
  ALLOWED_CHANNELS: channel, DISCORD_BOT_TOKEN: 'fake-token',
  DISCORD_SOURCE_POLICY_JSON: JSON.stringify({ version: 1, sources: [{ channel_id: channel, webhook_id: webhook, team_ids: ['ClassA_01'] }] }) }

async function setup(t) {
  const options = convertV4MiniflareOptions({
    modules: true, scriptPath: '.cloudflare/output/v0/workers/default/bundle/index.js',
    compatibilityDate: '2026-11-04', compatibilityFlags: ['nodejs_compat'],
    bindings: envConfig, d1Databases: ['DB'], log: new Log(LogLevel.ERROR),
    outboundService: () => new Response('Real network disabled in tests', { status: 502 }),
  })
  options.enableDevRegistry = false
  const mf = new Miniflare(options)
  t.after(() => mf.dispose())
  const db = await mf.getD1Database('DB')
  const sql = await readFile(new URL('./migrations/0001_initial.sql', import.meta.url), 'utf8')
  const statements = sql.replace(/^--.*$/gm, '').split(/(?=^CREATE )/m).map(part => part.trim()).filter(part => part.startsWith('CREATE '))
  await db.batch(statements.map(statement => db.prepare(statement)))
  return { mf, db, store: new Store(db) }
}
const event = (overrides = {}) => ({ id: crypto.randomUUID(), team_id: 'ClassA_01',
  timestamp: '2026-11-04T00:01:00.000Z', tool: 'nmap', target: '192.0.2.1', result: 'SUCCESS', details: '',
  source_id: 'reporter:1', ...overrides })
const message = (number, overrides = {}) => ({ id: (floor + BigInt(number)).toString(), channel_id: channel,
  type: 0, content: '[OCRT] ClassA_01 | nmap | 192.0.2.1 | SUCCESS', webhook_id: webhook, ...overrides })
const history = messages => async url => {
  const parsed = new URL(url)
  if (parsed.pathname.endsWith('/messages')) {
    const before = parsed.searchParams.get('before')
    const limit = Number(parsed.searchParams.get('limit'))
    const batch = messages.filter(item => !before || BigInt(item.id) < BigInt(before))
      .sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, limit)
    return Response.json(batch)
  }
  if (parsed.pathname === '/api/v10/users/@me') return Response.json({ id: bot })
  if (parsed.pathname === `/api/v10/channels/${channel}`) return Response.json({ id: channel, guild_id: guild, type: 0, permission_overwrites: [] })
  if (parsed.pathname.endsWith(`/members/${bot}`)) return Response.json({ user: { id: bot }, roles: [] })
  if (parsed.pathname.endsWith('/roles')) return Response.json([{ id: guild, permissions: '66560' }])
  throw new Error(`Unexpected test request ${parsed.pathname}`)
}

test('Worker API persists events, deduplicates, rejects conflicts and keeps source timestamps', async t => {
  const { mf, store } = await setup(t)
  const post = (payload, key = 'test-only-secret') => mf.dispatchFetch('https://test.invalid/api/events', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })
  assert.equal((await post(event(), 'wrong')).status, 401)
  assert.equal((await post(event())).status, 201)
  assert.equal((await post(event())).status, 200)
  assert.equal((await post(event({ tool: 'changed' }))).status, 409)
  assert.equal((await post(event({ source_id: 'discord:forged' }))).status, 400)
  assert.equal((await post(event({ source_id: 'old:1', timestamp: '2026-04-20T00:00:00.000Z' }))).status, 422)
  assert.equal((await post({ ...event(), details: 'x'.repeat(20_000) })).status, 413)
  await store.ingest(event({ source_id: 'reporter:older', timestamp: '2026-11-04T00:00:00.000Z', tool: 'old' }))
  const summary = await store.first('SELECT * FROM team_status')
  assert.equal(summary.event_count, 2)
  assert.match(summary.last_action, /^nmap/)
  const response = await mf.dispatchFetch('https://test.invalid/api/events?limit=1')
  assert.match(response.headers.get('cache-control'), /max-age=60/)
  const recent = await response.json()
  assert.equal(recent.length, 1)
  assert.equal(recent[0].timestamp, '2026-11-04T00:01:00.000Z')
  const health = await mf.dispatchFetch('https://test.invalid/api/health')
  assert.equal(health.status, 503)
  assert.equal((await health.json()).persistence, 'd1')
})

test('D1 batch rollback retains the inbox and checkpoint when one event conflicts', async t => {
  const { store } = await setup(t)
  await store.ensureChannels([channel], floor.toString())
  await store.stage(channel, [message(1)], (floor + 1n).toString(), true)
  await store.ingest(event())
  await assert.rejects(store.commitDiscord(channel, [event({ source_id: 'new:1' }), event({ tool: 'conflict' })], [], (floor + 1n).toString()))
  assert.equal((await store.first('SELECT message_id FROM discord_cursors')).message_id, floor.toString())
  assert.equal((await store.rows('SELECT * FROM discord_inbox')).length, 1)
  assert.equal((await store.first('SELECT event_count FROM team_status')).event_count, 1)
})

test('Discord backlog spans invocations without gaps, rejects forged teams, and skips last semester', async t => {
  const { store } = await setup(t)
  const messages = [message(-1), ...Array.from({ length: 250 }, (_, i) => message(i + 1)),
    message(251, { content: '[OCRT] OtherTeam | nmap | 192.0.2.1 | SUCCESS' }),
    message(252, { webhook_id: '123456789012345699' }), message(253, { content: '[OCRT] broken' }),
    message(254, { content: 'ordinary conversation' })]
  await store.ensureChannels([channel], floor.toString())
  let complete = false
  for (let run = 0; run < 12 && !complete; run++) {
    const row = await store.first('SELECT * FROM discord_cursors')
    const result = await pollChannel(store, envConfig, row, policy, history(messages))
    complete = result.caughtUp
  }
  assert.equal(complete, true)
  assert.equal((await store.first('SELECT COUNT(*) AS count FROM events')).count, 250)
  assert.equal((await store.first('SELECT event_count FROM team_status')).event_count, 250)
  assert.equal((await store.rows('SELECT * FROM discord_rejections')).length, 3)
  assert.equal((await store.rows('SELECT * FROM discord_inbox')).length, 0)
  assert.equal((await store.first('SELECT message_id FROM discord_cursors')).message_id, message(254).id)
  const row = await store.first('SELECT * FROM discord_cursors')
  await pollChannel(store, envConfig, row, policy, history(messages))
  assert.equal((await store.first('SELECT event_count FROM team_status')).event_count, 250)
})

test('Discord permissions, rate limits and unreadable content preserve recovery state', async t => {
  const { store } = await setup(t)
  await store.ensureChannels([channel], floor.toString())
  const denied = async url => url.endsWith('/roles') ? Response.json([{ id: guild, permissions: '0' }]) : history([])(url)
  await syncDiscord(store, envConfig, denied)
  assert.match((await store.first('SELECT last_error FROM discord_cursors')).last_error, /View Channel/)
  await syncDiscord(store, envConfig, async () => Response.json({ retry_after: 120, global: true }, { status: 429 }))
  assert.ok((await store.state('discord-rate-limit')).retryAt > Date.now())
  assert.equal((await store.first('SELECT message_id FROM discord_cursors')).message_id, floor.toString())
  const row = await store.first('SELECT * FROM discord_cursors')
  await assert.rejects(pollChannel(store, envConfig, row, policy, history([message(1, { content: '' })])), /Unreadable/)
  assert.equal((await store.first('SELECT message_id FROM discord_cursors')).message_id, floor.toString())
  assert.equal((await store.rows('SELECT * FROM discord_inbox')).length, 1)
})

test('channels in local rate-limit cooldown do not starve other channels and resume when eligible', async t => {
  const { store } = await setup(t)
  const channels = [channel, '123456789012345682', '123456789012345683']
  const env = { ...envConfig, ALLOWED_CHANNELS: channels.join(','), DISCORD_SOURCE_POLICY_JSON: JSON.stringify({
    version: 1, sources: channels.map(channel_id => ({ channel_id, webhook_id: webhook, team_ids: ['ClassA_01'] })),
  }) }
  await store.ensureChannels(channels, floor.toString())
  for (const id of channels.slice(0, 2)) {
    await store.run('UPDATE discord_cursors SET last_attempt=?, retry_at=? WHERE channel_id=?',
      '2026-11-04T00:00:00.000Z', Date.now() + 3600_000, id)
  }
  await store.run('UPDATE discord_cursors SET last_attempt=? WHERE channel_id=?', '2026-11-04T00:01:00.000Z', channels[2])
  const requested = []
  const fetchFn = async url => {
    const match = new URL(url).pathname.match(/^\/api\/v10\/channels\/(\d+)$/)
    if (match) { requested.push(match[1]); return Response.json({ id: match[1], guild_id: guild, type: 0, permission_overwrites: [] }) }
    return history([])(url)
  }
  await syncDiscord(store, env, fetchFn)
  assert.deepEqual(requested, [channels[2]])
  assert.ok((await store.first('SELECT last_success FROM discord_cursors WHERE channel_id=?', channels[2])).last_success)
  assert.equal((await store.first('SELECT message_id FROM discord_cursors WHERE channel_id=?', channel)).message_id, floor.toString())
  for (const id of channels.slice(0, 2)) await store.run('UPDATE discord_cursors SET retry_at=0 WHERE channel_id=?', id)
  requested.length = 0
  await syncDiscord(store, env, fetchFn)
  assert.deepEqual(requested, channels.slice(0, 2))
})

test('source health distinguishes missing reader credentials from a valid source policy', async t => {
  const { store } = await setup(t)
  const result = await discordHealth(store, { ...envConfig, DISCORD_BOT_TOKEN: undefined })
  assert.equal(result.enabled, true)
  assert.equal(result.configured, false)
  assert.equal(result.policy_valid, true)
  assert.deepEqual(result.missing_settings, ['DISCORD_BOT_TOKEN'])
})

test('Backend acknowledgements follow durable D1 persistence and enrollment keeps last good snapshot', async t => {
  const { store } = await setup(t)
  const team = { team_id: 'ClassA_01', class_id: 'ClassA', term_id: '2026F', display_name: 'Team One', member_count: 3, cidr: null }
  const exported = { id: 1, timestamp: '2026-11-04T00:00:00.000Z', team_id: team.team_id,
    technique: 'nmap', target_ip: '192.0.2.1', result: 'success', phase: 1 }
  let acknowledgements = 0
  const env = { TELEMETRY_SOURCE: 'backend', SEMESTER_START_AT: startAt, BACKEND_EXPORT_URL: 'https://backend.example', BACKEND_EXPORT_SECRET: 'export-secret' }
  const fetchFn = async (url, options) => {
    assert.equal(options.headers['X-Export-Secret'], 'export-secret')
    assert.equal(options.redirect, 'error')
    if (url.pathname.includes('/teams/')) return Response.json({ version: 1, teams: [team] })
    if (url.pathname.endsWith('/export')) return Response.json({ events: [exported], has_more: false, pending: 1, head_id: 1 })
    assert.equal((await store.first('SELECT COUNT(*) AS count FROM events')).count, 1)
    acknowledgements++
    return Response.json({ ok: true })
  }
  await syncBackend(store, env, [], fetchFn)
  await syncBackend(store, env, [], fetchFn)
  assert.equal(acknowledgements, 2)
  assert.equal((await store.first('SELECT event_count FROM team_status')).event_count, 1)
  assert.equal((await store.snapshot()).payload.teams.length, 1)
  await syncBackend(store, { ...env, TELEMETRY_SOURCE: 'discord' }, [], async () => Response.json({ students: [] }))
  assert.equal((await store.snapshot()).payload.teams.length, 1)
  assert.match((await store.state('enrollment')).last_error, /last good/)
})

test('machine heartbeat is independent of activity and missing machines remain unknown', async t => {
  const { mf, store } = await setup(t)
  const payload = { team_id: 'ClassA_01', machine_id: 'web', zone: 'dmz', status: 'online' }
  const post = (body, key = 'test-only-secret') => mf.dispatchFetch('https://test.invalid/api/machines/heartbeat', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  assert.equal((await post(payload, 'wrong')).status, 401)
  assert.equal((await post({ ...payload, team_id: ['ClassA_01'] })).status, 400)
  await store.ingest(event())
  let status = await (await mf.dispatchFetch('https://test.invalid/api/status')).json()
  assert.equal(status[0].machines.length, 0)
  assert.equal((await post(payload)).status, 201)
  const limited = await post(payload)
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '300')
  assert.equal((await store.first('SELECT COUNT(*) AS count FROM machine_status')).count, 1)
  status = await (await mf.dispatchFetch('https://test.invalid/api/status')).json()
  assert.equal(status[0].machines[0].status, 'online')
  await store.run("UPDATE machine_status SET last_seen='2026-04-20T00:00:00.000Z'")
  status = await (await mf.dispatchFetch('https://test.invalid/api/status')).json()
  assert.equal(status[0].machines[0].status, 'offline')
})

test('combined snapshot includes standard timing, source health, shared-cache headers and private bypass', async t => {
  const { mf } = await setup(t)
  const response = await mf.dispatchFetch('https://test.invalid/api/dashboard')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60, must-revalidate')
  assert.equal(response.headers.get('vary'), 'Cookie, Authorization, Cf-Access-Jwt-Assertion')
  const snapshot = await response.json()
  assert.equal(snapshot.policy.refresh_seconds, 300)
  assert.equal(snapshot.policy.heartbeat_seconds, 300)
  assert.equal(snapshot.policy.degraded_after_seconds, 720)
  assert.equal(snapshot.policy.offline_after_seconds, 1200)
  assert.ok(Number.isFinite(Date.parse(snapshot.generated_at)))
  assert.deepEqual(snapshot.teams, [])
  assert.deepEqual(snapshot.events, [])
  assert.equal(snapshot.health.status, 'degraded')
  for (const headers of [{ authorization: 'Bearer private' }, { cookie: 'session=private' }, { 'cf-access-jwt-assertion': 'private' }]) {
    const privateResponse = await mf.dispatchFetch('https://test.invalid/api/dashboard', { headers })
    assert.equal(privateResponse.headers.get('cache-control'), 'private, no-store')
  }
  const health = await mf.dispatchFetch('https://test.invalid/api/health')
  assert.equal(health.headers.get('cache-control'), 'no-store')
})
