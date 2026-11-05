import { STANDARD_POLICY } from '../shared/refresh-policy.js'

const input = process.argv[2] ? JSON.parse(process.argv[2]) : {}
const values = { machines: 90, viewers: 100, viewer_hours: 8, events_per_day: 5000, channels: 2, ...input }
if (Object.values(values).some(value => !Number.isFinite(value) || value < 0)) throw new Error('Sizing values must be nonnegative numbers')
const dailyCycles = 86400 / STANDARD_POLICY.source_poll_seconds
const heartbeatRequests = Math.ceil(values.machines * 86400 / STANDARD_POLICY.heartbeat_seconds)
const viewerRequests = Math.ceil(values.viewers * values.viewer_hours * 3600 / STANDARD_POLICY.refresh_seconds)
const directEventReserve = Math.ceil(values.events_per_day)
const healthProbeReserve = Math.ceil(dailyCycles)
const pageLoadReserve = Math.ceil(values.viewers * 12)
const requests = heartbeatRequests + viewerRequests + directEventReserve + dailyCycles + healthProbeReserve + pageLoadReserve
const writeEstimate = heartbeatRequests + Math.ceil(values.events_per_day * 10) + Math.ceil(dailyCycles * (2 + values.channels * 5))
console.log(JSON.stringify({
  assumptions: values, policy: STANDARD_POLICY,
  scope: 'Cloudflare dashboard/API/D1 only; 24-hour heartbeats, stated viewer hours, conservative direct-event and page-load reserves. Other account projects, Cyberlabs hosting and email are excluded.',
  requests_per_day: { heartbeats: heartbeatRequests, dashboard: viewerRequests, events_reserve: directEventReserve,
    scheduled: dailyCycles, health_checks: healthProbeReserve, page_load_reserve: pageLoadReserve, total: requests },
  estimated_d1_writes_per_day: writeEstimate,
  d1_estimate_basis: 'Planning estimate: 10 writes/event including staging, deletes, indexes and summary effects, plus heartbeat and cursor/lease updates. Measure actual D1 rows_written during the pilot.',
  fits_request_free_allowance_before_other_projects: requests < 100000,
  fits_estimated_write_free_allowance_before_other_projects: writeEstimate < 100000,
  indicative_monthly_hosting: { free_target_usd: 0, paid_account_base_usd: 5,
    note: 'Not a bill or hard spending cap. Active plan is unverified; included usage is shared account-wide and paid overages are metered.' },
}, null, 2))
