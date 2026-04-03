<div align="center">

```
        ┌─────────────────────────────────────────────────────┐
        │                                                     │
        │          ◉ Sarah Chen  ·  CEO                       │
        │         ╱ ↑            ╲                            │
        │   ↑↑↑ ╱   ╲ red         ╲ ↓↓↓                     │
        │      ◉      ◉            ◉ ·· blue                  │
        │   Marcus  Priya        Jordan                       │
        │     ╱              ╲                                │
        │    ◉ ·· orange       ◉                              │
        │  Jamie             Emma                             │
        │                                                     │
        │  ↑ escalation   ↓ delegation   · new ingress        │
        │                                                     │
        └─────────────────────────────────────────────────────┘
```

# LeaderFlow

**The org chart is the interface. Work flows through it.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-kwad77.github.io%2Fleaderflow-6366f1?style=for-the-badge&logo=github)](https://kwad77.github.io/leaderflow/)
[![Deploy Demo](https://github.com/kwad77/leaderflow/actions/workflows/demo.yml/badge.svg)](https://github.com/kwad77/leaderflow/actions/workflows/demo.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-slate?style=flat-square)](LICENSE)

</div>

---

## The Problem with Leadership Tools

Every leadership tool in existence makes the same mistake: it puts work in a list.

Lists are flat. Organizations are not. When Marcus escalates something to Sarah, and Sarah needs to decide whether to handle it herself or push it back down to Priya — that decision happens *in the context of the hierarchy*. A list destroys that context.

Leaders fail in exactly two ways:
- **They become the bottleneck** — doing work themselves instead of delegating because they can't *see* who has capacity
- **Escalations fall through the cracks** — no one is watching the edges between people

LeaderFlow makes both failure modes impossible to miss. Work items are animated particles flowing along the org chart edges. Escalations travel upward in red. Delegations travel downward in blue. New ingress arrives in orange. You can't miss a bottleneck when it's a cluster of red particles pulsing at one node.

The daily ritual: open the app, see where work is stuck, process your hot spots, close it.

---

## Try It Now

**No Docker. No database. No API keys.**

```bash
git clone https://github.com/kwad77/leaderflow.git
cd leaderflow && pnpm install
pnpm --filter web demo
```

Or just visit the **[live demo →](https://kwad77.github.io/leaderflow/)**

The demo loads a fully-populated Acme Corp with 7 members, 11 active work items across every status and type, animated particles on every org tree edge, and a guided tour that walks you through the whole system.

---

## Full Setup

### Prerequisites
- Node.js 20+, pnpm 9+, Docker

### 1. Clone and install
```bash
git clone https://github.com/kwad77/leaderflow.git
cd leaderflow
pnpm install
```

### 2. Configure
```bash
cp .env.example .env
```

Minimum required:
```env
DATABASE_URL=postgresql://leaderflow:leaderflow@localhost:5432/leaderflow
REDIS_URL=redis://localhost:6379
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Start infrastructure
```bash
docker-compose up -d
```

### 4. Initialize database
```bash
pnpm --filter api db:migrate
pnpm --filter api db:seed   # seeds Acme Corp: Sarah Chen + 6 team members
```

### 5. Run
```bash
pnpm dev
# Web → http://localhost:5173
# API → http://localhost:3001
```

---

## AI Providers

LeaderFlow's agent system is provider-agnostic. Swap models without touching application code.

```env
AI_PROVIDER=anthropic   # or: openai | gemini | ollama | openrouter
```

| Provider | Fast model (triage) | Smart model (automation) | Key |
|---|---|---|---|
| `anthropic` | claude-haiku-4-5 | claude-sonnet-4-6 | `ANTHROPIC_API_KEY` |
| `openai` | gpt-4o-mini | gpt-4o | `OPENAI_API_KEY` |
| `gemini` | gemini-1.5-flash | gemini-1.5-pro | `GEMINI_API_KEY` |
| `ollama` | llama3.2 | llama3.1:70b | *(none — local)* |
| `openrouter` | llama-3.2-3b:free | claude-3.5-sonnet | `OPENROUTER_API_KEY` |

Override any model individually:
```env
AI_FAST_MODEL=gpt-4o-mini      # per-item triage — latency-sensitive
AI_SMART_MODEL=gpt-4o          # weekly analysis — quality-sensitive
```

Running fully air-gapped? Point Ollama at your local models and no data ever leaves your infrastructure.

---

## How It Works

### The Org Chart
The entire UI is a single SVG. Every member is a node. Every reporting relationship is an edge. Work items travel along those edges as animated particles using SVG `animateMotion`. There are no pages, no navigation, no dashboards to open. Everything is always visible.

Click a node → see that person's full queue in a detail panel.  
Spot a cluster of red → something is escalating that hasn't been addressed.  
Empty edges → your delegation is working.

### The Flow Panel
The bottom drawer surfaces the full stream filterable by type, status, priority, and assignee. Each row shows the item's age, AI-suggested priority, and one-tap actions (acknowledge, delegate, complete, triage).

### The Daily Ritual
No push notifications. No notification badges. You come to LeaderFlow once a day, process your hot spots, and leave. The follow-up agent handles the rest while you're gone.

---

## Agent System

Four background workers run on BullMQ + Redis:

### Triage Agent *(fires per item, fast model)*
When a work item is created, the triage agent analyzes it against your org's delegation history and suggests a priority and owner. Suggestions appear inline in the Triage Modal — one click to accept, one click to override.

### Follow-up Agent *(runs every 4 hours)*
Scans all active items and applies a status machine:

```
No activity > 48h  →  STALE
Due within 24h     →  AT_RISK  
Past due           →  OVERDUE
```

Thresholds are configurable via `org.settings`. After flagging, it evaluates automation rules against all pending items.

### Escalation Router *(fires per escalation + hourly SLA check)*
Routes escalations based on org structure and enforces SLA windows. If an escalation hasn't been acknowledged within the configured window, it re-escalates upward.

### Automation Detector *(weekly, smart model)*
Scans the last 30 days of completed items for repeating patterns. Flags automatable items and surfaces opportunities in the Weekly Review dashboard with confidence scores and time savings estimates.

---

## Integrations

### Slack
Connect Slack and work items flow both ways. Emoji reactions create escalations (`:arrow_up:` → ESCALATION item). The `/leaderflow` slash command surfaces your queue inline. Delegations send Block Kit notifications to the assignee with context and one-click acknowledgment.

### Email
Two modes: **forwarding** (forward any email to your LeaderFlow address) and **Gmail OAuth** (poll Gmail labels via googleapis). Both parse subject/body into work items and route them through your automation rules.

---

## Automation Rules

Create rules that fire on item creation and during follow-up:

```json
{
  "name": "Route security issues to the security lead",
  "condition": { "titleContains": "security", "type": "INGRESS" },
  "action": { "type": "delegate", "toMemberId": "mbr-security-lead" }
}
```

Conditions: `titleContains`, `type`, `status`, `fromMemberId`, `toMemberId`, `source`  
Actions: `delegate`, `create`, `updateStatus`

Rules run without model calls — pure condition matching, zero latency.

---

## Role-Based Views

Append `?role=` to switch perspective without logging out:

| `?role=leader` | Full org chart, all items — the default |
|---|---|
| `?role=manager` | Your subtree only — what you're responsible for |
| `?role=member` | Single-node view — only items assigned to you |

---

## Weekly Review

Open the dashboard from the top bar. Recharts line + bar charts show:

- Work item volume trend over the past 7 days
- Distribution by type (ingress / delegation / escalation)
- Completion rate by team member
- Median triage speed and escalation response times
- Delegation ratio by day of week
- AI-detected automation opportunities with confidence scores

---

## PWA + Offline

LeaderFlow installs on any device — desktop, iOS, Android. The service worker (Workbox NetworkFirst) caches the last-synced org tree and work items. When you go offline, an amber banner appears and mutations are disabled. When connectivity returns, the full stream resumes.

---

## Architecture

```
leaderflow/
├── apps/
│   ├── api/                   Express + TypeScript
│   │   ├── src/
│   │   │   ├── lib/ai/        Provider abstraction
│   │   │   │   └── providers/ anthropic · openai · gemini · ollama · openrouter
│   │   │   ├── jobs/          BullMQ workers
│   │   │   │   └── processors/ triage · followup · escalation · automation
│   │   │   ├── integrations/  slack · email
│   │   │   ├── routes/        REST API
│   │   │   └── services/      Business logic
│   │   └── prisma/            Schema + migrations + seed
│   └── web/                   React + Vite PWA
│       └── src/
│           ├── components/    OrgChart · FlowPanel · NodeDetail · Triage · Metrics
│           ├── hooks/         useWorkItems · useRealtime · useOnlineStatus
│           ├── stores/        Zustand (appStore)
│           └── demo/          Self-contained demo mode
└── packages/
    └── shared/                Types shared between api and web
```

### Stack

```
React · Vite · TypeScript · Zustand · Recharts · socket.io-client · vite-plugin-pwa
Express · Prisma · PostgreSQL · BullMQ · Redis · socket.io
Anthropic / OpenAI / Gemini / Ollama / OpenRouter
Slack (@slack/bolt) · Gmail (googleapis)
Turborepo · pnpm workspaces · Docker · nginx
```

---

## Production

```bash
docker-compose --profile production up --build
```

The web image is nginx:alpine with SPA routing and aggressive asset caching. The API image is a multi-stage node:22-alpine build. Integration credentials are encrypted at rest with AES-256-GCM.

---

## Contributing

```bash
git clone https://github.com/kwad77/leaderflow.git
cd leaderflow
pnpm install
docker-compose up -d
pnpm --filter api db:migrate && pnpm --filter api db:seed
pnpm dev
```

`pnpm dev` starts both apps in parallel with hot reload via Turborepo. The demo (`pnpm --filter web demo`) needs no backend at all.

---

<div align="center">

MIT License · Built with [Claude Code](https://claude.ai/code)

</div>
