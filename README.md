# LeaderFlow

> **The org chart IS the interface.** Work items flow through your hierarchy as animated particles — leaders see the whole picture at a glance, triage what matters, and process their day in one focused ritual.

---

## The Problem

Leaders fail in two ways:

1. **They do the work themselves** instead of delegating — becoming the bottleneck
2. **Escalations fall through the cracks** — no one is watching the edges of the hierarchy

LeaderFlow makes both failure modes *visible*. Every delegation, escalation, and ingress item physically flows along the org chart as a particle. Hot spots glow. You can't unsee a bottleneck when it's a cluster of red particles pulsing at someone's node.

---

## How It Works

```
       Sarah Chen (CEO)
           ●
          / \
    Marcus   Priya
      ●  ←←←  ●   ← red particle = escalation flowing up
      |
    Jamie
      ●  →→→  ← blue particle = delegation flowing down
```

- **Red particles** — escalations moving up the chain
- **Blue particles** — delegations moving down
- **Orange particles** — new ingress items arriving

Click any node to see everything in that person's queue. Open the Flow Panel to triage the full stream. The daily ritual: open the app, process your hot spots, close it.

---

## Demo (No Setup Required)

The fastest way to see LeaderFlow in action — no Docker, no database, no API keys:

```bash
git clone https://github.com/your-org/leaderflow.git
cd leaderflow
pnpm install
pnpm --filter web demo
```

Open `http://localhost:5173` — you'll get a fully populated Acme Corp org with 7 members, 11 live work items, animated particles, and a guided tour that walks you through every feature.

Hit **Replay Tour** in the top bar to restart the walkthrough at any time.

---

## Full Stack Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for Postgres + Redis)

### 1. Environment

```bash
cp .env.example .env
# Edit .env — minimum required:
# DATABASE_URL=postgresql://leaderflow:leaderflow@localhost:5432/leaderflow
# REDIS_URL=redis://localhost:6379
# ANTHROPIC_API_KEY=sk-ant-...   ← powers the AI triage agent
```

### 2. Start infrastructure

```bash
docker-compose up -d
```

### 3. Database

```bash
pnpm --filter api db:migrate
pnpm --filter api db:seed    # seeds Acme Corp: Sarah Chen CEO + 6 team members
```

### 4. Run

```bash
pnpm dev
```

- **Web** → `http://localhost:5173`
- **API** → `http://localhost:3001`

---

## Architecture

```
leaderflow/
├── apps/
│   ├── web/          # React + Vite PWA
│   └── api/          # Express + TypeScript REST API
├── packages/
│   └── shared/       # Types shared between web and api
├── docker-compose.yml
└── turbo.json
```

### Frontend (`apps/web`)

| What | How |
|---|---|
| UI framework | React 18 + TypeScript + Vite |
| State | Zustand |
| Org chart | SVG with `animateMotion` particles |
| Metrics | Recharts (line + bar) |
| Real-time | socket.io-client |
| PWA | vite-plugin-pwa + Workbox |
| Auth | Clerk (optional — runs without it in dev) |
| Role views | `?role=leader\|manager\|member` query param |

### Backend (`apps/api`)

| What | How |
|---|---|
| Runtime | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Job queue | BullMQ + Redis |
| AI agents | Anthropic Claude API |
| Real-time | socket.io |
| Auth | Clerk webhooks + middleware |
| Integrations | Slack (@slack/bolt), Email (Gmail OAuth / forwarding) |
| Encryption | AES-256-GCM for stored credentials |

---

## AI Agents

LeaderFlow runs four background agents via BullMQ:

### Triage Agent *(per item, Claude Haiku)*
Fires immediately when a work item is created. Analyzes the item against your org's delegation history and suggests:
- **Priority** (LOW / MEDIUM / HIGH / URGENT)
- **Owner** — who in the tree should actually handle this
- **Rationale** — plain-English explanation of both suggestions

Suggestions appear in the Triage Modal. One click to accept or override.

### Follow-up Agent *(every 4 hours)*
Runs the status machine against all active items:
- `PENDING` → `STALE` if no activity in 48h (configurable)
- `PENDING` → `AT_RISK` if due within 24h (configurable)
- `PENDING` → `OVERDUE` if past due

Then evaluates automation rules against all pending items.

### Escalation Router *(per escalation + hourly SLA check)*
Routes escalation items based on org structure and priority. Enforces SLA windows and re-escalates if no acknowledgment within the configured window.

### Automation Detector *(weekly, Claude Sonnet)*
Scans completed items for patterns and flags work that could be automated. Surfaces opportunities in the Weekly Review dashboard.

---

## Integrations

### Slack
- Listens for mentions and DMs in Socket Mode (dev) or HTTP (prod)
- `reaction_added` with `:arrow_up:` or `:escalate:` auto-creates an escalation item
- `/leaderflow` slash command creates work items from Slack
- Block Kit handoff notifications with priority emoji

### Email
- **Forwarding mode** — forward any email to your LeaderFlow inbox address
- **Gmail OAuth mode** — polls Gmail for labeled messages via googleapis

Both modes parse subject/body into work items and route based on org rules.

---

## Automation Rules

Create rules that fire when items are created or during follow-up processing:

```json
{
  "name": "Auto-delegate security issues",
  "condition": {
    "titleContains": "security",
    "type": "INGRESS"
  },
  "action": {
    "type": "delegate",
    "toMemberId": "mbr-security-lead"
  }
}
```

Condition fields: `titleContains`, `type`, `status`, `fromMemberId`, `toMemberId`, `source`  
Action types: `delegate`, `create`, `updateStatus`

---

## PWA & Offline

LeaderFlow is a full Progressive Web App:

- **Installable** — add to home screen on iOS/Android/desktop
- **Offline-capable** — last synced org chart and work items available offline via Workbox NetworkFirst cache
- **Offline banner** — amber banner + disabled mutations when network is lost
- **Auto-update** — new service worker activates on next navigation

---

## Weekly Review

The metrics dashboard (top bar → **Weekly Review**) shows:

- Work item volume trend (line chart)
- Distribution by type and status (bar charts)
- Median triage speed and escalation response time
- Completion rate by team member
- Delegation ratio by day
- AI-detected automation opportunities

In demo mode, these are populated with realistic mock data.

---

## Role-Based Views

Append `?role=` to the URL to switch perspective:

| Role | What changes |
|---|---|
| `leader` (default) | Full org chart, all items |
| `manager` | Subtree view — only your direct reports and their chains |
| `member` | Single-node view — only items assigned to you |

---

## Docker (Production)

```bash
# Build and run everything
docker-compose --profile production up --build

# Or build images individually
docker build -t leaderflow-api ./apps/api
docker build -t leaderflow-web ./apps/web
```

The web image is nginx:alpine serving the Vite build with SPA routing and aggressive asset caching.

---

## Environment Variables

### API (`apps/api/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `ANTHROPIC_API_KEY` | ✅ | Powers triage + automation agents |
| `ENCRYPTION_KEY` | ✅ | 32-byte hex key for credential encryption |
| `SLACK_BOT_TOKEN` | — | Slack integration (`xoxb-...`) |
| `SLACK_APP_TOKEN` | — | Socket Mode token (`xapp-...`) |
| `SLACK_SIGNING_SECRET` | — | Webhook verification |
| `CLERK_SECRET_KEY` | — | Auth (optional in dev) |

### Web (`apps/web/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | — | API base URL (default: `http://localhost:3001`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | — | Auth (optional in dev) |
| `VITE_DEMO_MODE` | — | Set `true` to run self-contained demo |

---

## Tech Stack At a Glance

```
React · Vite · TypeScript · Zustand · Recharts · socket.io
Express · Prisma · PostgreSQL · BullMQ · Redis
Anthropic Claude · @slack/bolt · googleapis
Turborepo · pnpm workspaces · Docker
```

---

## Contributing

1. Fork and clone
2. `pnpm install`
3. `docker-compose up -d`
4. `pnpm --filter api db:migrate && pnpm --filter api db:seed`
5. `pnpm dev`

The monorepo uses Turborepo for build orchestration. `pnpm dev` starts both `apps/web` and `apps/api` in parallel with hot reload.

---

## License

MIT
