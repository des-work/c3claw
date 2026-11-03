import { parseEvent } from './events.js'
import { getBackendCursor, saveBackendCursor, insertEvent } from './db.js'
import { backendUrl, boundedJson } from './backend-transport.js'

const state = { enabled: false, last_success: null, last_error: null,
  cursor: 0, source_head_id: 0, pending_events: 0, imported: 0 }

export function getBackendSyncHealth() { return { ...state } }

export function mapBackendEvent(item) {
  if (!Number.isSafeInteger(item?.id) || item.id < 1 ||
      !Number.isFinite(Date.parse(item.timestamp))) throw new Error('Invalid backend event ID or timestamp')
  if (item.technique === 'heartbeat') return null
  const details = `Phase ${item.phase}${item.milestone ? ` | Milestone: ${item.milestone}` : ''}`
  const event = parseEvent({
    team_id: item.team_id, tool: item.technique, target: item.target_ip,
    result: item.result.toUpperCase(), details, source_id: `backend:${item.id}`,
  })
  if (!event) throw new Error(`Invalid backend event ${item.id}`)
  return { ...event, timestamp: new Date(item.timestamp).toISOString() }
}

export async function syncBackendOnce({ baseUrl, secret, fetchFn = fetch,
  getCursor = getBackendCursor, saveCursor = saveBackendCursor, ingest = insertEvent,
  maxPages = 20 }) {
  let cursor = await getCursor()
  let imported = 0
  let sourceHead = cursor
  let pendingEvents = 0
  for (let page = 0; page < maxPages; page++) {
    const url = backendUrl(baseUrl, '/api/admin/events/export')
    url.searchParams.set('limit', '500')
    const response = await fetchFn(url, {
      headers: { 'X-Export-Secret': secret }, signal: AbortSignal.timeout(10_000), redirect: 'error',
    })
    if (!response.ok) throw new Error(`Backend export returned HTTP ${response.status}`)
    const batch = await boundedJson(response, 'Backend export')
    if (!Array.isArray(batch.events) || typeof batch.has_more !== 'boolean' ||
        batch.events.length > 500 || !Number.isSafeInteger(batch.pending) || batch.pending < batch.events.length) {
      throw new Error('Malformed backend export response')
    }
    if (Number.isSafeInteger(batch.head_id)) sourceHead = Math.max(sourceHead, batch.head_id)
    let previousId = 0
    for (const item of batch.events) {
      if (!Number.isSafeInteger(item.id) || item.id <= previousId) {
        throw new Error('Backend export IDs are not strictly increasing')
      }
      const event = mapBackendEvent(item)
      if (event) {
        const saved = await ingest(event)
        if (!saved.duplicate) imported++
      }
      previousId = item.id
    }
    if (batch.events.length) {
      const ackUrl = backendUrl(baseUrl, '/api/admin/events/ack')
      const acknowledgement = await fetchFn(ackUrl, {
        method: 'POST', headers: { 'X-Export-Secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_ids: batch.events.map(item => item.id) }),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      })
      if (!acknowledgement.ok) throw new Error(`Backend acknowledgement returned HTTP ${acknowledgement.status}`)
      const highest = batch.events.at(-1).id
      if (highest > cursor) {
        await saveCursor(highest)
        cursor = highest
      }
    }
    pendingEvents = Math.max(0, batch.pending - batch.events.length)
    if (!batch.has_more) break
    if (batch.events.length === 0) throw new Error('Backend export reported more data after empty page')
  }
  if (pendingEvents === 0 && sourceHead > cursor) {
    await saveCursor(sourceHead)
    cursor = sourceHead
  }
  return { cursor, sourceHead, pendingEvents, imported }
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
