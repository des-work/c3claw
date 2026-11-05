import test from 'node:test'
import assert from 'node:assert/strict'
import { backendUrl, boundedJson } from '../server/backend-transport.js'
import { syncEnrollmentOnce } from '../server/enrollment-sync.js'
import { parseEvent } from '../server/events.js'

test('export secrets require trusted TLS origins and redirects are rejected', async () => {
  for (const value of ['http://remote.example', 'https://user:secret@remote.example', 'https://remote.example/path', 'https://remote.example?token=secret']) {
    assert.throws(() => backendUrl(value, '/api/export'))
  }
  assert.equal(backendUrl('http://127.0.0.1:8000', '/api/export').hostname, '127.0.0.1')
  await syncEnrollmentOnce({ baseUrl: 'https://backend.example', secret: 'private', save: async () => {},
    fetchFn: async (_, options) => {
      assert.equal(options.redirect, 'error')
      return Response.json({ version: 1, teams: [] })
    } })
})

test('bounded JSON rejects oversized payloads and does not echo response contents', async () => {
  await assert.rejects(boundedJson(new Response('x'.repeat(50)), 'Export', 20), /response limit/)
  await assert.rejects(boundedJson(new Response('secret-student@example.invalid'), 'Export'), error => error.message === 'Export is not valid JSON')
  assert.equal(parseEvent({ team_id: 123, tool: 'x', target: 'x', result: 'SUCCESS' }), null)
})
