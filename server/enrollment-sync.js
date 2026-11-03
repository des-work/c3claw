import { getEnrollmentSnapshot, saveEnrollmentSnapshot } from './db.js'
import { backendUrl, boundedJson } from './backend-transport.js'

const state = { enabled: false, last_success: null, last_error: null, teams: 0 }
let inventory = []
const ID = /^[A-Za-z0-9_-]{1,64}$/

export function getEnrollmentSyncHealth() { return { ...state } }
export function getEnrollmentInventory() { return inventory }

export function parseEnrollmentSnapshot(payload) {
  if (payload?.version !== 1 || !Array.isArray(payload.teams) || payload.teams.length > 1000 ||
      Object.keys(payload).some(key => !['version', 'teams'].includes(key))) throw new Error('Invalid enrollment export envelope')
  const seen = new Set()
  const fields = ['team_id', 'class_id', 'term_id', 'display_name', 'member_count', 'cidr']
  const teams = payload.teams.map(team => {
    if (!team || Object.keys(team).some(key => !fields.includes(key)) ||
        ['team_id', 'class_id', 'term_id'].some(key => typeof team[key] !== 'string' || !ID.test(team[key])) ||
        typeof team.display_name !== 'string' || !team.display_name.trim() || team.display_name.length > 120 ||
        !Number.isSafeInteger(team.member_count) || team.member_count < 0 ||
        (team.cidr !== null && (typeof team.cidr !== 'string' || team.cidr.length > 120)) || seen.has(team.team_id)) {
      throw new Error('Invalid or duplicate enrollment team; no student identities are accepted')
    }
    seen.add(team.team_id)
    return Object.fromEntries(fields.map(key => [key, team[key]]))
  })
  return { version: 1, teams }
}

export function mergeEnrollmentInventory(configured, snapshot) {
  const byId = new Map(configured.map(team => [team.team_id, { ...team }]))
  for (const team of snapshot) {
    const manual = byId.get(team.team_id)
    if (manual?.class_id && manual.class_id !== team.class_id) throw new Error('Configured topology class conflicts with enrollment class')
    byId.set(team.team_id, { ...team, ...manual, class_id: team.class_id, term_id: team.term_id,
      display_name: team.display_name, member_count: team.member_count,
      cidr: manual?.cidr || team.cidr, machines: manual?.machines || [] })
  }
  return [...byId.values()]
}

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
