import test from 'node:test'
import assert from 'node:assert/strict'
import { initialCursor, effectivePermissions, discordPolicy, discordConfiguration } from '../cloudflare/discord.js'
import { topology, requestJson } from '../cloudflare/worker.js'

test('Cloudflare cutover is explicit and webhook policy cannot authorize another team', () => {
  const start = '2026-11-04T00:00:00.000Z'
  assert.equal(Number((BigInt(initialCursor(start)) >> 22n) + 1420070400000n), Date.parse(start))
  assert.throws(() => initialCursor('invalid'))
  assert.throws(() => initialCursor(new Date(Date.now() + 120_000).toISOString()))
  assert.throws(() => discordPolicy({ ALLOWED_CHANNELS: '123456789012345678' }))
  assert.throws(() => topology({ TOPOLOGY_JSON: JSON.stringify({ teams: [
    { team_id: 'ClassA_01', machines: [{ machine_id: 'web', zone: 'dmz' }, { machine_id: 'web', zone: 'dmz' }] },
  ] }) }))
})

test('effective Discord permissions apply everyone, aggregate role, and member overrides in order', () => {
  const guild = '123456789012345678'
  const member = { user: { id: '123456789012345679' }, roles: ['123456789012345680'] }
  const read = (1n << 10n) | (1n << 16n)
  const roles = [{ id: guild, permissions: read.toString() }, { id: member.roles[0], permissions: '0' }]
  const channel = { permission_overwrites: [{ id: guild, type: 0, deny: read.toString(), allow: '0' },
    { id: member.roles[0], type: 0, deny: '0', allow: read.toString() }] }
  assert.equal(effectivePermissions(guild, roles, member, channel), read)
  channel.permission_overwrites.push({ id: member.user.id, type: 1, deny: '65536', allow: '0' })
  assert.equal(effectivePermissions(guild, roles, member, channel), 1024n)
  assert.equal(effectivePermissions(guild, [{ id: guild, permissions: '8' }], member, channel), 8n)
})

test('bounded API JSON rejects unsupported content, malformed and oversized input', async () => {
  const request = (body, type = 'application/json') => new Request('https://example.invalid/api/events', {
    method: 'POST', headers: { 'content-type': type }, body,
  })
  await assert.rejects(requestJson(request('{}', 'text/plain')), error => error.status === 415)
  await assert.rejects(requestJson(request('{')), error => error.status === 400)
  await assert.rejects(requestJson(request(JSON.stringify({ details: 'x'.repeat(20_000) }))), error => error.status === 413)
  assert.deepEqual(await requestJson(request('{"team_id":"A"}')), { team_id: 'A' })
})

test('Discord readiness identifies missing settings without inferring other settings are absent or exposing secrets', () => {
  const config = { ALLOWED_CHANNELS: '123456789012345678', DISCORD_SOURCE_POLICY_JSON: JSON.stringify({
    version: 1, sources: [{ channel_id: '123456789012345678', webhook_id: '123456789012345679', team_ids: ['ClassA_01'] }],
  }) }
  const missingToken = discordConfiguration(config)
  assert.deepEqual(missingToken.missing_settings, ['DISCORD_BOT_TOKEN'])
  assert.equal(missingToken.policy_valid, true)
  assert.equal(missingToken.configured, false)
  assert.equal(discordConfiguration({ ...config, DISCORD_BOT_TOKEN: 'private-token' }).configured, true)
  const invalidPolicy = discordConfiguration({ ...config, DISCORD_BOT_TOKEN: 'private-token', DISCORD_SOURCE_POLICY_JSON: 'PRIVATE_INVALID_INPUT' })
  assert.equal(invalidPolicy.policy_valid, false)
  assert.deepEqual(invalidPolicy.missing_settings, [])
  assert.doesNotMatch(JSON.stringify(invalidPolicy), /private-token|PRIVATE_INVALID_INPUT/)
  assert.deepEqual(discordConfiguration({}).missing_settings, ['DISCORD_BOT_TOKEN', 'ALLOWED_CHANNELS', 'DISCORD_SOURCE_POLICY_JSON'])
})
