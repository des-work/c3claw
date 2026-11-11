import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEvent, statusFromSummary, updateSummary } from '../server/events.js'
import { parseDiscordTelemetry, replayHistory } from '../server/bot.js'
import { mapBackendEvent, syncBackendOnce } from '../server/backend-sync.js'
import { poolConfig } from '../server/db.js'

test('Discord telemetry retains details and rejects incomplete records', () => {
  assert.deepEqual(parseDiscordTelemetry('[OCRT] Brown_01 | Nmap | 10.0.1.1 | BLOCKED | first | second'), {
    team_id: 'Brown_01', tool: 'Nmap', target: '10.0.1.1', result: 'BLOCKED',
    details: 'first | second',
  })
  assert.equal(parseDiscordTelemetry('[OCRT] Brown_01 | Nmap | 10.0.1.1'), false)
  assert.equal(parseDiscordTelemetry('unrelated'), null)
})

test('Discord telemetry accepts the deployed agents’ labeled OCRT REPORT form', () => {
  // Exact shape captured from a live agent in #hermes-hivemind.
  const report = '=== OCRT REPORT (synthetic test) ===\nTeam: Kassandra_03\nTechnique: rce\n' +
    'Target: 10.0.1.1 (synthetic)\nResult: success\nDetails: synthetic finding, no real exploitation'
  assert.deepEqual(parseDiscordTelemetry(report), {
    team_id: 'Kassandra_03', tool: 'rce', target: '10.0.1.1 (synthetic)', result: 'success',
    details: 'synthetic finding, no real exploitation',
  })
  // Header present but a required field missing -> malformed (counted), not skipped.
  assert.equal(parseDiscordTelemetry('=== OCRT REPORT ===\nTeam: K1\nTechnique: rce\nTarget: 1.2.3.4'), false)
  // Operational chatter on the same webhook is not a report -> skipped.
  assert.equal(parseDiscordTelemetry('Day 0 init test'), null)
  assert.equal(parseDiscordTelemetry('CVE check run at 2026-11-10 10:11 PST'), null)
})

test('event IDs are collision resistant and malformed payloads are rejected', () => {
  const input = { team_id: 'Brown_01', tool: 'Nmap', target: '10.0.1.1', result: 'BLOCKED',
    source_id: 'discord:1234567890123456789' }
  const events = Array.from({ length: 1000 }, () => parseEvent(input))
  assert.equal(new Set(events.map(event => event.id)).size, 1000)
  assert.equal(parseEvent({ ...input, team_id: 'bad team' }), null)
  assert.equal(parseEvent({ ...input, details: 42 }), null)
  assert.equal(parseEvent({ ...input, result: '' }), null)
})

test('database URL SSL parameters cannot disable remote certificate verification', () => {
  const config = poolConfig('postgresql://user:pass@db.example:5432/claw?sslmode=no-verify', '')
  assert.equal(config.ssl.rejectUnauthorized, true)
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false)
  assert.equal(poolConfig('postgresql://user:pass@127.0.0.1:5432/claw', '').ssl, false)
})

test('team summary counts all events beyond the old 10,000 event cutoff', () => {
  const event = parseEvent({ team_id: 'NewClass_01', tool: 'Nmap', target: '10.0.1.1', result: 'blocked' })
  let summary
  for (let i = 0; i < 12_000; i++) summary = updateSummary(summary, event)
  assert.equal(summary.event_count, 12_000)
  assert.equal(summary.blocked_count, 12_000)
  assert.equal(statusFromSummary(summary, Date.parse(event.timestamp) + 61_000).status, 'degraded')
  assert.equal(statusFromSummary(summary, Date.parse(event.timestamp) + 16 * 60_000).status, 'offline')
  assert.equal(statusFromSummary(summary).cidr, null)
})

test('Discord replay pages through more than 100 messages in chronological order', async () => {
  const messages = Array.from({ length: 275 }, (_, index) => ({ id: String(index + 1) }))
  const channel = { messages: { async fetch({ limit, before }) {
    const visible = messages.filter(message => !before || BigInt(message.id) < BigInt(before))
    const page = visible.slice(-limit).reverse()
    const collection = new Map(page.map(message => [message.id, message]))
    collection.first = () => page[0]
    return collection
  } } }
  const seen = []
  await replayHistory(channel, '5', async message => seen.push(Number(message.id)))
  assert.equal(seen.length, 270)
  assert.equal(seen[0], 6)
  assert.equal(seen.at(-1), 275)
  assert.deepEqual(seen, Array.from({ length: 270 }, (_, index) => index + 6))
})

test('scoring event delivery stores before acknowledgement and preserves original time', async () => {
  const base = { team_id: 'Brown_01', timestamp: '2026-11-02T12:00:00Z',
    technique: 'port_scan', target_ip: '10.50.1.1', result: 'success', phase: 1, milestone: null }
  assert.equal(mapBackendEvent({ ...base, id: 1, technique: 'heartbeat' }), null)
  assert.equal(mapBackendEvent({ ...base, id: 2 }).timestamp, '2026-11-02T12:00:00.000Z')
  let cursor = 0
  const saved = []
  const ingested = []
  const acknowledged = []
  const result = await syncBackendOnce({ baseUrl: 'https://backend.example', secret: 'test',
    getCursor: async () => cursor,
    saveCursor: async id => { cursor = id; saved.push(id) },
    ingest: async event => { ingested.push(event); return { duplicate: false } },
    fetchFn: async (url, options) => {
      assert.equal(options.headers['X-Export-Secret'], 'test')
      if (options.method === 'POST') {
        acknowledged.push(...JSON.parse(options.body).event_ids)
        assert.equal(ingested.length, 1)
        return { ok: true }
      }
      return Response.json({
        events: [{ ...base, id: 1, technique: 'heartbeat' }, { ...base, id: 2 }],
        head_id: 2, pending: 2, has_more: false,
      })
    },
  })
  assert.deepEqual(result, { cursor: 2, sourceHead: 2, pendingEvents: 0, imported: 1 })
  assert.deepEqual(saved, [2])
  assert.deepEqual(acknowledged, [1, 2])
  assert.equal(ingested[0].source_id, 'backend:2')
})

test('scoring delivery remains unacknowledged when an event fails to store', async () => {
  let saved = false
  let acknowledged = false
  await assert.rejects(syncBackendOnce({ baseUrl: 'https://backend.example', secret: 'test',
    getCursor: async () => 0, saveCursor: async () => { saved = true },
    ingest: async () => { throw new Error('database unavailable') },
    fetchFn: async (url, options) => {
      if (options.method === 'POST') acknowledged = true
      return Response.json({ events: [{
      id: 1, team_id: 'Brown_01', timestamp: '2026-11-02T12:00:00Z',
      technique: 'port_scan', target_ip: '10.50.1.1', result: 'success', phase: 1,
    }], pending: 1, has_more: false })
    },
  }), /database unavailable/)
  assert.equal(saved, false)
  assert.equal(acknowledged, false)
})

test('a late lower ID is imported even after a higher ID was acknowledged', async () => {
  const ingested = []
  const result = await syncBackendOnce({ baseUrl: 'https://backend.example', secret: 'test',
    getCursor: async () => 20, saveCursor: async () => { throw new Error('cursor should not move') },
    ingest: async event => { ingested.push(event.source_id); return { duplicate: false } },
    fetchFn: async (url, options) => options.method === 'POST' ? { ok: true } :
      Response.json({ events: [{
        id: 10, team_id: 'Brown_01', timestamp: '2026-11-02T12:00:00Z',
        technique: 'port_scan', target_ip: '10.50.1.1', result: 'success', phase: 1,
      }], head_id: 20, pending: 1, has_more: false }),
  })
  assert.deepEqual(ingested, ['backend:10'])
  assert.equal(result.pendingEvents, 0)
})
