import test from 'node:test'
import assert from 'node:assert/strict'
import { telemetryPreflight } from '../scripts/telemetry-preflight.js'
import { initialCursor } from '../cloudflare/discord.js'

const channel = '1566980646046408854'
const webhook = '1568087312821133323'
const guild = '903743840014434365'
const bot = '1566968501686771894'
const start = '2026-11-04T00:00:00.000Z'
const floor = BigInt(initialCursor(start))
const config = { DISCORD_BOT_TOKEN: 'private-test-token', EVENT_API_KEY: 'private-write-key', SEMESTER_START_AT: start,
  ALLOWED_CHANNELS: channel, DISCORD_SOURCE_POLICY_JSON: JSON.stringify({ version: 1,
    sources: [{ channel_id: channel, webhook_id: webhook, team_ids: ['AuditOnly'] }] }) }

function mockDiscord({ permissions = '66560', messages = [] } = {}) {
  return async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bot private-test-token')
    assert.equal(options.redirect, 'error')
    assert.equal(options.method, undefined) // GET-only, never sends a message.
    const path = new URL(url).pathname
    if (path.endsWith('/users/@me')) return Response.json({ id: bot, bot: true })
    if (path.endsWith(`/channels/${channel}`)) return Response.json({ guild_id: guild, type: 0, permission_overwrites: [] })
    if (path.endsWith(`/members/${bot}`)) return Response.json({ user: { id: bot }, roles: [] })
    if (path.endsWith('/roles')) return Response.json([{ id: guild, permissions }])
    if (path.endsWith('/messages')) return Response.json(messages)
    throw new Error('Unexpected mock request')
  }
}

test('offline preflight names missing inputs and makes no network requests', async () => {
  const report = await telemetryPreflight({}, { fetchFn: () => { throw new Error('Must not connect') } })
  assert.equal(report.reader.checked, false)
  assert.deepEqual(report.configuration.missing_settings, ['DISCORD_BOT_TOKEN', 'ALLOWED_CHANNELS', 'DISCORD_SOURCE_POLICY_JSON'])
  assert.equal(report.semester_cutover_valid, false)
  assert.equal(report.inventory.configured, false)
  assert.equal(report.production_delivery_verified, false)
})

test('read-only preflight separates webhook telemetry from native replies, old history and forged sources', async () => {
  const message = (offset, content, hook = webhook) => ({ id: String(floor + BigInt(offset)), content, webhook_id: hook })
  const fetchFn = mockDiscord({ messages: [
    message(1, '[OCRT] AuditOnly | audit | 192.0.2.1 | SUCCESS | private-message-details'),
    message(2, '[OCRT] AuditOnly | audit | 192.0.2.1 | SUCCESS', null),
    message(3, 'Cronjob Response: CVE-reporter. UniqueID:<id>, TeamID:<team>, Success/Failure.'),
    message(4, '[OCRT] malformed'), message(5, ''), message(-1, '[OCRT] AuditOnly | audit | 192.0.2.1 | SUCCESS'),
  ] })
  const report = await telemetryPreflight(config, { network: true, fetchFn })
  assert.equal(report.reader.access_verified, true)
  assert.deepEqual(report.reader.channels[0].sample, { total: 6, before_cutover: 1, empty_content: 1,
    non_telemetry: 1, malformed: 1, untrusted_source: 1, authorized_telemetry: 1 })
  assert.equal(report.reader.channels[0].publisher_contract_observed, true)
  assert.equal(report.production_delivery_verified, false)
  assert.doesNotMatch(JSON.stringify(report), /private-test-token|private-write-key|private-message-details|UniqueID/)
})

test('read-only preflight stops at rate limiting and never emits upstream error bodies or secrets', async () => {
  let calls = 0
  const report = await telemetryPreflight(config, { network: true, fetchFn: async () => {
    calls++
    return Response.json({ token: 'private-test-token', private_details: 'do-not-print' }, { status: 429 })
  } })
  assert.equal(calls, 1)
  assert.match(report.reader.error, /HTTP 429/)
  assert.equal(report.reader.access_verified, false)
  assert.doesNotMatch(JSON.stringify(report), /private-test-token|do-not-print/)
})

test('effective permission denial is reported without attempting to read channel messages', async () => {
  const report = await telemetryPreflight(config, { network: true, fetchFn: mockDiscord({ permissions: '0' }) })
  assert.equal(report.reader.access_verified, false)
  assert.equal(report.reader.channels[0].readable, false)
  assert.match(report.reader.channels[0].error, /View Channel/)
  assert.equal(report.reader.channels[0].sample, undefined)
})
