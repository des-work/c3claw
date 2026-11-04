import test from 'node:test'
import assert from 'node:assert/strict'
import { STANDARD_POLICY, ageSnapshotTeams, overallMachineStatus, refreshSeconds } from '../shared/refresh-policy.js'
import { createDashboardPoller } from '../src/lib/dashboard-poller.js'

function harness(fetchSnapshot = async () => ({ policy: STANDARD_POLICY })) {
  let time = 1_000_000
  let hidden = false
  let calls = 0
  let id = 0
  const timers = new Map()
  const errors = []
  const poller = createDashboardPoller({
    fetchSnapshot: signal => { calls++; return fetchSnapshot(signal) },
    onData: () => {}, onError: error => errors.push(error), onSettled: () => {},
    now: () => time, hidden: () => hidden,
    setTimer: (callback, delay) => { timers.set(++id, { callback, at: time + delay }); return id },
    clearTimer: key => timers.delete(key),
  })
  const advance = async ms => {
    const target = time + ms
    while (true) {
      const entry = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!entry) break
      timers.delete(entry[0]); time = entry[1].at
      await entry[1].callback()
    }
    time = target
  }
  return { poller, advance, errors, calls: () => calls,
    hidden(value) { hidden = value; poller.visibilityChanged() },
    nextDelay: () => Math.min(...[...timers.values()].map(timer => timer.at - time)) }
}

test('standard viewer polling is clamped to five minutes and hidden tabs make no requests', async () => {
  const h = harness(async () => ({ policy: { refresh_seconds: 1 } }))
  h.poller.start()
  await h.advance(0)
  assert.equal(h.calls(), 1)
  for (let i = 0; i < 20; i++) { h.hidden(true); h.hidden(false) }
  await h.advance(299_999)
  assert.equal(h.calls(), 1)
  h.hidden(true)
  await h.advance(3_600_000)
  assert.equal(h.calls(), 1)
  h.hidden(false)
  await h.advance(0)
  assert.equal(h.calls(), 2)
  await h.advance(300_000)
  assert.equal(h.calls(), 3)
  h.poller.stop()
  await h.advance(3_600_000)
  assert.equal(h.calls(), 3)
  assert.equal(refreshSeconds(10), 300)
})

test('failed refreshes back off and a successful response restores the standard cadence', async () => {
  let fail = true
  const h = harness(async () => { if (fail) throw new Error('Unavailable'); return { policy: STANDARD_POLICY } })
  h.poller.start()
  await h.advance(0)
  assert.equal(h.nextDelay(), 300_000)
  await h.advance(300_000)
  assert.equal(h.nextDelay(), 600_000)
  await h.advance(600_000)
  assert.equal(h.nextDelay(), 1_200_000)
  await h.advance(1_200_000)
  assert.equal(h.nextDelay(), 1_800_000)
  fail = false
  await h.advance(1_800_000)
  assert.equal(h.nextDelay(), 300_000)
  assert.equal(h.errors.at(-1), null)
  h.poller.stop()
})

test('visibility changes cannot overlap an in-flight request and shutdown aborts it', async () => {
  let complete
  let signal
  const h = harness(value => { signal = value; return new Promise(resolve => { complete = resolve }) })
  h.poller.start()
  const pending = h.advance(0)
  h.hidden(true); h.hidden(false)
  assert.equal(h.calls(), 1)
  h.poller.stop()
  assert.equal(signal.aborted, true)
  complete({ policy: STANDARD_POLICY })
  await pending
  await h.advance(3_600_000)
  assert.equal(h.calls(), 1)
})

test('slow-refresh machine indicators age locally and activity is not machine health', () => {
  const last = Date.parse('2026-11-04T00:00:00Z')
  const teams = [{ team_id: 'A', status: 'offline', machines: [{ machine_id: 'web',
    status: 'online', reported_status: 'online', last_seen: new Date(last).toISOString() }] }]
  assert.equal(overallMachineStatus(ageSnapshotTeams(teams, last + 10 * 60_000)), 'ALL SYSTEMS GO')
  assert.equal(overallMachineStatus(ageSnapshotTeams(teams, last + 13 * 60_000)), 'DEGRADED')
  assert.equal(overallMachineStatus(ageSnapshotTeams(teams, last + 21 * 60_000)), 'CRITICAL')
  assert.equal(overallMachineStatus([{ team_id: 'A', status: 'online', machines: [] }]), 'UNKNOWN')
  assert.equal(overallMachineStatus(teams, true), 'TELEMETRY UNAVAILABLE')
})
