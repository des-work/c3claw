# 🦞 Operation Claw & Order

> **A real-time cybersecurity operations dashboard for monitoring offensive security exercises.**

Operation Claw & Order is a high-density, single-page React application designed to be displayed on classroom screens and command-center monitors during live cyber-attack simulations. It provides instructors and exercise coordinators with a real-time tactical overview of every participating team's status, attack phase, active operations, and a scrolling event telemetry feed — all rendered in a dark, military-grade aesthetic.

---

## 📸 Features

- **Live Team Monitoring** — Track 12+ teams simultaneously with real-time status indicators (Online / Degraded / Offline / Unknown)
- **Attack Phase Visualization** — Visual progress bars showing each team's current incursion phase (Phases 1–3)
- **Active Operations Feed** — See the last command or tool each team executed (e.g. `nmap -sS`, `Hydra ssh brute force`, `Metasploit handler active`)
- **Live Telemetry Stream** — A scrolling terminal-style activity feed showing the 20 most recent events with color-coded results (SUCCESS / FAILED / BLOCKED)
- **Overall System Health Badge** — Aggregated fleet status: ALL SYSTEMS GO → DEGRADED → CRITICAL
- **Real-Time Clock** — UTC/local timestamp prominently displayed in the header
- **Client-Side Search** — Instantly filter teams by designation with a search bar
- **Responsive Dark Theme** — Custom Tailwind color palette designed for low-light environments and large displays

---

## 🏗️ Tech Stack

| Layer        | Technology                                  |
| ------------ | ------------------------------------------- |
| **Framework**| React 19 (via Vite 8)                       |
| **Styling**  | Tailwind CSS 3.4 + custom dark theme tokens |
| **Icons**    | Lucide React                                |
| **Bundler**  | Vite 8                                      |
| **Linting**  | ESLint 9 + React Hooks plugin               |
| **Hosting**  | Heroku                                      |
| **Backend**  | Node.js + Express                           |

---

## 📁 Project Structure

```
operation-claw-and-order/
├── index.html                  # App shell — loads /src/main.jsx
├── package.json                # Dependencies & scripts
├── vite.config.js              # Vite configuration (React plugin)
├── tailwind.config.js          # Custom dark theme color tokens
├── postcss.config.js           # PostCSS + Tailwind + Autoprefixer
├── eslint.config.js            # ESLint configuration
├── .gitignore
├── .env.example                # Template for environment vars
├── Procfile                    # Heroku deployment configuration
│
├── public/
│   ├── favicon.svg             # Tab icon
│   └── icons.svg               # Icon sprite sheet
│
├── server/
│   └── index.js                # Express backend server & API routes
│
├── src/
│   ├── main.jsx                # React entry point
│   ├── index.css               # Tailwind directives + global styles
│   ├── App.jsx                 # Legacy root (unused)
│   ├── App.css                 # Legacy styles (unused)
│   ├── mockData.js             # 12 mock teams + 20 mock events
│   │
│   ├── components/
│   │   ├── App.jsx             # Root component — layout orchestrator
│   │   ├── HeaderBar.jsx       # Title bar, fleet metric, clock, status badge
│   │   ├── StatusBadge.jsx     # ALL SYSTEMS GO / DEGRADED / CRITICAL badge
│   │   ├── TeamList.jsx        # Searchable, scrollable team table
│   │   ├── TeamRow.jsx         # Individual team row with live "last seen" timer
│   │   ├── ActivityFeed.jsx    # Scrolling telemetry terminal (20 events max)
│   │   └── EventRow.jsx        # Single event line in the activity feed
│   │
│   ├── hooks/
│   │   └── useDashboardData.js # Data layer — mock fallback + API polling
│   │
│   └── assets/
│       ├── hero.png
│       ├── react.svg
│       └── vite.svg
│
├── dashboard/                  # Auxiliary dashboard experiments
└── pp/                         # Auxiliary project files
```

---

## 🎨 Theme Configuration

The project uses a custom Tailwind CSS dark theme optimized for tactical displays:

```js
// tailwind.config.js
colors: {
  background: '#0A0F1E',   // Deep navy — main background
  surface:    '#111827',    // Elevated panels & cards
  primary:    '#4D9AFF',    // Electric blue — accents & interactive
  success:    '#00FF9F',    // Neon green — online / success states
  warning:    '#FFB800',    // Amber — degraded / failed states
  danger:     '#FF4757',    // Red — offline / blocked states
  muted:      '#4B5563',    // Subdued gray — labels & secondary text
}
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Install & Run

```bash
# Clone the repository
git clone https://github.com/009182323-mango/completeco.git
cd completeco

# Install dependencies
npm install
```

### Running Locally

You can run the frontend and backend in different modes:

```bash
# 1. Frontend Development Mode (localhost:5173)
npm run dev

# 2. Backend API Server Development (localhost:3001)
npm run server

# 3. Full Production Simulation (Build frontend & serve via Express on 3001)
npm run build-start
```

The dashboard will be live at **http://localhost:5173/**

### Environment Variables

| Variable        | Description                          | Default        |
| --------------- | ------------------------------------ | -------------- |
| `VITE_API_URL`  | Backend API base URL for live data   | *(empty — uses mock data)* |

To connect to a live backend:

```bash
# Create a .env file in the project root
echo "VITE_API_URL=https://your-api.herokuapp.com" > .env
```

---

## 📡 Data Layer

The `useDashboardData` hook supports two operating modes:

### Mock Mode (Default)
When `VITE_API_URL` is not set, the dashboard renders 12 pre-configured teams and 20 simulated events from `mockData.js`. Data refreshes cosmetically on intervals to simulate liveness.

### Live API Mode
When `VITE_API_URL` is set, the hook polls two endpoints:

| Endpoint          | Poll Interval | Description                    |
| ----------------- | ------------- | ------------------------------ |
| `GET /api/status` | 15 seconds    | Returns array of team objects  |
| `GET /api/events` | 4 seconds     | Returns array of event objects |

---

## 🗺️ Roadmap

### ✅ Completed

- [x] React + Vite project scaffolding with Tailwind dark theme
- [x] `HeaderBar` with live clock, fleet status metric, and overall health badge
- [x] `TeamList` with sortable columns and client-side search filtering
- [x] `TeamRow` with live "last seen" countdown, phase indicators, and blocked count
- [x] `ActivityFeed` with auto-scrolling terminal and color-coded event results
- [x] `StatusBadge` with animated glow states (ALL SYSTEMS GO / DEGRADED / CRITICAL)
- [x] `useDashboardData` hook with mock fallback + API polling architecture
- [x] Full project committed and pushed to GitHub

### 🔜 Next Up — Backend & Deployment

- [x] **Heroku Deployment** — Procfile and basic Express static serving configured
- [x] **Backend API Server** — Node.js/Express backend structured with strict ES Modules (`"type": "module"`) and `__dirname` polyfills
- [x] **Express Routing** — Resolved Express v5+ wildcard catching bugs by utilizing `app.use()` static fallback
- [ ] **Database Integration** — Add PostgreSQL (Heroku Postgres) for persistent storage of team states and event logs
- [ ] **Real-Time Data Ingestion** — Ingest live telemetry from exercise infrastructure (syslog, webhooks, or agent reporting)
- [ ] **WebSocket Support** — Replace polling with WebSocket push for sub-second event delivery
- [ ] **Authentication** — Protect the dashboard and API with token-based auth
- [ ] **Historical Replay** — Store and replay past exercise sessions from the database
- [ ] **Alerting System** — Push notifications when a team goes offline or enters CRITICAL state

---

## 🔐 Heroku Deployment (Planned)

To deploy on Heroku, the following steps are needed:

1. **Create a Heroku app** and add the `heroku/nodejs` buildpack
2. **Set environment variables** via the Heroku dashboard or CLI:
   ```bash
   heroku config:set VITE_API_URL=https://your-app.herokuapp.com
   ```
3. **Add a `Procfile`** to boot the Express API wrapper:
   ```
   web: npm start
   ```
4. **Add Heroku Postgres** for backend persistence:
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```
5. **Set the Heroku API key** as a GitHub Actions secret for CI/CD *(if automating deployments)*

> ⚠️ **Note:** The Heroku API key is required for programmatic deployments. Never commit API keys to the repository. Use environment variables or a secrets manager.

---

## 🧪 Scripts

| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Start Vite dev server with HMR           |
| `npm run server`  | Start Express backend with nodemon       |
| `npm run build`   | Production build to `dist/`              |
| `npm run build-start`| Build frontend and serve via Express  |
| `npm start`       | Start Express backend (production mode)  |
| `npm run lint`    | Run ESLint across all source files       |

---

## 📜 License

This project was built as part of a cybersecurity training exercise. All mock data is synthetic and does not represent real infrastructure.

---

<p align="center">
  <strong>🔒 OPERATION CLAW & ORDER 🔒</strong><br>
  <em>"Eyes on every vector. Control every phase."</em>
</p>
