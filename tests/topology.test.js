import test from 'node:test'
import assert from 'node:assert/strict'
import { attachTopology, loadTopology, machineState } from '../server/topology.js'

const now = Date.parse('2026-03-23T12:00:00Z')
const observed = (status, ageMs) => ({
  team_id: 'Brown_01', machine_id: 'web', zone: 'dmz', label: 'Web target',
  status, last_seen: new Date(now - ageMs).toISOString(),
})

test('machine health ages from online to degraded to offline', () => {
  assert.equal(machineState(observed('online', 20_000), now), 'online')
  assert.equal(machineState(observed('online', 90_000), now), 'degraded')
  assert.equal(machineState(observed('online', 360_000), now), 'offline')
  assert.equal(machineState(observed('offline', 0), now), 'offline')
  assert.equal(machineState({ status: 'online', last_seen: null }, now), 'unknown')
})

test('inventory is visible before reports and only observations establish health', () => {
  const inventory = [{ team_id: 'Brown_01', cidr: '10.0.1.0/24', machines: [
    { machine_id: 'web', zone: 'dmz', label: 'Web target', address: '10.0.1.20' },
    { machine_id: 'dc', zone: 'lan', label: 'Domain controller', address: '10.0.1.30' },
  ] }]
  const teams = attachTopology([], inventory, [], now)
  assert.equal(teams[0].status, 'unknown')
  assert.deepEqual(teams[0].machines.map(machine => machine.status), ['unknown', 'unknown'])
  const updated = attachTopology(teams, inventory, [{ ...observed('online', 20_000), label: 'web', address: null }], now)
  assert.deepEqual(updated[0].machines.map(machine => machine.status), ['online', 'unknown'])
  assert.equal(updated[0].machines[0].address, '10.0.1.20')
  assert.equal(updated[0].machines[0].label, 'Web target')
})

test('inline inventory can configure a deployment without checking in addresses', () => {
  const teams = loadTopology(null, JSON.stringify({ teams: [{
    team_id: 'Brown_01', machines: [{ machine_id: 'web', zone: 'dmz', label: 'Web target' }],
  }] }))
  assert.equal(teams[0].machines[0].label, 'Web target')
  assert.throws(() => loadTopology(null, '{"teams":{}}'), /teams array/)
})
