import { useState, useEffect, useMemo } from 'react'
import { STANDARD_POLICY, ageSnapshotTeams, refreshSeconds } from '../../shared/refresh-policy.js'
import { createDashboardPoller } from '../lib/dashboard-poller.js'

export function useDashboardData() {
  const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const poller = createDashboardPoller({
      fetchSnapshot: async signal => {
        const response = await fetch(`${apiUrl}/api/dashboard`, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        })
        if (!response.ok) {
          const problem = new Error('Dashboard snapshot unavailable')
          const seconds = Number(response.headers.get('retry-after'))
          if (Number.isFinite(seconds) && seconds > 0) problem.retryAfterMs = Math.min(seconds, 3600) * 1000
          throw problem
        }
        const data = await response.json()
        if (!Array.isArray(data.teams) || !Array.isArray(data.events) || !Number.isFinite(Date.parse(data.generated_at))) {
          throw new Error('Invalid dashboard snapshot')
        }
        return data
      },
      onData: data => { setSnapshot(data); setNow(Date.now()) },
      onError: setError,
      onSettled: () => setLoading(false),
    })
    poller.start()
    const onVisible = () => { setNow(Date.now()); poller.visibilityChanged() }
    document.addEventListener('visibilitychange', onVisible)
    // Re-age local indicators without making network requests.
    const clock = setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      poller.stop()
      clearInterval(clock)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [apiUrl])

  const policy = snapshot?.policy || STANDARD_POLICY
  const teams = useMemo(() => ageSnapshotTeams(snapshot?.teams || [], now, policy), [snapshot, now, policy])
  const stale = snapshot && now - Date.parse(snapshot.generated_at) > refreshSeconds(policy.refresh_seconds) * 2000
  return { teams, events: snapshot?.events || [], loading,
    error: error || (stale ? 'Snapshot is older than two refresh intervals' : null),
    policy, generatedAt: snapshot?.generated_at || null, pipelineHealth: snapshot?.health || null }
}
