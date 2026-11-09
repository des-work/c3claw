# Nestler migration — staged, public cutover pending

Verified: 2026-11-09 07:57 UTC / November 8, 11:57 p.m. Pacific.

## Current service

- Public dashboard: https://claw-and-order.csusb-robotics.workers.dev/
- This remains in Desmond's account. Its Worker, database, schedule and credentials were not changed during staging.
- Hosting transfer is incomplete. Do not announce a replacement URL yet.

## Completed in Nestler's account

- Desmond's accepted invitation grants Workers Admin and D1 Admin.
- Account: `7dc280ecf2c85a687171fd25c4cf25aa`.
- D1 database: `claw-and-order`, `a9dea873-de71-4c5d-9586-d49fd6aa88cc`.
- Full source SQL backup saved privately, checksum verified and restored locally and remotely.
- Eleven table counts and fourteen schema objects match. The snapshot contains zero events, teams and machine reports; one migration-history row.
- Website/API Worker `claw-and-order` uploaded. Version: `8ee3afef-3352-40a6-a1cc-084c2adb65e1`.
- Database binding and presence of `EVENT_API_KEY` verified through Cloudflare's API.
- Public URL, preview URLs and scheduled collection are disabled in the staged Worker.
- Build and deployment dry run passed. Public HTTP/runtime checks are pending an address.

## One owner action needed

Nestler: sign into your own Cloudflare login, open [Workers & Pages](https://dash.cloudflare.com/7dc280ecf2c85a687171fd25c4cf25aa/workers-and-pages), and complete the initial Workers setup so the account receives a `workers.dev` address; keep the free plan.

Report back when the address exists. No payment details, account-wide billing role or additional account access are requested.

Evidence: the subdomain GET returned 404 with Cloudflare's initial-setup instruction. The registration PUT returned 403. Opening Workers & Pages as the invited administrator displayed **No access / Authentication error**. Database and Worker operations succeeded with the same login. The exact internal permission reason is unverified.

## Remaining cutover work — telemetry coordinator

1. Verify the registered address through Cloudflare; use the returned name rather than an assumed URL.
2. Enable the staged Worker's public address while keeping collection paused.
3. Check the gallery, static assets, dashboard/API responses, database binding and expected health diagnostics.
4. Verify unauthenticated writes fail and an authenticated invalid event returns 400 without creating data.
5. Pause original scheduled collection. Take a final source snapshot and compare it with the restored copy. If anything changed, restore the final snapshot into a new empty database and rebind before cutover; do not overwrite a database containing live target writes.
6. Confirm the reader settings and source mapping required for any live Discord feed. Enable collection only in the intended account; retain the five-minute schedule.
7. Switch the normal deployment target to Nestler only after the new endpoint passes checks. Update the student-facing URL and any direct HTTPS publishers' URL/key through their operators.
8. Retain the original deployment/database for rollback. Retire it only after the new service and publishers are verified.

## Credential and telemetry boundary

The local event key did not authenticate against the original Worker. A fresh destination-only event key was generated, saved in an owner-only file outside Git, and provisioned in the staged Worker. The original key was not reset. Direct event/heartbeat publishers, if used, must receive the new URL and key securely at cutover. Discord readers use a separate bot credential.

The staged Worker still lacks `DISCORD_BOT_TOKEN`, `ALLOWED_CHANNELS` and `DISCORD_SOURCE_POLICY_JSON`, matching the original service's missing reader configuration. No actual Discord-to-dashboard delivery was proved by the hosting migration. Machine heartbeats remain optional; absent reports mean unknown machine health.

## Deployment controls

`cloudflare.config.ts` retains paired account/database targets. `CLAW_DEPLOY_TARGET=nestler` selects the new account; the default remains `desmond` until cutover. `CLAW_COLLECTOR_PAUSED=1` removes scheduled triggers. `CLAW_WORKERS_DEV_DISABLED=1` prevents a public Workers address. Preview URLs remain disabled.

The staged build used both pause flags. Configuration changes are local; no GitHub push was made. No plan, payment method or billing settings were changed. Nestler must verify his own billing configuration before any funded usage.

## Failure plan

Until cutover, use the unchanged original public site. If target checks fail, leave target collection paused and retain its database for investigation. After cutover, stop target collection before resuming original collection. Compare and preserve any target-only records before rebinding; code rollback does not reverse database writes. Label disconnected telemetry as unavailable rather than interpreting empty data as inactivity.
