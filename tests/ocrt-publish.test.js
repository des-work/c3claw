import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDiscordSources, parseDiscordTelemetry, authorizedDiscordSource } from '../shared/discord.js'
import { parseEvent } from '../shared/events.js'

// The adapter is only useful if the live receiver accepts what it emits, so the
// assertions run its real output through the receiver's own parsers.
const adapter = fileURLToPath(new URL('../scripts/ocrt-publish.py', import.meta.url))
const channel = '1493656958568497293'
const webhook = '1493657143122067618'
const sources = parseDiscordSources(
  { version: 1, sources: [{ channel_id: channel, webhook_id: webhook, team_ids: ['DEV_01'] }] },
  new Set([channel]))

// The adapter exits non-zero when it rejects a record, which is what a cron
// job needs, so the summary is read from stdout either way. A run that produced
// no summary at all (a refusal before processing) is re-thrown.
const run = (records, extra = []) => {
  const options = { input: JSON.stringify(records), encoding: 'utf8' }
  try {
    return JSON.parse(execFileSync('python3', [adapter, '--dry-run', ...extra], options))
  } catch (error) {
    if (typeof error.stdout === 'string' && error.stdout.trim().startsWith('{')) return JSON.parse(error.stdout)
    throw error
  }
}

const accepted = line => {
  const payload = parseDiscordTelemetry(line)
  assert.notEqual(payload, null, 'line must carry the [OCRT] prefix')
  assert.notEqual(payload, false, 'line must carry all required fields')
  const event = parseEvent({ ...payload, source_id: 'discord:1569440735135010829' })
  assert.ok(event, 'receiver must accept the parsed payload')
  assert.equal(authorizedDiscordSource(sources, { channelId: channel, webhookId: webhook }, payload.team_id), true)
  return { payload, event }
}

test('a well-formed record becomes a line the receiver accepts and attributes correctly', () => {
  const summary = run([{ team_id: 'DEV_01', tool: 'nmap', target: '10.0.0.5',
    result: 'success', details: 'service scan', event_id: 'job-1' }])
  assert.equal(summary.published, 1)
  assert.equal(summary.rejected, 0)
  const { payload, event } = accepted(summary.results[0].line)
  assert.deepEqual([payload.team_id, payload.tool, payload.target, payload.result],
    ['DEV_01', 'nmap', '10.0.0.5', 'success'])
  assert.equal(event.details, 'service scan')
})

test('pipes in keyed fields cannot shift the receiver’s field order', () => {
  const summary = run([{ team_id: 'DEV_01', tool: 'nmap | whoami', target: '10.0.0.5 | 10.0.0.6',
    result: 'success', details: 'kept | pipes' }])
  const { payload } = accepted(summary.results[0].line)
  assert.equal(payload.tool, 'nmap / whoami')
  assert.equal(payload.target, '10.0.0.5 / 10.0.0.6')
  assert.equal(payload.result, 'success', 'result must not absorb a later field')
  assert.equal(payload.details, 'kept | pipes', 'pipes stay legible in details')
})

test('the described Hermes triple is rejected rather than completed by guesswork', () => {
  // UniqueID/TeamID/Success-Failure carries no tool and no target, both of
  // which the receiver requires. Inventing them would publish fabricated activity.
  const summary = run([{ event_id: '4a0cbf6de3e8', team_id: 'DEV_01', result: 'failure' }])
  assert.equal(summary.published, 0)
  assert.equal(summary.rejected, 1)
  assert.match(summary.results[0].reason, /missing required field\(s\): tool, target/)
})

test('control characters and newlines collapse instead of breaking the line', () => {
  const summary = run([{ team_id: 'DEV_01', tool: 'nmap\n-sV', target: '10.0.0.5\r\n',
    result: 'success\tdone', details: 'line one\nline two' }])
  const { payload } = accepted(summary.results[0].line)
  assert.equal(payload.tool, 'nmap -sV')
  assert.equal(payload.target, '10.0.0.5')
  assert.equal(payload.result, 'success done')
  assert.equal(payload.details, 'line one line two')
})

test('oversized details are truncated to a length the receiver still accepts', () => {
  const summary = run([{ team_id: 'DEV_01', tool: 'nmap', target: '10.0.0.5',
    result: 'success', details: 'x'.repeat(5000) }])
  const { payload } = accepted(summary.results[0].line)
  assert.ok(payload.details.length <= 2000, `details ${payload.details.length} must be <= 2000`)
})

test('an invalid team_id is rejected before anything is posted', () => {
  const summary = run([{ team_id: 'Class A/01', tool: 'nmap', target: '10.0.0.5', result: 'success' }])
  assert.equal(summary.rejected, 1)
  assert.match(summary.results[0].reason, /team_id/)
})

test('an already published event_id is skipped so it cannot double count', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ocrt-state-'))
  try {
    const state = join(dir, 'seen.json')
    writeFileSync(state, JSON.stringify({ published: ['job-1'] }))
    const summary = run([
      { team_id: 'DEV_01', tool: 'nmap', target: '10.0.0.5', result: 'success', event_id: 'job-1' },
      { team_id: 'DEV_01', tool: 'nmap', target: '10.0.0.6', result: 'success', event_id: 'job-2' },
    ], ['--state', state])
    assert.equal(summary.skipped_duplicate, 1)
    assert.equal(summary.published, 1)
    assert.equal(summary.results[0].status, 'skipped')
    assert.equal(summary.results[1].status, 'would_publish')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a team outside the source mapping stays unauthorized even with a perfect line', () => {
  const summary = run([{ team_id: 'OTHER_99', tool: 'nmap', target: '10.0.0.5', result: 'success' }])
  const payload = parseDiscordTelemetry(summary.results[0].line)
  assert.ok(parseEvent(payload), 'the line itself is well formed')
  assert.equal(authorizedDiscordSource(sources, { channelId: channel, webhookId: webhook }, payload.team_id), false)
})

test('a malformed state file stops the run instead of republishing blind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ocrt-state-bad-'))
  try {
    const state = join(dir, 'seen.json')
    writeFileSync(state, 'not json')
    assert.throws(() => run([{ team_id: 'DEV_01', tool: 'nmap', target: '10.0.0.5', result: 'success' }],
      ['--state', state]), /refusing to publish blind|Command failed/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('dry run reports what would be sent and contacts nothing', () => {
  const summary = run([{ team_id: 'DEV_01', tool: 'nmap', target: '10.0.0.5', result: 'success' }])
  assert.equal(summary.mode, 'dry_run')
  assert.equal(summary.webhook_url_printed, false)
  assert.ok(summary.results[0].line.startsWith('[OCRT] '))
})
