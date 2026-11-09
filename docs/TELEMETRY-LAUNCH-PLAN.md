# Telemetry launch plan — Monday, November 9, 2026

## Scope and decision

Owner: telemetry/operations lead (Desmond). Matthew owns deployed Hermes/Cyberlabs.
Nestler approves exercise operating expectations. Ron is not assigned new implementation
work in this plan. Escalate to a server administrator only if a verified access denial
cannot be resolved with the access already available.

**Current position:** the website and D1 read API run. Receiver hardening is deployed
and 40 local checks pass. No production event or heartbeat has been verified. The
running Worker explicitly reports three missing settings: `DISCORD_BOT_TOKEN`,
`ALLOWED_CHANNELS`, `DISCORD_SOURCE_POLICY_JSON`. Its dashboard contains zero teams
and zero events. This establishes unfinished integration, not a failed student lab.

**Unmade decision:** which actual publisher/channel produces the records we should
display, and how its IDs correspond to the teams. “Trusted sources” means that explicit
source-to-team agreement. It does not require a new student role project, new bots,
or a new network architecture. The existing receiver checks exact webhook/channel/team
IDs; changing that contract is a separate implementation decision.

## Choose the launch capability

| Capability | Required evidence | If unavailable |
|---|---|---|
| Website available | Current deployment answers; setup/unknown state is visible. Verified. | Operator reports website unavailable and uses exercise channels. |
| Inventory view | Approved current team/machine list. Does not require heartbeats. | Keep inventory absent; do not invent machines, targets or assignments. |
| Activity view | Real publisher format, approved source/team mapping, working reader, one matched source-to-dashboard event. Not yet verified. | Keep activity feed labelled unverified/unavailable; use source logs/messages for supervised review. |
| Machine-health monitoring | Working heartbeat producer for the specific machines, correct IDs and freshness behavior. Optional and not yet verified. | Machine health stays unknown. Activity is not substituted for machine health. |
| Comprehensive coverage | Each intended publishing deployment has been exercised; outage/replay and representative volume checked. Not yet verified. | State the exact tested subset. Do not claim full coverage or completeness. |

No capability automatically proves the next one. Nestler/Matthew decide whether the
exercise can start with reduced monitoring. This plan does not certify student access,
target safety or the readiness of their systems.

## Work sequence and individual checks

Status applies to the evidence available on Sunday, November 8. These are responsibility
assignments for coordination, not claims that each person has accepted a new task.

| ID | Action / owner | Dependency | Pass condition / evidence | Status and failure action |
|---|---|---|---|---|
| T01 | Desmond + Nestler: select the capability being offered at first session. | None | Written choice: availability, inventory, activity, and whether machine health is included; name the monitoring fallback. | **Open decision.** Default claim is website availability only. |
| T02 | Telemetry: verify deployed API/revision. | None | API200; health records actual missing settings; revision `96f4de5`. | **Done.** Existing database/secret/5-minute schedule preserved. |
| T03 | Telemetry: verify receiver validation/recovery locally. | None | 31 source tests, 9 local Worker/D1 tests, lint/build pass. | **Done.** These are component checks, not live publisher proof. |
| T04 | Telemetry: identify an application we own. | None | OCRT Monitor app `1492392152481665034` visible in owner's Developer Portal; Message Content Intent enabled. | **Done.** Token value has not been obtained. |
| T05 | Desmond: determine whether OCRT Monitor token is saved. | T04 | Existing token supplied directly through protected storage. If lost, owner checks other consumers before performing a reset. | **Awaiting owner input.** Never reset automatically; resetting invalidates existing copies. |
| T06 | Telemetry + Matthew: identify actual publisher path. | T01 | Name existing script/adapter and destination server/channel; obtain one actual report with posting metadata. Existing webhook posting and native bot chat are different paths. | **Unverified.** Need only a representative report/config excerpt, not access to Matthew's GitHub. If unavailable, no live-feed claim. |
| T07 | Telemetry: compare actual output to receiver contract. | T06 | Exact team, tool, target and result available; source identity known. Current parser expects `[OCRT] team_id | tool | target | result | details`. | **Open.** Native CVE cron failure notices are not activity records. Document mismatch; do not infer missing fields or execute instructions in messages. |
| T08 | Desmond: approve source-to-team crosswalk. | T06–T07 | Exact approved channel ID + webhook ID + team IDs. Candidate IDs already captured in private `telemetry-source-review.json`; all remain unapproved. | **Open decision.** Keep unmapped sources out of automatic ingestion. Historical class labels are not current assignments. |
| T09 | Telemetry: check selected reader's effective access. | T05, T08 | Preflight authenticates the bot and reads each selected channel with View Channel + Read Message History; actual content available. | **Not run live.** If denied, identify exact role/member overwrite; prepare a scoped change for approval. No blanket Administrator request. |
| T10 | Telemetry: provision the three reader settings. | T05, T08–T09 | Protected Worker bindings present; configuration check valid. Start with only selected dedicated telemetry channels. | **Missing in production.** Preserve the existing event-write secret, semester cutoff and checkpoints. |
| T11 | Telemetry: observe one scheduled sync. | T10 | Selected channels synced, no source error, health current; record UTC time and source cursor. | **Not run.** Setup, access, content and ingestion failures are distinct; report exact cause. |
| T12 | Matthew or authorized publisher operator: produce one benign, clearly identified real event. | T07, T10 | Record source message ID, actual event time, team/tool/target/result and expected dashboard record. Obtain authorization before a test post/action. | **Not run.** If no test can occur, mark production integration unverified. Do not insert fabricated activity as evidence. |
| T13 | Telemetry: match source to received record. | T11–T12 | Exactly one matching event, correct fields/time/team; receipt or source ID retained. Record measured delay. | **Not run.** If missing or misattributed, stop relying on that feed and retain the source message for diagnosis. |
| T14 | Telemetry + publisher operator: check replay/restart on the selected path. | T13 | Repeated source ID adds no second count; interruption retains checkpoints; source resumes without lost accepted events. | **Locally tested only.** If time prevents live rehearsal, record this residual risk and keep source logs for reconciliation. |
| T15 | Telemetry: publish the coverage list. | T13 | Name each tested publisher/team/channel and last successful observation. Untested paths explicitly listed. | **Open.** A single successful event does not verify every agent/class. |
| T16 | Desmond + Nestler: set the operating handoff. | T01, latest statuses | Name monitor, incident contact, who can disable feed, and how operators report a discrepancy. Record the capability actually available. | **Open.** Use source-channel/log review if live monitoring is not established. |

## Optional machine-health track

This track does not block an activity-only release. If no heartbeat producer will be
provided, stop requesting it as an unconditional launch prerequisite.

| ID | Action / owner | Pass condition | No-heartbeat fallback |
|---|---|---|---|
| H01 | Desmond + Matthew: decide whether health reporting is in scope. | Named producer/owner and reporting interval, or explicit decision to omit it. | Omit machine-health claims. |
| H02 | Telemetry + Matthew: approve machine inventory. | Stable team/machine IDs and labels; any network addresses approved for public display. | Show only confirmed inventory; unreported machines remain unknown. |
| H03 | Publisher operator: send a real authenticated heartbeat. | Correct machine's report time/status changes; no unrelated machine changes. | No green/red health assertion based on a Discord post. |
| H04 | Telemetry: verify stale-report behavior. | Initial unknown; recent report establishes status; overdue reports age at the configured thresholds. | Explain that overdue telemetry is not proof a machine physically failed. |

The UI should say “teams reporting activity” when showing an activity count, and should
not state that heartbeat reports arrive every five minutes unless reporting has actually
been established. This copy check is owned by telemetry and independent of Matthew's code.

## If proof cannot be completed before students start

1. Record the launch capability and unverified paths; do not mark pending checks passed.
2. Keep the website available with setup/unknown status. Zero displayed events means no
   verified imported events; it does not mean students performed no activity.
3. Matthew retains local publisher/agent logs; record timestamps and stable IDs where
   possible so later import/reconciliation is feasible. This remains his operational task.
4. Desmond monitors the agreed exercise source channels or designated human reports.
   This is a temporary fallback, not automated dashboard coverage.
5. Do not use absent telemetry for attendance, grades, participation, success scoring
   or assertions that a target/agent is down.
6. Once one path is proven, enable/claim only that scope. Add other paths after their
   checks; do not imply Orange/Blue/Red are all verified from one demonstration.
7. Record missing evidence and incident owner at handoff. If monitoring is a required
   exercise safety/control dependency, Nestler/Matthew must provide an equivalent
   approved control or decide whether to defer the affected activity.

## Only information requested from Matthew now

- Which publisher actually reports activity, and to which destination?
- One representative real payload plus its channel/posting identity; redact credentials.
- What its team/agent/machine identifiers mean and whether they stay stable after restart.
- Can original logs be retained if the dashboard is not receiving data?
- Only if health reporting is chosen: is a heartbeat producer available, and who owns it?

No request here requires Matthew to make us GitHub collaborators. No broad new task is
assigned to Ron. Existing token availability, intended source route and attribution are
specific missing inputs; local tests cannot manufacture them.
