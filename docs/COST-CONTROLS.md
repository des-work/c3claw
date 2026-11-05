# Standard refresh and cost policy

Updated November 4, 2026. **Default target: free Cloudflare hosting, with a slower five-minute service.** Faster updates require an instructor/lab sponsor to approve the account plan/budget and an administrator to deploy reviewed settings. Students and dashboard viewers cannot select a faster interval. No subscription is automatically created or upgraded by this code.

## What is deployed by the standard profile

| Component | Standard setting |
| --- | --- |
| Browser | One combined `/api/dashboard` request every five minutes instead of separate 4-second event and 15-second status requests |
| Background tabs | Scheduled polling pauses; returning to the tab respects the existing cooldown |
| Failed refresh | Backoff grows from 5 to 10, 20 and at most 30 minutes; last snapshot stays visibly labelled |
| Shared Worker cache | Public read snapshots cache for 60 seconds; authorization/cookie/Access-bearing requests return private/no-store; health and writes are never cached |
| Discord/backend collection | Scheduled every five minutes; durable checkpoints and source timestamps remain intact |
| Machine producers | Configure **sending** every five minutes, with positive jitter if possible; do not send every 30 seconds |
| Machine write guard | At most one stored observation per machine per five minutes. Earlier attempts receive 429 and `Retry-After: 300`, with no status-row update |
| Machine freshness | Degraded after 12 minutes without a report; offline after 20 minutes; explicit offline reports still show offline when accepted |
| Feed freshness | Health reports stale collection after 15 minutes |

Workers Cache reduces database reads and CPU work; cache hits still count as incoming requests. With this cache enabled, static asset requests also count at the standard request rate, so the estimates include a page-load reserve.

The browser updates indicator age locally without making extra requests. Each machine shows its report time, and the gallery shows the snapshot time. Overall machine health uses machine reports rather than the team's last attack-event time. An idle team does not make a reporting machine appear offline.

**Latency tradeoff:** five-minute collection, a shared snapshot cached up to one minute, and five-minute browser polling can produce around **11 minutes** of source-to-screen delay in the worst normal alignment. Use a 12-minute normal visibility acceptance target for this profile. There is no promise of immediate failure detection. Large recovery backlogs or outages can take longer and must remain visible in health/reports.

The original 60-second/5-minute machine thresholds, two-minute event pilot target and one-minute source schedule in older handoffs are superseded for the Cloudflare standard profile. The retained legacy API endpoints remain available, but the new dashboard uses the combined snapshot.

## Expected costs

These are estimates for **the Cloudflare dashboard, API and D1 database**, not invoices. The active account plan and spare quotas remain unverified. Other projects share the account allowances. Existing Cyberlabs VM/PostgreSQL hosting, email delivery, staffing and optional custom domains are outside these figures.

- **Workers Free:** $0 within the free allowances; 100,000 incoming requests/day and 10 ms CPU per invocation. Exceeding the free allowance causes errors rather than providing a guaranteed service.
- **Workers Paid:** minimum **$5 USD/month for the account**, including 10 million monthly requests and 30 million CPU milliseconds; additional usage is metered. If the account is already paid for another project, this application's incremental bill may remain $0 within the shared allowances.
- **D1 Free:** 5 million row reads/day, 100,000 row writes/day, 500 MB per database and 5 GB total storage across the account. Indexes/triggers/staging mean an event can cause several billable row writes.
- **D1 on the paid account:** first 25 billion monthly row reads, 50 million row writes and 5 GB storage included; additional usage follows D1 pricing.

| Illustrative load | Approx. incoming requests/day | Planning estimate of D1 writes/day | Interpretation |
| --- | ---: | ---: | --- |
| 30 machines, 30 viewers, 1,000 events/day | 13,456 | 22,096 | Free target has room before other projects/traffic |
| 90 machines, 100 viewers, 5,000 events/day | 42,296 | 79,376 | Free target is plausible; measure D1 writes and reserve account headroom |
| 180 machines, 200 viewers, 10,000 events/day | 84,016 | 155,296 | Estimated writes exceed D1 Free; budget a paid plan or reduce the approved workload |

Assumptions: machine reporting runs 24 hours/day at five-minute intervals; viewers remain visible eight hours/day; two source channels; one health check per five minutes; a conservative direct-event HTTP reserve even if events arrive via Discord; and 12 startup/page asset request units reserved per viewer/day. D1 estimates use 10 writes/event for staging, deletion, indexes and summaries plus heartbeat/cursor/lease updates. Actual metadata may differ; measure `rows_read`/`rows_written` during the pilot. Request estimates do not guarantee CPU, storage or row-read capacity.

For one viewer, an eight-hour day drops from about 9,120 dashboard API calls to **96** (about 99% fewer). Ninety machine producers drop from approximately 259,200 requests/day at 30 seconds to **25,920** at five minutes—**only after the installed producer configuration changes**.

A five-day exercise at 5,000 events/day and an assumed 4 KiB of indexed persistent storage/event is about 98 MiB, before other data. This is a sizing assumption, not a measured database size. A full semester at that rate may exceed the Free per-database limit. Export/verify archived exercise data before any approved cleanup; this profile does not delete records automatically.

Recalculate with the checked-in tool:

```sh
node scripts/estimate-cloudflare-cost.js
node scripts/estimate-cloudflare-cost.js '{"machines":90,"viewers":100,"viewer_hours":8,"events_per_day":5000,"channels":2}'
```

## Configure machine senders before the real pilot

Changing the browser cannot slow an installed Kali/probe script. Matthew must inspect each actual sender and set its timer/sleep/report interval to at least **300 seconds**, adding a small positive spread to avoid synchronized bursts. Keep source retry buffers and original event timestamps. Machine health senders should use the latest actual observation and must not repeatedly upload an old buffered "online" result as though newly observed.

On heartbeat 429, honor `Retry-After` and replace a stale queued health observation with a fresh probe at the next allowed send. Do not hammer retries or move heartbeat failures into the attack-event path. The server write guard saves database writes, but **every rejected HTTP attempt can still count toward request usage**.

The installed Kali-to-Discord script and any other external reporters have not yet been inspected. Browser/Worker controls alone do not establish the projected request savings until those producers are configured. Attack events are retained faithfully; this profile does not drop valid attack records to hide load or save money.

## Paid refresh policy and failure plan

1. Publish standard five-minute service as the included/default level.
2. If faculty wants faster collection or screen refresh, record the sponsor, funding approval and desired latency/retention first.
3. An account owner confirms the actual plan, account-wide usage and billing ownership. An administrator adjusts collection cadence, browser cadence, cache TTL, heartbeat interval and freshness thresholds together, then reruns load/recovery checks before deployment.
4. Monitor Cloudflare requests, CPU, D1 reads/writes/storage and the source backlog. Review at roughly 50%, 75% and 90% of available free allowance; the account owner must configure a real alert/inspection process. These thresholds are operating guidance, not already installed notifications.
5. If usage is too high, limit nonessential viewers/reporting sources or pause collection with a visible degraded status while preserving source history/buffers. Repair/replay deliberately. Do not silently discard events, fabricate green indicators or automatically purchase capacity.

**This is not a hard dollar spending cap.** Public callers can reload or call endpoints directly; per-machine database throttling cannot eliminate their incoming HTTP requests. Existing paid-plan overages and unrelated account traffic remain possible. A stronger account/network spending-control design would need an approved access policy and billing/usage controls. The normal-client defaults substantially reduce usage without claiming to enforce a Cloudflare-wide invoice limit.

Official sources checked November 4, 2026: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Workers Cache](https://developers.cloudflare.com/workers/cache/).
