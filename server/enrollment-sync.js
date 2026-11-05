import { getEnrollmentSnapshot, saveEnrollmentSnapshot } from './db.js'
import { backendUrl, boundedJson } from './backend-transport.js'

const state = { enabled: false, last_success: null, last_error: null, teams: 0 }
let inventory = []
import { parseEnrollmentSnapshot } from '../shared/enrollment.js'
export { parseEnrollmentSnapshot, mergeEnrollmentInventory } from '../shared/enrollment.js'

export function getEnrollmentSyncHealth() { return { ...state } }
export function getEnrollmentInventory() { return inventory }

export async function restoreEnrollmentInventory() {
  const saved = await getEnrollmentSnapshot()
  if (saved) {
    inventory = parseEnrollmentSnapshot(saved.payload).teams
    state.last_success = new Date(saved.fetched_at).toISOString()
    state.teams = inventory.length
  }
}

export async function syncEnrollmentOnce({ baseUrl, secret, fetchFn = fetch, save = saveEnrollmentSnapshot }) {
  const url = backendUrl(baseUrl, '/api/admin/enrollment/teams/export')
  const response = await fetchFn(url, { headers: { 'X-Export-Secret': secret }, signal: AbortSignal.timeout(10_000), redirect: 'error' })
  if (!response.ok) throw new Error(`Enrollment export returned HTTP ${response.status}`)
  const decoded = await boundedJson(response, 'Enrollment export', 2 * 1024 * 1024)
  const payload = parseEnrollmentSnapshot(decoded)
  const fetchedAt = new Date().toISOString()
  await save(payload, fetchedAt)
  return { payload, fetchedAt }
}

export function startEnrollmentSync() {
  const baseUrl = process.env.BACKEND_EXPORT_URL
  const secret = process.env.BACKEND_EXPORT_SECRET
  if (!baseUrl && !secret) return
  if (!baseUrl || !secret) throw new Error('Backend URL and export secret are required for enrollment sync')
  state.enabled = true
  const poll = async () => {
    try {
      const { payload, fetchedAt } = await syncEnrollmentOnce({ baseUrl, secret })
      inventory = payload.teams
      state.teams = inventory.length
      state.last_success = fetchedAt
      state.last_error = null
    } catch (error) {
      state.last_error = error.message
      console.error(`[enrollment-sync] ${error.message}`)
    } finally {
      setTimeout(poll, 30_000).unref()
    }
  }
  void poll()
}
