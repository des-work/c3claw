import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEvent, statusFromSummary, updateSummary } from '../server/events.js'
import { parseDiscordTelemetry, replayHistory } from '../server/bot.js'

test('Discord telemetry retains details and rejects incomplete records', () => {
  assert.deepEqual(parseDiscordTelemetry('[OCRT] Brown_01 | Nmap | 10.0.1.1 | BLOCKED | first | second'), {
    team_id: 'Brown_01', tool: 'Nmap', target: '10.0.1.1', result: 'BLOCKED',
    details: 'first | second',
  })
  assert.equal(parseDiscordTelemetry('[OCRT] Brown_01 | Nmap | 10.0.1.1'), false)
  assert.equal(parseDiscordTelemetry('unrelated'), null)
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
    return new Map(page.map(message => [message.id, message]))
  } } }
  const seen = []
  await replayHistory(channel, '5', async message => seen.push(Number(message.id)))
  assert.equal(seen.length, 270)
  assert.equal(seen[0], 6)
  assert.equal(seen.at(-1), 275)
  assert.deepEqual(seen, Array.from({ length: 270 }, (_, index) => index + 6))
})
