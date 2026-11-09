# Telemetry operator checks

## Responsibility

Our side owns the Cloudflare website, D1 receiver, telemetry validation,
dashboard inventory, freshness indicators and receiver tests. Matthew owns the deployed
Hermes/Cyberlabs code. Send publisher contract requirements and observed failures to
him; do not claim an untested publisher or host is working.

We can operate the existing Cloudflare account using its authorized session. A
GitHub push does not deploy this Worker. Keep the public URL unchanged during testing.

**Operating decisions are still open.** The receiver's existing code requires an
explicit channel/webhook/team allowlist for automatic Discord ingestion. That is a
technical requirement of this implementation, not evidence that the team approved a
publishing path or source mapping. Choose the path and attribution rules before enabling
ingestion. Machine heartbeats are optional for an activity-only launch.

See [the granular launch plan](TELEMETRY-LAUNCH-PLAN.md) for owners, dependencies,
individual checks and launch fallbacks. Incomplete tests remain explicitly unverified.

## Verified November 8, 2026

- Production dashboard API responds, but the live Discord feed has not been connected.
- Cloudflare secret-name listing contains `EVENT_API_KEY` only; no Discord bot token.
- No reader token is present in the local project environment or process environment.
- Current Dogpark channel/webhook/role/member IDs are captured privately. IDs alone do
  not authorize a webhook to claim a class or team.
- Native Hermes CVE-reporter responses and the observed webhook `test` message are
  not accepted telemetry records. This does not establish that a separate publisher
  is broken. Its actual reports must be checked.
- Machine health uses authenticated heartbeat reports, independently of chat/events.
  No heartbeat means unknown, even if an agent posts to Discord.

## Read-only preflight

Use Node 22.23 or later in the project's supported engine ranges. From the repository:

```sh
npm run telemetry:check -- --help
npm run telemetry:check -- --config /private/settings.json --report /private/check-offline.json
npm run telemetry:check -- --config /private/settings.json --network --report /private/check-reader.json
```

The settings file is a JSON object using Worker environment keys. Supply the reviewed
values for `SEMESTER_START_AT`, `DISCORD_BOT_TOKEN`, `ALLOWED_CHANNELS`,
`DISCORD_SOURCE_POLICY_JSON`; include `TOPOLOGY_JSON` and `EVENT_API_KEY` if checking
inventory and direct-write readiness. JSON settings are encoded strings just as in
the Worker environment. See the existing source-policy and topology examples for
their structures. Keep the settings file outside Git with owner-only permissions.

The command never posts messages, writes events, changes roles or changes access.
Network mode uses only Discord GET requests, checks effective permissions and
classifies at most20 recent messages per configured channel. It stops on rate limiting
and never prints token values or message text. A sample is not a completeness audit.
Report files are created with owner-only permissions and cannot overwrite existing
files. Exit0 means the requested checks passed, not that production delivery is proven.

### Interpreting results

| Field | Meaning |
|---|---|
| `configuration.missing_settings` | Exact absent/empty settings; other settings are not inferred missing. |
| `configuration.policy_valid` | Channel and explicit webhook/team policy passed local validation. |
| `reader.access_verified` | This credential can authenticate and read the selected channels now. |
| `sample.authorized_telemetry` | Recent records satisfy the parser and source policy; nothing was imported by this command. |
| `sample.untrusted_source` | Telemetry-looking record did not match the approved webhook/channel/team tuple. |
| `sample.empty_content` | Check actual message type/content and Developer Portal settings; empty content alone is not a diagnosis. |
| `inventory.configured` | Inventory was provided. It does not prove machines exist or are healthy. |
| `production_delivery_verified` | Always false in this read-only tool. A controlled end-to-end rehearsal is separate. |

## Remaining inputs under our control

1. Identify the existing reader application we own and obtain its existing bot token
   through its authorized owner. A webhook URL cannot replace that token. Do not reset
   a shared token, create a new bot or broaden permissions without coordinating.
2. Choose the actual telemetry publishing path: existing Kali/webhook publisher or
   a Matthew-managed adapter. Confirm exact team IDs from an actual output and approved
   assignment map. Keep discussion and private conversations out of public telemetry.
3. Approve the captured channel/webhook/team crosswalk. Preserve one or two dedicated
   channels when practical; the standard collector handles two channels every five
   minutes. Do not allowlist all discussion channels.
4. If machine-health monitoring is included, obtain the machine inventory and heartbeat
   producer configuration: exact team and machine IDs, labels and expected report
   interval. Without heartbeats, launch only an inventory/activity view with machine
   health unknown. Use unique agent IDs consistently
   in the publisher contract; the current event schema does not independently verify
   or index agent/host identity.
5. Provision reviewed settings in Cloudflare using protected storage. Do not share the
   global event-write secret with students or unreviewed independent agents.

## Production acceptance

- `/api/health`: HTTP200, source current, all configured channels synced, no pending
  source failures; missing configuration continues to report degraded status.
- Real approved benign event: correct team/tool/target/result/source time on the
  dashboard exactly once. Replay must not add another count. Unknown source rejected.
- **Optional machine-health acceptance:** correct machine becomes online; reporting interruption ages to
  degraded/offline at the standard thresholds. An event cannot substitute for it.
- Source restart/outage: durable queue and checkpoints recover without missing or
  duplicating accepted events. Rejection receipts are available to the operator.
- Staged volume reflects the agreed team/machine count; backlog, latency and quota
  usage are recorded. Local synthetic tests do not measure production capacity.

Receiver regression gates: `npm test`, `npm run lint`, `npm run cloudflare:build`,
`npm run test:cloudflare`. The runtime suite uses local D1 and mocked outbound
requests; it never writes to production.

These gates establish readiness for the capabilities being claimed. They are not a
blanket stop/go decision for the separately managed pentest. If a real source cannot
be tested before the first session, keep its automatic feed unverified and do not use
the dashboard as proof of participation, scoring, absence of activity or machine health.

## Rollback

Preserve the prior deployed Worker version and existing D1 binding/secrets. Deploy a
tested code revision without changing semester cutoff or clearing any queues. If
needed, roll code back to the recorded prior version. Database contents are not rolled
back by a code rollback. Keep ingestion disabled if source identity remains unknown.
