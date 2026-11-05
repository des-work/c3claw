# Student enrollment feed

The backend repository contains the roster importer, private Discord registration worker and optional reviewed invitation mailer. See its `CYBERLABS-START-HERE.md` and `claw-and-order/docs/STUDENT-ENROLLMENT.md`. Student role duties are pending faculty definition; the dashboard does not assign Discord permissions.

## Deploy

Run `npm ci`, `npm test`, `npm run lint`, `npm run build` and `npm run migrate` before starting the production dashboard. PostgreSQL is required in production. The migration adds `enrollment_snapshots`; it is safe to rerun. Keep the previous app release and a tested database backup.

Set `BACKEND_EXPORT_URL` to the trusted scoring API origin and `BACKEND_EXPORT_SECRET` to its independent `EVENT_EXPORT_SECRET`. These existing settings now enable both scored-event delivery and the enrollment inventory poller. Deploy the backend export before enabling this dashboard release. Use trusted TLS between hosts and keep the secret out of browser variables and frontend builds.

The audit release enforces HTTPS for a remote origin, allows HTTP only on loopback and rejects redirects before export/ack credentials can follow them. Both feeds bound response sizes and use generic JSON parse errors. Run `npm audit --omit=dev` as a production gate. A proposed CI gate is in `docs/ci-security-gate.patch`; a repository owner must activate it because this session's GitHub credential cannot edit workflows. The full development graph currently has seven moderate minimatch-related reports; the updated production graph has none. See the backend's `docs/AUDIT-2026-11-03.md` for evidence and the development-tool disposition. Build only trusted source and keep development dependencies off runtime hosts.

Every 30 seconds the server requests `/api/admin/enrollment/teams/export` with `X-Export-Secret`. The version 1 envelope has `version` and `teams`; each team has only `team_id`, `class_id`, `term_id`, `display_name`, `member_count`, and `cidr`. Unexpected fields, duplicate teams, invalid identifiers, oversized responses and invalid JSON fail closed. Student names, emails, ideas, Discord user IDs and codes are never accepted in this feed. Machine inventory and authenticated health reports remain separate.

Validated snapshots are persisted before replacing the in-memory inventory. On restart the last durable snapshot is restored. Team IDs must match scoring and configured topology IDs; a class conflict rejects status construction. Configured machine lists are preserved. Enrollment alone never turns a machine green: absent reports remain unknown.

## Acceptance and recovery

| Check | Success | Failure response |
| --- | --- | --- |
| Inventory | Every configured policy team appears in its correct class within a normal poll cycle plus the gallery refresh; member counts match active enrollments for that term/class | Repair policy/IDs or export credentials; preserve last good snapshot |
| Privacy | Export contains only the fields above | Reject the snapshot, investigate the producer; never copy student rosters into topology files |
| Source/database outage | Last durable inventory remains available; `/api/health` returns degraded/503 on failed sync or age over 120 seconds | Repair network, secret, source or database; polling recovers automatically |
| Machine truth | No health without an authenticated report; fresh, stale and offline reports follow existing thresholds | Keep unknown status until real reporters/probes are deployed |
| Restart/replay | Inventory restores and scored events are not duplicated | Preserve snapshots, event rows, outbox and acknowledgement state while investigating |

`/api/health.enrollment_sync` reports enablement, last successful refresh, generic last error and team count. Do not treat an empty gallery as a successful import without checking these values. To pause both backend feeds, remove both backend export settings and restart. Existing persisted events and inventory remain for recovery; semester rollover requires the documented archive/new-database procedure.
