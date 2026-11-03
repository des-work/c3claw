import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDiscordSources, authorizedDiscordSource } from '../server/discord-sources.js'
import { parseEvent, updateSummary } from '../server/events.js'

const channel = '910000000000000001'
const otherChannel = '910000000000000002'
const webhook = '920000000000000001'
const source = { channel_id: channel, webhook_id: webhook, team_ids: ['ClassA_01'] }
const policy = sources => ({ version: 1, sources })

test('only the mapped webhook, channel and exact team can publish telemetry', () => {
  const mappings = parseDiscordSources(policy([source]), new Set([channel]))
  const message = { channelId: channel, webhookId: webhook }
  assert.equal(authorizedDiscordSource(mappings, message, 'ClassA_01'), true)
  assert.equal(authorizedDiscordSource(mappings, message, 'ClassA_02'), false)
  assert.equal(authorizedDiscordSource(mappings, message, 'ClassA_010'), false)
  assert.equal(authorizedDiscordSource(mappings, { ...message, webhookId: '920000000000000002' }, 'ClassA_01'), false)
  assert.equal(authorizedDiscordSource(mappings, { ...message, channelId: otherChannel }, 'ClassA_01'), false)
  assert.equal(authorizedDiscordSource(mappings, { channelId: channel, author: { bot: true } }, 'ClassA_01'), false)
  assert.equal(authorizedDiscordSource(mappings, { channelId: channel, webhookId: null }, 'ClassA_01'), false)
})

test('source policy requires explicit, complete, unambiguous mappings', () => {
  const channels = new Set([channel])
  for (const input of [
    policy([]), policy([source, source]), policy([{ ...source, team_ids: ['ClassA_01', 'ClassA_01'] }]),
    policy([{ ...source, team_ids: ['ClassA_*'] }]), policy([{ ...source, webhook_id: 123 }]),
    policy([{ ...source, extra: 'ignored?' }]), { ...policy([source]), unknown: true },
    policy([{ ...source, channel_id: otherChannel }]),
  ]) assert.throws(() => parseDiscordSources(input, channels))
  assert.throws(() => parseDiscordSources(policy([source]), new Set([channel, otherChannel])))
  const mappings = parseDiscordSources(policy([source, { channel_id: otherChannel,
    webhook_id: '920000000000000002', team_ids: ['ClassB_01', 'ClassB_02'] }]), new Set([channel, otherChannel]))
  assert.equal(authorizedDiscordSource(mappings, { channelId: otherChannel, webhookId: '920000000000000002' }, 'ClassB_02'), true)
})

test('replayed event time is preserved and late history cannot replace the latest action', () => {
  const input = { team_id: 'ClassA_01', tool: 'Nmap', target: '10.50.1.10', result: 'SUCCESS' }
  const latest = parseEvent({ ...input, timestamp: '2026-01-03T00:00:00Z' })
  const older = parseEvent({ ...input, result: 'BLOCKED', timestamp: '2026-01-02T00:00:00+00:00' })
  assert.equal(older.timestamp, '2026-01-02T00:00:00.000Z')
  const summary = updateSummary(updateSummary(undefined, latest), older)
  assert.equal(summary.last_seen, latest.timestamp)
  assert.equal(summary.last_action, 'Nmap → 10.50.1.10 [SUCCESS]')
  assert.equal(summary.event_count, 2)
  assert.equal(summary.blocked_count, 1)
  for (const timestamp of ['not-a-date', '2026-01-01', 1, null, new Date(Date.now() + 120_000).toISOString()]) {
    assert.equal(parseEvent({ ...input, timestamp }), null)
  }
  assert.ok(Math.abs(Date.parse(parseEvent(input).timestamp) - Date.now()) < 1000)
})
