import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEnrollmentSnapshot, mergeEnrollmentInventory, syncEnrollmentOnce } from '../server/enrollment-sync.js'
import { attachTopology } from '../server/topology.js'

const team = { team_id: 'ClassA_01', class_id: 'ClassA', term_id: '2026F', display_name: 'Team One', member_count: 3, cidr: '10.1.1.0/24' }

test('enrollment teams feed gallery classes without inventing machine health or exposing students', () => {
  const parsed = parseEnrollmentSnapshot({ version: 1, teams: [team] })
  const configured = [{ team_id: team.team_id, machines: [{ machine_id: 'web', label: 'Web', zone: 'dmz' }] }]
  const result = attachTopology([], mergeEnrollmentInventory(configured, parsed.teams), [])
  assert.equal(result[0].class_id, 'ClassA')
  assert.equal(result[0].member_count, 3)
  assert.equal(result[0].machines[0].status, 'unknown')
  assert.throws(() => parseEnrollmentSnapshot({ version: 1, teams: [{ ...team, email: 'private@example.invalid' }] }), /student identities/)
  assert.throws(() => parseEnrollmentSnapshot({ version: 1, teams: [team, team] }), /duplicate/)
  assert.throws(() => mergeEnrollmentInventory([{ ...configured[0], class_id: 'OtherClass' }], parsed.teams), /conflicts/)
})

test('snapshot is persisted before use; malformed data never overwrites last good inventory', async () => {
  const saved = []
  const options = { baseUrl: 'https://backend.example', secret: 'export-only', save: async payload => saved.push(payload),
    fetchFn: async (url, init) => {
      assert.equal(url.pathname, '/api/admin/enrollment/teams/export')
      assert.equal(init.headers['X-Export-Secret'], 'export-only')
      return new Response(JSON.stringify({ version: 1, teams: [team] }))
    } }
  const result = await syncEnrollmentOnce(options)
  assert.equal(result.payload.teams[0].team_id, team.team_id)
  assert.equal(saved.length, 1)
  await assert.rejects(syncEnrollmentOnce({ ...options, fetchFn: async () => new Response('{"students":[]}') }))
  assert.equal(saved.length, 1)
  await assert.rejects(syncEnrollmentOnce({ ...options, save: async () => { throw new Error('DB unavailable') } }), /DB unavailable/)
  await assert.rejects(syncEnrollmentOnce({ ...options,
    fetchFn: async () => new Response('private-student@example.invalid is not JSON') }),
  error => error.message === 'Enrollment export is not valid JSON')
  assert.equal(saved.length, 1)
})
