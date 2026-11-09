# OCRT publisher adapter

`scripts/ocrt-publish.py` turns structured activity records into the one wire
format the dashboard trusts, and posts them through a mapped Discord webhook.
Python 3, standard library only, no install step.

## Why an adapter is required

The receiver authorises a message by its **webhook ID**, matched against
`DISCORD_SOURCE_POLICY_JSON` for the reporting team. A native bot message
carries no webhook ID, so an agent that chats into a channel produces no
dashboard activity regardless of how its text is worded. Verified both ways:

| Source | Result |
| --- | --- |
| Post through a mapped webhook | Accepted and attributed to the mapped team |
| Native bot post (no webhook ID) | Rejected — `Webhook/channel is not authorized for this team` |
| Mapped webhook, unmapped team | Rejected |

## Wire format

```
[OCRT] team_id | tool | target | result | details
```

## Input contract

One JSON object, a JSON array, or JSON Lines, on stdin or `--input`.

| Field | Required | Limit |
| --- | --- | --- |
| `team_id` | yes | 1–64 chars of `A–Z a–z 0–9 _ -`, and mapped to the posting webhook |
| `tool` | yes | 100 chars |
| `target` | yes | 200 chars |
| `result` | yes | 40 chars |
| `details` | no | 2000 chars, truncated if longer |
| `event_id` | strongly recommended | dedup key; without it a repeat republishes |

A pipe inside `team_id`, `tool`, `target` or `result` becomes `/` so it cannot
shift the receiver's field order. Pipes inside `details` are preserved.
Newlines and control characters collapse to single spaces.

## What the current Hermes cron must add

The existing cron reports `UniqueID/TeamID/Success-Failure`. That maps to
`event_id`, `team_id` and `result` — it carries **no `tool` and no `target`**,
both of which are mandatory and non-empty. The adapter rejects such a record
rather than inventing the missing fields, because a guessed target would place
fabricated activity on a student-facing dashboard.

To publish, the job must emit the tool it actually ran and the target it ran
against. Operational notices ("worker exited", "model repetition") are not
activity records and should not be forced into this path at all.

## Running it

```bash
# See exactly what would be sent. Contacts nothing.
echo '{"team_id":"DEV_01","tool":"nmap","target":"10.0.0.5","result":"success","event_id":"job-1"}' \
  | python3 scripts/ocrt-publish.py --dry-run

# Publish, with duplicate suppression.
python3 scripts/ocrt-publish.py --input events.jsonl \
  --webhook-file /private/publisher-webhook.json --state /private/publisher-state.json
```

The webhook URL comes from `--webhook-file` (`{"webhook_url": ...}`, mode 0600)
or `OCRT_WEBHOOK_URL`. It is never printed, logged or echoed. Keep it out of
source control and out of shell arguments.

## Behaviour that protects the data

- **Duplicates.** The receiver keys events on the Discord message ID, so
  re-posting an action creates a second event and a second count. `--state`
  records published `event_id`s and skips repeats. A corrupt state file stops
  the run instead of republishing blind.
- **Uncertain delivery.** A request that fails without a response may or may
  not have arrived. The adapter reports it as uncertain, stops, and does not
  retry — check the channel before republishing that record.
- **Rate limits.** HTTP 429 is retried honouring `retry_after` (bounded), 5xx
  with bounded backoff. Other 4xx are reported, never retried.
- **Mentions.** Every post sets `allowed_mentions: {"parse": []}`, so telemetry
  cannot ping a class server.
- **User-Agent.** Discord's edge rejects the default Python agent with
  Cloudflare error 1010, so an explicit client agent is always sent.
- **Exit code.** Non-zero if any record was rejected, failed, or is uncertain,
  so a cron wrapper notices.

## Verifying a deployment

1. `node --test tests/ocrt-publish.test.js` — 10 checks that run the adapter's
   real output through the receiver's own parsers.
2. `--dry-run` against real records; confirm the fields are what you expect.
3. Publish one record, then run the read-only reader check:
   `npm run telemetry:check -- --config <private settings> --network`.
   `authorized_telemetry` should increase by exactly one and `malformed` and
   `untrusted_source` should stay at zero.

Step 3 proves the message is readable and authorised. It does not prove the
Worker wrote an event: that requires the three Discord settings provisioned on
the Worker and one scheduled sync.
