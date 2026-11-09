# Operation Claw & Order

**November 5 architecture revision:** [Distributed architecture and pipeline review](docs/DISTRIBUTED-ARCHITECTURE-2026-11-05.md) records Orange on three Mac Studios, Blue in Cyberlabs and Red on ACCESS Jetstream with four A100 GPUs. Exact Orange model and Blue GPU designation remain unconfirmed. Read its deployment, identity, credential and attribution gates before enabling the new placements.

> **A real-time cybersecurity operations dashboard for monitoring offensive security exercises.**

Operation Claw & Order is a high-density, single-page React application designed to be displayed on classroom screens and command-center monitors during live cyber-attack simulations. It provides instructors and exercise coordinators with a real-time tactical overview of every participating team's status, attack phase, active operations, and a scrolling event telemetry feed — all rendered in a dark, military-grade aesthetic.

---

## Features

**Standard service refreshes every five minutes.** See [cost controls and estimates](docs/COST-CONTROLS.md). Faster updates require a funded administrator-approved release.

**Current hosting target: Cloudflare Workers + D1.** Setup, Discord reconnection, acceptance checks, and recovery are in [Cloudflare deployment](docs/CLOUDFLARE.md). The Heroku sections below describe the retained legacy deployment.

Student roster/Discord enrollment integration and its deployment/failure checks are documented in [Student enrollment feed](docs/STUDENT-ENROLLMENT.md). The Cyberlabs handoff is in the backend repository.

- **Topology Gallery** — Scan each team's operator, WAN, DMZ, and LAN machines in a prominent card gallery
- **Live Machine Monitoring** — Authenticated reports update color coded machine indicators; missing reports remain unknown
- **Live Telemetry Stream** — A scrolling terminal-style activity feed showing the 20 most recent events with color-coded results (SUCCESS / FAILED / BLOCKED)
- **Overall System Health Badge** — Aggregated team and machine status: ALL SYSTEMS GO / DEGRADED / CRITICAL / UNKNOWN
- **Real-Time Clock** — UTC/local timestamp prominently displayed in the header
- **Client-Side Search** — Instantly filter teams by designation with a search bar
- **Responsive Dark Theme** — Custom Tailwind color palette designed for low-light environments and large displays

---

## Tech Stack

| Layer        | Technology                                  |
| ------------ | ------------------------------------------- |
| **Framework**| React 19 (via Vite 8)                       |
| **Styling**  | Tailwind CSS 3.4 + custom dark theme tokens |
| **Icons**    | Lucide React                                |
| **Backend**  | Cloudflare Worker; Express retained for local/legacy use |
| **Database** | Cloudflare D1; PostgreSQL retained for legacy deployments |
| **Hosting**  | Cloudflare Workers + Static Assets          |

---

## Project Structure

```
operation-claw-and-order/
├── index.html                  # App shell
├── package.json                # Dependencies & scripts
├── vite.config.js              # Vite config + dev proxy
├── tailwind.config.js          # Custom dark theme color tokens
├── postcss.config.js           # PostCSS + Tailwind + Autoprefixer
├── Procfile                    # Heroku: web: npm start
├── .env.example                # Template for environment variables
│
├── public/
│   ├── favicon.svg             # Tab icon
│   └── icons.svg               # Icon sprite sheet
│
├── server/
│   ├── index.js                # Express server, API routes, auth
│   ├── topology.js             # Inventory merge and freshness rules
│   └── db.js                   # PostgreSQL connection & queries
├── config/topology.example.json # Sample machine inventory (not loaded automatically)
│
└── src/
    ├── main.jsx                # React entry point
    ├── index.css               # Tailwind directives + scrollbar styles
    ├── hooks/                  # API polling; empty until live data arrives
    ├── components/
    │   ├── App.jsx             # Root layout orchestrator
    │   ├── HeaderBar.jsx       # Title, fleet metric, clock, status badge
    │   ├── StatusBadge.jsx     # Overall system health state
    │   ├── TopologyGallery.jsx # Searchable gallery with machine status
    │   ├── ActivityFeed.jsx    # Scrolling telemetry terminal
    │   └── EventRow.jsx        # Single event line in the feed
    ├── hooks/
    │   └── useDashboardData.js # Mock fallback + API polling
    └── assets/
        └── hero.png
```

---

## Deployment to Heroku

See [the deployment and recovery checklist](docs/DEPLOYMENT.md) before using the quick-start steps below.

### 1. Create the Heroku app

```bash
heroku create your-app-name
```

### 2. Add Heroku Postgres (recommended)

Without this, events are stored in memory and lost on every dyno restart.

```bash
heroku addons:create heroku-postgresql:essential-0
```

This automatically sets `DATABASE_URL` for you.

### 3. Set config vars

**All config vars must be set BEFORE the first deploy** because `VITE_API_URL` is baked into the frontend at build time.

```bash
# Required: The public URL of this app (so the frontend can reach the API)
heroku config:set VITE_API_URL=https://your-app-name.herokuapp.com

# Required for machine reports; recommended for event ingestion
heroku config:set EVENT_API_KEY=a-strong-random-secret

# Optional: set TOPOLOGY_JSON in Heroku config to your inventory JSON

# Required: Ensure devDependencies (Vite, Tailwind) are installed during build
heroku config:set NPM_CONFIG_PRODUCTION=false
```

### 4. Deploy

```bash
git push heroku main
```

### 5. Verify

```bash
heroku open
heroku logs --tail
```

---

## Environment Variables

| Variable            | Required | Description                                                       |
| ------------------- | -------- | ----------------------------------------------------------------- |
| `VITE_API_URL` | Optional | API origin; empty uses the dashboard origin |
| `EVENT_API_KEY`     | Yes for machine health | Bearer token for `POST /api/machines/heartbeat`; also protects event ingestion |
| `TOPOLOGY_FILE`     | Optional | Path to JSON team/machine inventory. Omit to show only machines that report in. |
| `TOPOLOGY_JSON`     | Optional | Inline inventory JSON for deployments without a local inventory file; takes precedence over `TOPOLOGY_FILE`. |
| `DATABASE_URL`      | Required in production | PostgreSQL connection string (auto-set by Heroku Postgres addon)  |
| `DISCORD_BOT_TOKEN` | For Discord import | Bot token with Message Content intent and Read Message History permission |
| `ALLOWED_CHANNELS` | For Discord import | Comma-separated telemetry channel IDs; add any number of classes or teams |
| `DISCORD_SOURCE_POLICY_FILE` | For Discord import | Required JSON file binding each allowed channel and webhook ID to exact team IDs. Copy `config/discord-sources.example.json`, replace placeholders and keep the deployment file private. |
| `DISCORD_SOURCE_POLICY_JSON` | Alternative for Heroku | The same source-policy JSON supplied through protected config. Set exactly one of JSON or FILE; no private deployment file needs to be committed. |
| `DISCORD_INITIAL_BACKFILL` | No | Set to `true` only for a fresh installation that should import existing channel history. Default starts at the current channel head to avoid duplicating legacy events. |
| `BACKEND_EXPORT_URL` | For scored events | Base URL of the scoring backend's authenticated export API. |
| `BACKEND_EXPORT_SECRET` | For scored events | Backend read-only `EVENT_EXPORT_SECRET`; required with `BACKEND_EXPORT_URL`. |
| `CORS_ORIGINS` | For cross-origin clients | Comma-separated trusted browser origins; empty permits same-origin only. |
| `DB_POOL_SIZE` | No | PostgreSQL pool maximum; default 5. |
| `PG_CA_CERT_FILE` | For private CA | PEM certificate path for verified database TLS. |
| `PORT`              | No       | Server port (Heroku sets this automatically; defaults to 3001)    |
| `NPM_CONFIG_PRODUCTION` | Yes  | Must be `false` so Heroku installs devDependencies for the build  |

*If `VITE_API_URL` is not set, the dashboard calls its own origin. Start the local API on port 3001 for Vite development.

---

## Local Development

### Prerequisites

- Node.js >= 20
- npm >= 9

### Quick start

```bash
git clone https://github.com/des-work/c3claw.git
cd c3claw
npm install
cp .env.example .env
```

### Running locally

```bash
# Frontend (port 5173; requires the local API on port 3001)
npm run dev

# Backend only (port 3001)
npm run server

# Full stack dev — Vite proxies /api to localhost:3001
# Run both commands in separate terminals:
npm run dev
npm run server

# Production simulation (build + serve on 3001)
npm run build-start
```

With `VITE_API_URL` unset, Vite proxies `/api` to the local server on port 3001. No synthetic data is loaded.

---

## API Endpoints

| Method | Endpoint       | Auth             | Description                         |
| ------ | -------------- | ---------------- | ----------------------------------- |
| GET    | `/api/health`  | None             | Health check + persistence status   |
| GET    | `/api/status`  | None             | Teams with machine inventory and current health state |
| GET    | `/api/events?limit=20` | None       | Recent events; limit 1–100, default 100 |
| POST   | `/api/events`  | Bearer token*    | Submit a new event                  |
| POST   | `/api/machines/heartbeat` | Bearer token required | Report one machine's health |

*Production requires `EVENT_API_KEY` and `DATABASE_URL`. Development may use memory storage.

### Machine topology and health

Copy `config/topology.example.json` to `config/topology.json`, replace the sample team, names, and addresses with the real inventory, and set `TOPOLOGY_FILE=config/topology.json`. Add `class_id` to each team to generate class filters automatically; there is no fixed class or team count. The real file is ignored by Git. For Heroku, set `TOPOLOGY_JSON` to the same JSON content as a config variable. Inventory machines appear as **unknown** until they send a report. Machines that report without an inventory entry also appear, using their reported zone and label.

Send a report from a trusted monitor or VM agent with `team_id`, stable `machine_id`, `zone` (`operator`, `wan`, `dmz`, or `lan`), and `status` (`online`, `degraded`, or `offline`). Optional fields are `label` and `address`. Example:

```bash
curl -X POST http://localhost:3001/api/machines/heartbeat \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-event-api-key' \
  -d '{"team_id":"Brown_01","machine_id":"web","label":"Web target","zone":"dmz","address":"10.0.1.20","status":"online"}'
```

An online report becomes **degraded** after 60 seconds without another report and **offline** after five minutes. A reported offline state is immediate. Operation events do not determine machine health. With PostgreSQL configured, latest machine reports persist across server restarts; without it, they live in memory.

### Discord telemetry import and recovery

The bot reads `[OCRT] team-id | Tool | Target | Result | Details` messages from `ALLOWED_CHANNELS`. It saves each Discord message ID as `source_id`, so retries and reconnect replay cannot double count an event. A per-channel cursor is persisted in PostgreSQL after each accepted message. The importer walks channel history from the cursor on reconnect and retries transport failures with backoff. Malformed or rejected messages are retained in `discord_rejections`; `/api/health` reports `discord_rejections` so an operator can investigate them. Bot access requires **View Channel**, **Read Message History**, and **Message Content** intent. The scoring backend's outgoing milestone alerts are a separate Discord path and are not treated as operation telemetry. Scored events arrive through the authenticated backend export and are acknowledged only after this dashboard stores them; `backend:<event_id>` prevents replay duplicates.

Copy `config/discord-sources.example.json` to `config/discord-sources.json`, enter actual channel/webhook IDs and exact team IDs, then set `DISCORD_SOURCE_POLICY_FILE=config/discord-sources.json`. Webhook IDs are metadata, not secret URL tokens. Every allowlisted channel needs at least one mapping; missing/ambiguous mappings stop reader startup. An ordinary user or bot message, an unknown webhook, or a webhook claiming another team's ID is rejected and recorded. Give each Kali/team its own limited posting hook where practical. A holder of that hook can still impersonate its mapped team, so keep the URL private and rotate it after exposure.

For Heroku, set `DISCORD_SOURCE_POLICY_JSON` to the same reviewed JSON in the app's protected config, and leave `DISCORD_SOURCE_POLICY_FILE` empty. Exactly one source is permitted, capped at 1 MiB. Never put webhook URL tokens or bot credentials inside the source policy. Preserve existing bot credentials while changing deployment configuration.

Imported timestamps use Discord's original message creation time, including after replay. This is the Discord posting time, not a measured tool execution time. Existing Kali scripts must post the exact `[OCRT]` contract; free-form messages/embeds need a reviewed formatter. Use one dashboard feed per logical event: Discord import and backend export have different source IDs and do not deduplicate each other.

For an existing dashboard with historical events, leave `DISCORD_INITIAL_BACKFILL=false` on the first deploy to initialize cursors at the current channel heads. For a new dashboard that should import older Discord telemetry, set it to `true` before first start. Initial backfill stops after 100,000 messages per channel and logs a recovery error instead of skipping older records. If the bot cannot read a channel, its cursor stays put and it retries. Keep PostgreSQL enabled in production; memory mode is for local preview only.

### POST /api/events body

```json
{
  "team_id": "ocrt-team-01",
  "tool": "Nmap",
  "target": "10.0.1.5",
  "result": "SUCCESS",
  "details": "Port 22, 80 open"
}
```

### POST /api/events with auth

```bash
curl -X POST https://your-app.herokuapp.com/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-event-api-key" \
  -d '{"team_id":"ocrt-team-01","tool":"Nmap","target":"10.0.1.5","result":"SUCCESS","details":"Port scan complete"}'
```

---

## Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start Vite dev server with HMR           |
| `npm run server`     | Start Express backend with nodemon       |
| `npm run build`      | Production build to `dist/`              |
| `npm run build-start`| Build frontend and serve via Express     |
| `npm start`          | Start Express backend (production mode)  |
| `npm run lint`       | Run ESLint across all source files       |
| `npm test`           | Test machine status aging and inventory merging |

---

## Data Modes

### Mock Mode (default)

When `VITE_API_URL` is not set, the dashboard reads `/api` from its own origin. Vite forwards those requests to port 3001 during development. The dashboard starts empty and never substitutes simulated teams or events. Legacy synthetic fixtures are preserved in `archive/legacy-preview/`.

### Live API Mode

The hook polls the configured API (same origin by default):

| Endpoint          | Poll Interval | Description                    |
| ----------------- | ------------- | ------------------------------ |
| `GET /api/status` | 15 seconds    | Array of team status objects   |
| `GET /api/events` | 4 seconds     | Array of recent event objects  |

---

## License

This project was built as part of a cybersecurity training exercise. All mock data is synthetic and does not represent real infrastructure.

---

<p align="center">
  <strong>OPERATION CLAW & ORDER</strong><br>
  <em>"Eyes on every vector. Control every phase."</em>
</p>
