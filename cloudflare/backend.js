import { syncBackendOnce } from '../shared/backend-sync.js'
import { backendUrl, boundedJson } from '../shared/backend-transport.js'
import { parseEnrollmentSnapshot, mergeEnrollmentInventory } from '../shared/enrollment.js'

export async function syncBackend(store, env, configuredTopology, fetchFn = fetch) {
  if (!env.BACKEND_EXPORT_URL && !env.BACKEND_EXPORT_SECRET) return
  if (!env.BACKEND_EXPORT_URL || !env.BACKEND_EXPORT_SECRET) throw new Error('Backend export URL and secret must both be configured')
  const baseUrl = env.BACKEND_EXPORT_URL
  const secret = env.BACKEND_EXPORT_SECRET
  // Enrollment snapshots never contain students' identities.
  try {
    const response = await fetchFn(backendUrl(baseUrl, '/api/admin/enrollment/teams/export'), {
      // 'manual', not 'error': the Workers runtime rejects redirect: 'error'
      // outright. The !response.ok check below still refuses a 3xx, so the
      // export secret is never replayed to a redirect target.
      headers: { 'X-Export-Secret': secret }, signal: AbortSignal.timeout(5_000), redirect: 'manual',
    })
    if (!response.ok) throw new Error(`Enrollment export returned HTTP ${response.status}`)
    const payload = parseEnrollmentSnapshot(await boundedJson(response, 'Enrollment export', 2 * 1024 * 1024))
    mergeEnrollmentInventory(configuredTopology, payload.teams) // Validate class conflicts before persistence.
    const fetchedAt = new Date().toISOString()
    await store.saveSnapshot(payload, fetchedAt)
    await store.saveState('enrollment', { enabled: true, last_success: fetchedAt, last_error: null, teams: payload.teams.length })
  } catch {
    const previous = await store.state('enrollment')
    await store.saveState('enrollment', { ...previous, enabled: true, last_error: 'Enrollment sync failed; last good snapshot retained' })
  }
  if (env.TELEMETRY_SOURCE !== 'backend') return
  try {
    const result = await syncBackendOnce({ baseUrl, secret, fetchFn, maxPages: 1,
      getCursor: async () => (await store.first("SELECT last_id FROM backend_sync_cursors WHERE source='scoring'"))?.last_id || 0,
      saveCursor: cursor => store.run(`INSERT INTO backend_sync_cursors VALUES ('scoring', ?)
        ON CONFLICT(source) DO UPDATE SET last_id=MAX(last_id, excluded.last_id)`, cursor),
      ingestBatch: events => {
        const start = Date.parse(env.SEMESTER_START_AT)
        if (!Number.isFinite(start) || events.some(event => Date.parse(event.timestamp) < start ||
            Date.parse(event.timestamp) > Date.now() + 60_000)) {
          throw new Error('Backend outbox contains events outside the active semester; archive and review before enabling')
        }
        return store.ingestMany(events)
      },
    })
    await store.saveState('backend', { enabled: true, last_success: new Date().toISOString(), last_error: null,
      cursor: result.cursor, source_head_id: result.sourceHead, pending_events: result.pendingEvents })
  } catch {
    const previous = await store.state('backend')
    await store.saveState('backend', { ...previous, enabled: true, last_error: 'Backend sync failed; unacknowledged data will retry' })
  }
}
