# Dashboard release and recovery

This dashboard shows team topology and machine reports, imports scored events from the Claw & Order backend, and can separately import `[OCRT]` Discord telemetry. The full readiness matrix and exercise rehearsal are in the backend repository's `claw-and-order/docs/DEPLOYMENT.md`.

## Production configuration

| Setting | Required when | Check |
| --- | --- | --- |
| `DATABASE_URL` | Always | PostgreSQL URL; connection succeeds with verified TLS. For private CA, set `PG_CA_CERT_FILE` to a readable PEM file. |
| `EVENT_API_KEY` | Always | Long random bearer secret for event and machine writes. |
| `VITE_API_URL` | Only for a separate API origin | Set before build when using a different API origin; empty uses the dashboard’s own origin. No mock fallback exists. |
| `TOPOLOGY_JSON` or `TOPOLOGY_FILE` | For intended gallery | Every class/team/machine appears once with backend matching team IDs. |
| `BACKEND_EXPORT_URL` and `BACKEND_EXPORT_SECRET` | For scored event feed | Backend base URL and backend read-only `EVENT_EXPORT_SECRET`. Both must be set together. Dashboard health shows queue depth and errors. |
| `DISCORD_BOT_TOKEN`, `ALLOWED_CHANNELS` | For distinct Discord telemetry | Explicit comma separated channel IDs. Bot needs View Channel, Read Message History, and Message Content intent. |
| `DISCORD_INITIAL_BACKFILL` | First Discord setup | Default `false` starts at current channel head; `true` imports history. Decide before first connection. |
| `CORS_ORIGINS` | Cross origin browser client | Comma separated trusted origins. Empty is same origin only. |
| `DB_POOL_SIZE` | Connection budget tuning | Default 5. Count this against all backend pools and DB connection limit. |

`NODE_ENV=production` requires PostgreSQL and `EVENT_API_KEY`. The scoring backend exporter intentionally omits raw command/output. Heartbeats are skipped in the dashboard activity stream but still advance the backend cursor. Machine status requires separate authenticated reports to `POST /api/machines/heartbeat`; attack events do not prove a machine is online.

## Release steps and success/fallback

1. Run `npm ci`, `npm test`, `npm run lint`, and `npm run build`. Success: all pass and `dist/` is built with the intended `VITE_API_URL`. Failure: fix and rebuild the same candidate before release.
2. Back up PostgreSQL and rehearse on a production sized clone. Run `npm run migrate`. Success: reruns cleanly, `events_source_id_unique` and `events_recent_idx` are valid, summary counts match history, and existing web service stays responsive. Failure: abort release, inspect locks/index validity, repair on the clone, and rerun. Production web startup checks schema but does not migrate.
3. Deploy after the backend `/api/admin/events/export` is live. Heroku runs `npm run migrate` through the `release` entry in `Procfile`. Success: release phase exits 0 and `/api/health` reports `persistence=postgres`; no mock data is shown. Failure: leave prior web release serving; fix database/config and redeploy.
4. Exercise one event per class through the backend. Success: after catch-up `backend_sync.pending_events=0`, backend `dashboard_outbox` has no old unacknowledged rows, dashboard row has `source_id=backend:<id>`, and the topology card/event count are correct. Restart the dashboard: row count stays unchanged. Failure: inspect export auth, network, `last_error`, backend delivery queue, and database; preserve the queue and retry. Do not reset the observational cursor to hide a gap.
5. If using Discord import, send an `[OCRT]` message in every allowlisted channel, then disconnect/reconnect the bot in staging. Success: `synced_channels=channels`, `failed_channels=0`, `oldest_sync` advances, each accepted message appears once, malformed telemetry increments `discord_rejections`. Failure: repair permissions/intent or a rejected message, then let cursor replay. Do not point Discord at events already imported through the backend.
6. Deploy and test machine heartbeat producers. Success: a report appears on the correct machine card within one poll; stale online reports degrade after 60 s and become offline after five minutes. Failure: leave cards `unknown` and fix reporters/probes; do not infer machine health from attack telemetry.
7. Run 2× expected peak for one hour and a short 5× burst in staging; compare source and dashboard totals. Success: p95 `/api/status` and `/api/events` <1 s, normal event visibility ≤15 s, p99 ≤60 s, stable memory/DB connections. Failure: reduce traffic, tune database capacity/import limits, and repeat the rehearsal.

Poll `/api/health` at least every 30 s. It returns 503 when configured Discord import is disconnected/stale/failing, when backend sync fails or is stale over 120 s, or when more than 1000 backend events remain unacknowledged. Alert on any nonzero `discord_rejections`, sustained queue depth, and database saturation. Keep the previous deployment artifact for rollback. If the importer fails, remove both `BACKEND_EXPORT_URL` and `BACKEND_EXPORT_SECRET` while investigating; existing rows and the backend delivery queue remain. Reenable after repair; acknowledged IDs deduplicate replay.
