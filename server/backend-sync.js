import { getBackendCursor, saveBackendCursor, insertEvent } from './db.js'

const state = { enabled: false, last_success: null, last_error: null,
  cursor: 0, source_head_id: 0, pending_events: 0, imported: 0 }

export function getBackendSyncHealth() { return { ...state } }

export { mapBackendEvent } from '../shared/backend-sync.js'
import { syncBackendOnce as syncShared } from '../shared/backend-sync.js'

export function syncBackendOnce(options) {
  return syncShared({ getCursor: getBackendCursor, saveCursor: saveBackendCursor, ingest: insertEvent, ...options })
}

export function startBackendSync() {
  const baseUrl = process.env.BACKEND_EXPORT_URL
  const secret = process.env.BACKEND_EXPORT_SECRET
  if (!baseUrl && !secret) return
  if (!baseUrl || !secret) throw new Error('BACKEND_EXPORT_URL and BACKEND_EXPORT_SECRET must both be set')
  state.enabled = true
  const poll = async () => {
    try {
      const result = await syncBackendOnce({ baseUrl, secret })
      state.cursor = result.cursor
      state.source_head_id = result.sourceHead
      state.pending_events = result.pendingEvents
      state.imported += result.imported
      state.last_success = new Date().toISOString()
      state.last_error = null
    } catch (error) {
      state.last_error = error.message
      console.error(`[backend-sync] ${error.stack || error}`)
    } finally {
      setTimeout(poll, 5_000).unref()
    }
  }
  void poll()
}
