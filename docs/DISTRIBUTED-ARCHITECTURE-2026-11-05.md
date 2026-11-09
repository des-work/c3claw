# Claw and Order distributed architecture and pipeline review

November 5 2026  |  For Dr Nestler Matthew Danny Ron Jose and the project lead

Architecture revision 1  |  Target exercise start Monday November 9 2026

## Decision and implementation position

We are updating the exercise architecture to place Orange team agents on three Mac Studios, Blue team workloads on Cyberlabs GPU systems, and Red team workloads on ACCESS Jetstream with four A100 GPUs. This placement was reported by the project lead following Dr Nestler’s direction. Installation, allocation availability and live connectivity have not been verified.

The core dashboard and event intake do not depend on a particular GPU or language model. The placement change requires deployment configuration, source mappings, host inventory and cross site testing. Existing gaps in agent identity, reporting compatibility, credential scope and cross team attribution still require decisions or code work before those capabilities can be accepted.

This revision supersedes earlier placement assumptions. Cloudflare continues to host the public dashboard, API, Discord reader and D1 telemetry database. The private enrollment and scoring application remains a separate Cyberlabs service. Heroku references describe historical hosting.

## Confirmed placements and open specifications

| Role | Reported placement | Specification still required |
| --- | --- | --- |

| Orange | Three Mac Studios. Initial model label was “Orinth 3.5 MoE”; the project lead could not confirm the exact model name. | Jose and Dr Nestler supply the exact model artifact, revision, quantization, serving runtime and topology. Confirm each Mac’s chip, memory, OS, host ID and agent assignments. |

| Blue | Cyberlabs systems described as “ld40s.” The hardware designation remains unconfirmed; L40S has not been established. | Matthew and Danny confirm GPU make, model, count and memory; host and VM inventory; agent runtime versus model server placement; capacity and execution network. |

| Red | ACCESS Jetstream with four A100 GPUs. The count and A100 designation were clarified by the project lead. | Allocation operator confirms exact VM flavors, GPU attachment, usable memory, quota, remaining service units, expiry, deployed model and runtime. Four GPUs do not establish four VMs or four teams. |

Treat “Orinth 3.5 MoE” as an unverified label. We have not selected a substitute model, asserted that it fits the Macs, or assumed that three Macs provide one shared memory pool. Blue and Red model names are also pending.

## Architecture overview

The diagram shows the planned logical relationships. Dotted lines identify the runtime and model mapping still owed by the component owners. It does not certify that services or routes have been installed.

Architecture diagram: Orange on 3 Mac Studios; Blue on Cyberlabs GPUs; Red on ACCESS Jetstream with 4 A100 GPUs. Map model endpoints, agent runtimes and execution hosts. Approved publishers feed existing Discord, which feeds the Cloudflare Worker, D1 and public dashboard. Private roster and role operations remain in Cyberlabs.

## Separate the model agent and execution layers

A model server performs inference. An agent runtime holds instructions and state and chooses tool actions. A Kali VM or other tool host executes those actions against approved exercise targets. These may be on the same system or on separate systems. The current placement decision does not specify that mapping for every agent.

For each agent, record the inference endpoint it calls, where the agent process runs, where tools execute, which class and team it serves, and which process publishes telemetry. If Jetstream serves only the Red model, its API needs a trusted path from the agent runtime. If Red tools also execute in Jetstream, the approved route to Cyberlabs targets is a separate requirement. Matthew and the designated Jetstream operator must agree that route.

Each Mac needs its own supported serving and restart procedure. Linux systemd units supplied for the Cyberlabs API and worker are not a macOS installation procedure. Do not move Linux credentials or services onto the Macs merely because an Orange model runs there. Jose and Dr Nestler must document their actual Mac agent and manager deployment.

For each model, confirm the exact artifact and version, license, weight format and quantization, tokenizer and chat template, context limit, tool call support, serving API, authentication and capacity. Measure memory, response time and concurrent sessions on the real hardware. A model that answers chat still needs a tool use and instruction behavior test. Keep any paid or external model fallback explicit and approved.

Hermes supports configurable model providers and custom endpoints. The supported configuration syntax and effective session behavior must be checked against the installed Hermes version. Record the main model, auxiliary tasks and fallback destinations so a routing change cannot silently send data or charges to a different provider.

Hermes model configuration reference https://hermes-agent.nousresearch.com/docs/user-guide/configuring-models

## Shared services and data paths

| Path | Intended operation | Acceptance evidence |
| --- | --- | --- |

| Activity to Discord | An approved script or adapter reports a real executed action through the existing server and mapped posting webhook. | One real output sample from every publisher variant maps faithfully to the accepted event fields. Native bot chat is not assumed compatible. |

| Discord to dashboard | The scheduled Cloudflare reader checks approved channel and webhook mappings, persists events in D1 and serves the public gallery. | Required channels are readable; source validation, backlog catch up, duplicates and stale feed behavior pass. |

| Machine health | A trusted monitor submits authenticated reports to /api/machines/heartbeat independently of attack events. | Inventory and observed machine identity match. An absent heartbeat degrades and then expires; a chat reply is not a health check. |

| Enrollment and roles | Excel or CSV intake goes to the private Cyberlabs backend for reviewed preview, approval, registration and role reconciliation. | Faculty reconciles Discord only students; create, move and withdraw tests verify effective access and a readable audit trail. |

| Scoring and export | The Python backend validates team credentials, target ranges and exercise phase, then records scoring activity. A restricted export can feed the dashboard if selected. | Demonstrate the intended scoring path separately. A Discord event appearing in the gallery does not prove it entered the scoring backend. |

The Discord contract is [OCRT] team_id | tool | target | result | details, bound to an approved channel and posting webhook ID. A webhook URL sends messages to Discord; a reader bot token reads them. The existing source policy remains strict. Do not allow ordinary bot messages or additional webhooks until the producer and attribution rules are reviewed.

Choose one authoritative dashboard event feed for a logical action. The current configured selection is Discord. If the backend export is selected later, coordinate cutover, checkpoints and replay; feeding the same action through two paths can double count it. Discord posting time and backend receive time are not independently verified execution time.

GPU hosts, model services, agent processes and exercise machines have different health meanings. A current host heartbeat proves only what its monitor tested. Model readiness needs a model request; agent readiness needs a checked runtime and tool path. The existing gallery represents team machines and four network zones; it is not yet a fleet view of model and agent readiness.

## Network access and credential boundaries

| Connection | Required scope | Configuration owner |
| --- | --- | --- |

| Agents to model service | Only the approved inference API over a protected authenticated path. Record endpoint and port; no serving port has been selected in this plan. | Jose and Dr Nestler for Orange; Matthew for Blue; Red operator still to be designated. |

| Tool hosts to exercise targets | Approved lab ranges and exercise windows only. Document private routing and return traffic if sites differ. | Matthew and the relevant host or allocation operator; faculty approves target scope. |

| Publisher to Discord | Outbound HTTPS to its assigned posting webhook. Keep posting tokens out of prompts, shared documents and client code. | Publisher owner with Ron. |

| Cloudflare reader to Discord | Outbound Discord API access with the existing reader identity and effective channel visibility. | Project lead with Ron. |

| Trusted monitor to Cloudflare | HTTPS authenticated writes with approved team and machine identity. Keep the current broad write key in trusted operator infrastructure. | Project lead with Matthew and site operators. |

| Private backend and role worker | Restricted staff API, PostgreSQL and Discord connections; separate administrator, planner and enrollment worker credentials. | Matthew with Ron for Discord role hierarchy and channel checks. |

Remote services cannot reach a Cyberlabs loopback listener or private subnet simply by changing a hostname in a document. Keep the backend behind its trusted TLS reverse proxy and approved access controls. Do not publish database, administrator or unauthenticated inference ports to solve a routing problem. Verify DNS, TLS trust, firewall rules and reconnection from the actual client host.

Jetstream network documentation describes broadly available VM networking, with defaults dependent on the launch interface. This does not establish our campus route or security groups. The allocation operator must confirm the actual configuration and authorized exercise use. Keep protected student roster data in the approved Cyberlabs workflow; sending it to Jetstream requires a separate institutional decision under the service’s published data policy.

Jetstream networking reference https://docs.jetstream-cloud.org/overview/network/

Jetstream usage and protected data policy https://docs.jetstream-cloud.org/general/policies/

## Identity instructions and operational records

Maintain one reviewed inventory linking a stable agent_id to host_id, runtime instance, model endpoint and artifact, class_id, team_id, exercise role, tool host, Discord bot or webhook and channel IDs, publisher version, owner, backup contact and approved instruction manifest. Give every agent a readable name containing its canonical ID. A GPU, a VM, a bot and a team are different entities.

Keep the logical agent ID through a rename or restart; give independent running clones different IDs and distinguish runtime instances. Record effective dates for team moves. Each process needs isolated memory, session storage, cursor, retry buffer and configuration paths. Reusing the same host or model endpoint does not authorize sharing agent state or credentials.

Danny’s mapping remains a required input. Jose and Dr Nestler must supply the Orange equivalents. Review the actual loaded SOUL and project instruction files, overrides, tools, skills, permissions, schedules and model fallbacks. Keep file hashes and approvals with the release. Test the intended behavior on each selected model because changing the model can change instruction and tool behavior even when the text is identical.

The proposed end to end identity registry is not implemented in the current event pipeline. Displaying an ID in free text or a Discord nickname is an interim human aid, not source validated identity. Enforcing identity requires an agreed schema, source binding, storage and display changes with migration and spoofing tests.

## Code and pipeline impact review

The local review covered the dashboard Worker, shared parsers, source policy, topology projection, backend event and authentication models, reporter and deployment templates. It did not inspect the independent Orange code, live SOUL files, Macs, Cyberlabs servers or Jetstream account. Findings below distinguish changes required for placement from capabilities that need a design decision.

| Finding | Impact and required action | Classification |
| --- | --- | --- |

| A1 Hardware coupling | No GPU or model branch was found in the reviewed event intake and topology code. Keep valid shared event and HTTP contracts while configuring the new hosts. | No core rewrite required solely by GPU placement. |

| A2 Agent identity | Both event schemas discard extra agent identity fields. Add validated IDs, source bindings, persistence, export and display if unique agent traceability remains a launch requirement. | Code and migration work required for that requirement. Existing gap. |

| A3 Broad dashboard write key | The current EVENT_API_KEY authorizes writes for any valid team or machine identifier, including unlisted machines. Keep it on a trusted central collector, or implement scoped credentials and inventory enforcement before distributing writes to agent hosts. | Security architecture decision required before credential distribution. |

| A4 Publisher compatibility | The Discord reader requires mapped webhook messages. The optional Python reporter expects tool.end JSONL and defaults to an OpenClaw log path. Inspect real Hermes and Orange output and implement a tested adapter where contracts differ. | Producer configuration required; adapter code conditional on real fixtures. |

| A5 Target attribution | Backend events have one team_id and validate targets against that authenticated team’s CIDRs. Separate Red actor and Blue defender attribution is not supported by adding fields to today’s payload. | Design and code required if automated cross team attribution or scoring is enabled. |

| A6 Health reporting | Legacy backend heartbeat updates team freshness and is filtered from dashboard event export. It does not send the Worker’s per machine heartbeat. Install or adapt a trusted independent health reporter. | Deployment and reporter integration required. Add service health schema and UI only if required. |

| A7 Remote endpoints | Reporter example uses private HTTP; backend server examples bind loopback. Configure a reachable protected HTTPS origin for remote clients and preserve TLS verification. | Configuration required for any remote backend path; no HTTP example is a production endpoint. |

| A8 Platform and process state | Cyberlabs service examples are Linux systemd or container deployments. Multiple agents need separate runtime and reporter state paths; Mac lifecycle and recovery need their own procedure. | Owner deployment work. Any Orange code portability remains unreviewed. |

| A9 Inventory and gallery | Refresh TOPOLOGY_JSON and Discord policies with real IDs. Current zones are operator, wan, dmz and lan; hardware site, GPU, model and agent readiness are not first class fields. | Configuration required. Fleet or role views require schema and UI work if requested for launch. |

| A10 Shared managers | Orange manager role changes, scoring and event production may overlap existing workers. Specify one authority per action and stable operation IDs; current source ID deduplication is not cross bot operation deduplication. | Interface decision required. Reconciliation or adapter code depends on the Orange handoff. |

Recommended implementation boundary. Complete inventories, endpoint selection and real fixtures first. Then implement the smallest reviewed changes for required identity, credential scope and attribution. Leave unreviewed integrations disabled. A manual registry alone does not satisfy the requested enforced agent traceability; faculty must explicitly accept a reduced scope if that implementation cannot be validated before Monday.

## Verification performed for this revision

Five focused JavaScript test files passed: Discord source policy, event parsing, backend transport, topology and refresh policy. Four additional local JavaScript contract probes and two Python schema and CIDR probes passed. They confirmed hardware independent parsing, unknown status without reports, rejection of unmapped native bot sources, remote exporter HTTPS enforcement, discarded identity fields and team target restrictions.

The focused asynchronous backend test attempt did not complete. A single valid token database test was then bounded to 30 seconds and timed out; its cause is unresolved. The schema and CIDR probes completed without a database. No fresh database regression pass is claimed. The earlier 94 backend tests and isolated PostgreSQL rehearsal remain historical evidence, and live site acceptance is still required.

Reviewed sources were dashboard commit d48d64305b61ff7918382a2fb68ee6a9e85fee34 and backend commit 7c6518980fef6f712d43355f8ed0248bbfce6ef6. New work in this revision updates documentation and records local probes. No runtime implementation or production configuration was changed for the placement decision.

## Staged rollout and acceptance

First, each owner returns a completed inventory and a real output fixture, and the project lead publishes one approved architecture register. Second, site operators configure a representative agent and reporter per site with restricted credentials. Third, run the joint pilot and accept a versioned release, recovery instructions and support window. Expand only after the representative paths pass.

| Gate and lead | Success outcome | Failure plan |
| --- | --- | --- |

| Placement and models / Site owners | Actual host and runtime mapping is signed off, exact models load, tools work and measured concurrency meets the agreed exercise load. | Hold the affected agents; use a faculty approved reduced scope or previously verified setup. |

| Network and credentials / Matthew and site operators | Required clients reach only approved endpoints and targets; invalid credentials and wrong team or machine writes are denied by the chosen control boundary. | Keep writes on the trusted collector; repair the route or credential design before enabling the remote path. |

| Identity and instructions / Project lead Danny and Orange owners | Unique validated identities survive rename and restart; clones differ; team moves preserve history; effective instructions and model behavior pass review. | Hold unreviewed identities or components. Record any accepted manual limitation explicitly. |

| End to end telemetry / Project lead and Ron | One real action per publisher variant arrives faithfully at the intended team and agent; replay does not duplicate it; rejected inputs produce readable evidence. | Preserve original evidence and buffers; repair the adapter. Keep the feed visibly unavailable or stale. |

| Joint operation and roles / Jose Dr Nestler Ron and Matthew | All enabled bots run together; approved roster changes isolate access; no event loops, role conflicts or duplicate scoring occur. | Stop the conflicting integration and reconcile from the approved roster and change log. |

| Health load and recovery / Matthew project lead and operators | Machine, model and agent health checks are distinguished; backlog recovers under expected load; a site outage and restore are rehearsed. | Reduce optional concurrency or refresh; keep evidence durable and use the agreed manual reporting fallback. |

| Launch ownership / Dr Nestler and faculty | Roster and Red coverage are approved, public fields and final URL accepted, hosting and allocation owners named, all required gates have evidence. | Approve a specific limited exercise or defer unsupported activity. Do not infer readiness from host availability. |

Retain the standard five minute dashboard refresh and source poll, one minute cache and five minute machine reporting cadence. More GPU compute does not require a faster public feed. Rehearse the actual channel count and message volume because the scheduled reader currently visits two channels per run. Measure delayed visibility and backlog rather than promising instant updates.

Record model service health, agent runtime health and tool execution readiness in operator reports even if the current public gallery cannot show them separately. A host can remain healthy while inference or an agent fails. Report each failure with affected role and teams, last good operation, backlog, recovery action and next update.

## Owners and immediate requests

| Owner | Next required delivery |
| --- | --- |

| Jose and Dr Nestler | Orange model identity and Mac inventory, agent and manager source versions, interfaces, permissions, state isolation, restart and stop procedure, reporting samples and joint test support. |

| Danny | Hermes and Kali runtime to host mapping, loaded SOUL and configuration manifests, agent IDs, tool and publisher details, real telemetry fixtures and recovery state locations. |

| Matthew | Confirm Blue GPU designation and actual Cyberlabs service deployment; approve network boundaries, backend installation, central collector location, recovery and integration support. |

| Ron | Complete Discord inventory and staff visibility, bot and webhook mappings, effective permissions and confirmation that the new publishers use approved sources. |

| Dr Nestler | Designate the Jetstream allocation PI or operator and backup; confirm available GPU allocation and funding, Cloudflare ownership, exercise scope and final acceptance authority. |

| Project lead | Maintain the architecture and source register, coordinate required code decisions, telemetry validation, dependency updates and the joint pilot evidence. |

| Dr Nestler and Cassandra | Approve the authoritative roster, Red coverage of both Blue classes, targets, attribution and scoring rules, and any reduced scope. |

Each owner should confirm the requested delivery time, blocker and test availability in the existing shared coordination register. The proposed Friday November 6 handoff and pilot still require their agreement. Announce changes to hosts, models, agent identity, roles, credentials or interfaces before changing a shared dependency. Matthew needs accepted inputs before Monday.

## Cost continuity and recovery

Cloudflare ownership and billing transfer to Dr Nestler remain planned. Keep the current public URL authoritative until any account migration is tested and announced. A host placement change alone does not require a new dashboard URL. Keep student identity data and secrets out of public telemetry.

Jetstream GPU service units and availability require a separate allocation check. The published flavor table identifies A100 options, but physical node capacity does not prove our project has those GPUs assigned. Record actual flavor, usable memory, service unit rate, remaining balance, expiry and shutdown responsibility. Also retain model weights or a reproducible download reference and persistent runtime volumes outside a disposable VM root disk.

Jetstream VM flavor and allocation reference https://docs.jetstream-cloud.org/general/vmsizes/

Assign recovery owners per site. If a Mac fails, stop its agent before activating a replacement to avoid duplicate authority. If a model or Jetstream allocation fails, pause the affected work and preserve sessions and telemetry for controlled recovery. Replay from durable records, verify operation IDs and resume only after a health check. Never silently change models, targets or scoring rules to keep activity moving.

## Code evidence for implementers

Paths below refer to the reviewed repositories and can be used to locate the affected contracts. They are evidence locations, not a claim that the proposed schema changes are implemented.

| Repository and file | Evidence |
| --- | --- |

| c3claw shared/events.js lines 6 to 21 | Fixed event projection preserves team and source information and drops additional agent or placement fields. |

| c3claw shared/discord.js lines 5 to 42 | Exact channel webhook and team authorization; pipe delimited telemetry parser. |

| c3claw cloudflare/worker.js lines 118 to 148 | One write secret for events and heartbeats; machine fields are syntax checked and unknown inventory entries can be stored. |

| c3claw shared/topology.js lines 1 to 29 and src/components/TopologyGallery.jsx | Four network zones and machine labels; no dedicated site model or agent readiness entity. |

| c3claw shared/backend-sync.js lines 4 to 14 | Backend heartbeat events are omitted from activity export mapping. |

| Operation Claw and Order backend/routers/events.py lines 34 to 73 and backend/services/auth.py | Single team event schema; team scoped credential check and target CIDR restriction. |

| Operation Claw and Order reporter/reporter.py lines 201 to 227 and 487 to 499 | Legacy log path and per process state configuration; tool.end JSONL contract. |

| Operation Claw and Order reporter/reporter_config_template.json and deploy/README.md | Private HTTP example, Linux deployment assumptions and distinct planner versus administrator credentials. |
