# Operation Claw & Order

> **A real-time cybersecurity operations dashboard for monitoring offensive security exercises.**

Operation Claw & Order is a high-density, single-page React application designed to be displayed on classroom screens and command-center monitors during live cyber-attack simulations. It provides instructors and exercise coordinators with a real-time tactical overview of every participating team's status, attack phase, active operations, and a scrolling event telemetry feed — all rendered in a dark, military-grade aesthetic.

---

## Features

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
| **Backend**  | Node.js + Express 5                         |
| **Database** | PostgreSQL (optional, for event persistence)|
| **Hosting**  | Heroku                                      |

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
    ├── mockData.js             # Synthetic teams, machines, and events
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
| `VITE_API_URL`      | Yes*     | Backend URL for the frontend to call. If empty, uses mock data    |
| `EVENT_API_KEY`     | Yes for machine health | Bearer token for `POST /api/machines/heartbeat`; also protects event ingestion |
| `TOPOLOGY_FILE`     | Optional | Path to JSON team/machine inventory. Omit to show only machines that report in. |
| `TOPOLOGY_JSON`     | Optional | Inline inventory JSON for deployments without a local inventory file; takes precedence over `TOPOLOGY_FILE`. |
| `DATABASE_URL`      | Required in production | PostgreSQL connection string (auto-set by Heroku Postgres addon)  |
| `DISCORD_BOT_TOKEN` | For Discord import | Bot token with Message Content intent and Read Message History permission |
| `ALLOWED_CHANNELS` | For Discord import | Comma-separated telemetry channel IDs; add any number of classes or teams |
| `DISCORD_INITIAL_BACKFILL` | No | Set to `true` only for a fresh installation that should import existing channel history. Default starts at the current channel head to avoid duplicating legacy events. |
| `PORT`              | No       | Server port (Heroku sets this automatically; defaults to 3001)    |
| `NPM_CONFIG_PRODUCTION` | Yes  | Must be `false` so Heroku installs devDependencies for the build  |

*If `VITE_API_URL` is not set, the dashboard runs in mock mode with synthetic data.

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
# Frontend only (mock mode, port 5173)
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

With `VITE_API_URL` unset the frontend uses synthetic mock data. Set `VITE_API_URL=http://localhost:3001` to inspect live data from the local server.

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

The bot reads `[OCRT] team-id | Tool | Target | Result | Details` messages from `ALLOWED_CHANNELS`. It saves each Discord message ID as `source_id`, so retries and reconnect replay cannot double count an event. A per-channel cursor is persisted in PostgreSQL after each accepted message. The importer walks channel history from the cursor on reconnect and retries transport failures with backoff. Malformed or rejected messages are retained in `discord_rejections`; `/api/health` reports `discord_rejections` so an operator can investigate them. Bot access requires **View Channel**, **Read Message History**, and **Message Content** intent. The scoring backend's outgoing milestone alerts are a separate Discord path and are not treated as operation telemetry.

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

When `VITE_API_URL` is not set, the dashboard renders synthetic teams, topology nodes, and events from `mockData.js`. New mock events are generated every 4 seconds, and online team statuses refresh every 15 seconds. Mock indicators are for preview only.

### Live API Mode

When `VITE_API_URL` is set, the hook polls the backend:

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
