# swarm-lead-intelligence

> Swarm is a multi-tenant lead-enrichment SaaS **proof-of-work project**. The dashboard and worker are decoupled through a PostgreSQL queue. It demonstrates atomic `SKIP LOCKED` job claiming, tenant-scoped access, Stripe checkout with idempotent webhook handling, browser automation for public-data collection, DNS/MX validation, SSE monitoring, and a tested hardening pass.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-40B5A4?style=flat-square&logo=puppeteer&logoColor=white)
![Google AI](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=flat-square&logo=google&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-008CDD?style=flat-square&logo=stripe&logoColor=white)

---

> **Status:** Portfolio / proof-of-work project — built to demonstrate architecture and engineering practices. **Not a hosted production service.** See [Scope & Limitations](#scope--limitations).

---

## What it does

Swarm is a multi-tenant lead-enrichment SaaS proof-of-work project built with Next.js App Router (dashboard), a TypeScript worker, Prisma/PostgreSQL, Clerk (multi-tenant auth), Stripe checkout, browser automation for public-data collection, DNS/MX email validation, SSE job monitoring, and a Postgres job queue with atomic `SKIP LOCKED` claiming.

| Capability | How |
|------------|-----|
| **Public business-data collection** | Puppeteer-driven collection of publicly listed business fields (name, phone, address, website, ratings/reviews). |
| **Email discovery** | Regex-first extraction with an optional structured-LLM fallback (40K-token context). Confidence scores clamped 0–100. |
| **Email validation** | DNS/MX validation (MX lookup, provider identification, catch-all detection) with optional SMTP probing where available. `VALID` is a validation result, not a delivery guarantee. |
| **Optional contact inference** | For enrichment, an LLM extracts owner/founder names from crawled public pages and generates candidate email patterns to validate. |

---

## Scope & Limitations

- **Status:** Portfolio / proof-of-work project. It demonstrates engineering practices; it is not a finished commercial product.
- **Not a hosted production service** — no SLA, no managed deployment, no uptime or data guarantees.
- **Credits:** Stripe checkout and an idempotent webhook top up a credit balance, but **runtime credit consumption is intentionally disabled / out of scope** — running a job does not deduct credits.
- **Rate limiting is per-process** (in-memory sliding window), **not distributed** — it does not coordinate across multiple instances.
- **Tests are unit-level with mocked Prisma** — they verify logic and hardening invariants, not load or real-concurrency behavior.
- **Email validation** uses DNS/MX validation with optional SMTP probing where available. `VALID` is a validation result, not a delivery guarantee. **No deliverability or hit-rate percentage is claimed.**
- **Data collection** depends on third-party page structure and can break when those pages change. Respect each site's terms of use and applicable law before collecting data.

---

## What is verifiable in this repo

Each item maps to code you can read and tests you can run:

- **Atomic job claiming** — `FOR UPDATE SKIP LOCKED` queue claim in `src/db/queue.ts`.
- **Tenant isolation** — Clerk `userId` scoping on all reads/writes; job-ownership checks reject cross-tenant access (`dashboard/src/app/actions.ts`, `dashboard/src/app/api/leads/export/route.ts`).
- **SSE job monitoring** — a server-sent events stream in `dashboard/src/app/api/jobs/stream/route.ts`.
- **Stripe checkout + idempotent webhook fulfillment** — a `processedEvent` guard plus an atomic credit transaction (`dashboard/src/app/api/webhooks/stripe/route.ts`).
- **Server-side input caps & rate limit** — `MAX_RESULTS=500`, `MAX_TASKS=100`, `MAX_JOBS_PER_MIN=20`; client-supplied `isPremium` is ignored server-side (`dashboard/src/app/actions.ts`, `dashboard/src/lib/rateLimit.ts`).
- **Failure persistence** — `failureReason` and `failedAt` are recorded on jobs and tasks (`prisma/schema.prisma`).
- **Reproducible migrations** — the Prisma migration history applies cleanly from a fresh database (`prisma/migrations/`).
- **Hardening tests** — a Vitest suite covering queue claiming, retries, failure persistence, and the decoupled job flow (`tests/`).

---

## Architecture — Bridge Pattern

Dashboard and Worker are **fully decoupled**. They share nothing except PostgreSQL.

```
┌─────────────────────┐         ┌──────────────────────────────┐
│   Next.js 16        │         │   Node.js Worker             │
│   Dashboard         │         │                              │
│                     │         │   ┌──────────────────────┐   │
│   Clerk Auth        │         │   │ Job Poller            │   │
│   Stripe Billing    │   PG    │   │ FOR UPDATE SKIP LOCKED│   │
│   SSE Live Updates  │◄───────►│   └──────────┬───────────┘   │
│   CSV Export        │  Queue  │              │               │
│                     │         │   ┌──────────▼───────────┐   │
│   /api/jobs/stream  │         │   │ Maps Scraper         │   │
│   /api/leads/export │         │   │ Website Crawler       │   │
│   /api/health       │         │   │ Email Validator (MX) │   │
└─────────────────────┘         │   │ Gemini C-Level Infer  │   │
                                │   └──────────────────────┘   │
                                │                              │
                                │   Health: :8080/health       │
                                └──────────────────────────────┘
```

**Key design decisions:**
- `FOR UPDATE SKIP LOCKED` — atomic job claiming; multiple workers can poll the same queue without double-claiming a task
- Browser reuse — single Chromium instance rotated every 50 tasks
- MX cache — one DNS lookup per domain, not per email
- Parallel verification — chunks of 3 with jitter (C-Level stays sequential)
- Transaction safety — Company + Contact writes wrapped in `prisma.$transaction`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), Tailwind CSS v4, SSE real-time updates |
| **Auth** | Clerk (multi-tenant) |
| **Worker** | Node.js, Puppeteer (browser automation), request pacing |
| **Database** | PostgreSQL, Prisma ORM, `FOR UPDATE SKIP LOCKED` queue |
| **AI** | Gemini 2.5 Flash (C-Level inference), GPT-4o-mini (hybrid parsing) |
| **Email validation** | DNS MX lookup, MX-provider detection, catch-all detection |
| **Payments** | Stripe (credits-based billing) |
| **Infra** | Docker, PM2, health probes (`:8080/health`) |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Docker Desktop (running)
- Clerk + Stripe accounts
- Google AI API key (Gemini 2.5 Flash)

### 1. Database

```bash
docker compose up -d
```

### 2. Environment

```bash
cp .env.example .env
cp dashboard/.env.example dashboard/.env.local
# Fill: DATABASE_URL, GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY, CLERK_*, STRIPE_*
```

### 3. Install & Migrate

```bash
npm install
npm install --prefix dashboard
npx prisma migrate dev
```

> **Fresh vs. existing databases:** A brand-new database is set up with `npx prisma migrate deploy` (applies the full migration history cleanly). A database that previously received schema changes via `prisma db push` may report drift on the `20260603111834_reconcile_schema_drift` migration; baseline it with `npx prisma migrate resolve --applied 20260603111834_reconcile_schema_drift`. **Verify the existing schema first — do not run this blindly.**

### 4. Run

```bash
# Terminal 1 — Worker
npm run worker

# Terminal 2 — Dashboard
npm run dev --prefix dashboard
```

Dashboard: `http://localhost:3000` · Worker health: `http://localhost:8080/health`

---

## Deployment (self-hosting)

This is a proof-of-work project; the steps below run your own instance — there is no managed or hosted service.

### Dashboard → Vercel

1. Import repo → set root directory to `dashboard`
2. Configure env vars (Clerk, Stripe, `DATABASE_URL`)
3. Deploy

### Worker → VPS (Docker)

```bash
git clone <repo> && cd swarm-lead-scraper
cp .env.example .env   # fill in your credentials
docker compose -f docker-compose.yml up --build -d
```

> **Note on email validation:** Validation uses DNS/MX checks (MX lookup + catch-all detection) with optional SMTP probing where available. Many networks block outbound SMTP (port 25), so the worker does not depend on it and records `UNKNOWN` as a conservative fallback. `VALID` is a validation result, not a delivery guarantee.

See the [VPS Deployment Guide](docs/VPS-DEPLOYMENT.md) for full instructions.

---

## Project Structure

```
├── dashboard/              # Next.js 16 Frontend
│   ├── src/app/api/        # REST + SSE endpoints
│   └── src/components/     # UI (JobPoller SSE, DataTable)
├── src/                    # Worker Engine
│   ├── scraper/            # Maps scraper, website crawler, browser automation
│   ├── services/           # Job poller, scraper orchestrator, email verifier
│   ├── db/                 # Prisma operations, SKIP LOCKED queue
│   ├── utils/              # Hybrid parser, email guesser, logger
│   └── scripts/            # CLI tools (reset, export, seed, audit)
├── prisma/                 # Schema & migrations
├── docs/                   # Architecture, deployment, sales docs
└── docker-compose.yml      # PostgreSQL + Worker stack
```

---

## Key Scripts

```bash
npm run worker              # Start worker (dev mode)
npm run worker:prod         # Build + start worker (production)
npm run generate-sample     # Export top 50 C-Level contacts to CSV
npm run export:premium      # Export premium verified leads
npm run verify:all          # Re-verify all leads in database
npm run reset-tasks         # Reset stuck tasks to PENDING
```

---

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [VPS Deployment](docs/VPS-DEPLOYMENT.md)
- [Environment Variables](docs/ENVIRONMENT.md)
- [API Reference](docs/API_REFERENCE.md)

---

## License

[MIT](LICENSE) — Copyright 2026 Nick Bokuchava

Built by **Nick Bokuchava** — [LinkedIn](https://linkedin.com/in/nika-bokuchava-7856b03b5) · [GitHub](https://github.com/mindmnml-del)
