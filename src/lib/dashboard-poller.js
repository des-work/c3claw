import { refreshSeconds } from '../../shared/refresh-policy.js'

export function createDashboardPoller({ fetchSnapshot, onData, onError, onSettled,
  hidden = () => document.hidden, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let active = false
  let timer = null
  let controller = null
  let nextDue = 0
  let interval = 300_000
  let failures = 0

  const schedule = () => {
    clearTimer(timer)
    if (active && !hidden() && !controller) timer = setTimer(poll, Math.max(0, nextDue - now()))
  }
  const poll = async () => {
    timer = null
    if (!active || hidden() || controller) return
    if (now() < nextDue) { schedule(); return }
    controller = new AbortController()
    nextDue = now() + interval
    try {
      const snapshot = await fetchSnapshot(controller.signal)
      if (!active) return
      interval = refreshSeconds(snapshot.policy?.refresh_seconds) * 1000
      failures = 0
      nextDue = now() + interval
      onData(snapshot)
      onError(null)
    } catch (error) {
      if (!active) return
      failures++
      const backoff = Math.min(1_800_000, interval * 2 ** Math.min(failures - 1, 3))
      nextDue = now() + Math.max(backoff, error.retryAfterMs || 0)
      onError(error.message || 'Snapshot refresh failed')
    } finally {
      controller = null
      if (active) { onSettled(); schedule() }
    }
  }
  return {
    start() { active = true; schedule() },
    visibilityChanged() { schedule() },
    stop() { active = false; clearTimer(timer); controller?.abort() },
  }
}
