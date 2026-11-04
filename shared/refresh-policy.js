import { machineState } from './topology.js'

// Faster collection is an administrator-approved deployment, never a viewer option.
export const STANDARD_POLICY = Object.freeze({
  profile: 'standard', refresh_seconds: 300, source_poll_seconds: 300, cache_seconds: 60,
  heartbeat_seconds: 300, degraded_after_seconds: 720, offline_after_seconds: 1200,
  sync_stale_after_seconds: 900,
})

export function refreshSeconds(value) {
  return Number.isFinite(value) ? Math.min(3600, Math.max(300, Math.ceil(value))) : 300
}

export function machineFreshness(policy = STANDARD_POLICY) {
  return { degradedAfterMs: policy.degraded_after_seconds * 1000, offlineAfterMs: policy.offline_after_seconds * 1000 }
}

export function ageSnapshotTeams(teams, now = Date.now(), policy = STANDARD_POLICY) {
  return teams.map(team => ({ ...team, machines: (team.machines || []).map(machine => ({
    ...machine, status: machineState({ ...machine, status: machine.reported_status || machine.status }, now, machineFreshness(policy)),
  })) }))
}

export function overallMachineStatus(teams, unavailable = false) {
  if (unavailable) return 'TELEMETRY UNAVAILABLE'
  if (!teams.length) return 'AWAITING TELEMETRY'
  const states = teams.flatMap(team => team.machines?.length ? team.machines.map(machine => machine.status) : ['unknown'])
  if (states.includes('offline')) return 'CRITICAL'
  if (states.includes('degraded')) return 'DEGRADED'
  if (states.includes('unknown')) return 'UNKNOWN'
  return 'ALL SYSTEMS GO'
}
