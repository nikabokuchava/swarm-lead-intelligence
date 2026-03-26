# swarm-lead-intelligence

> **Zero-bounce B2B lead intelligence.** Active SMTP probing + Gemini 2.5 Flash C-Level inference.
> 500+ companies/hour. 96.8% executive hit rate. Production-hardened.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer_Stealth-40B5A4?style=flat-square&logo=puppeteer&logoColor=white)
![Google AI](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=flat-square&logo=google&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-008CDD?style=flat-square&logo=stripe&logoColor=white)

---

## Data Quality Moat

Most lead tools scrape directories and guess emails. Swarm does the opposite:

| Capability | How |
|------------|-----|
| **Zero-Bounce Guarantee** | Active SMTP `RCPT TO` probing against live mailservers. Catch-all domain detection. Only `VALID` emails ship. |
| **C-Level Executive Inference** | Gemini 2.5 Flash extracts owner/founder names from deep-crawled pages, generates email patterns, verifies each via SMTP. 96.8% hit rate on Premium jobs. |
| **Stealth Collection** | Puppeteer Stealth with UA rotation, viewport randomization, risk-tiered human simulation delays. |
| **Hybrid AI Parsing** | Regex-first extraction with structured LLM fallback (40K token context window). Confidence scores clamped 0-100. |

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
│   /api/health       │         │   │ Email Verifier (SMTP) │   │
└─────────────────────┘         │   │ Gemini C-Level Infer  │   │
                                │   └──────────────────────┘   │
                                │                              │
                                │   Health: :8080/health       │
                                └──────────────────────────────┘
```

**Key design decisions:**
- `FOR UPDATE SKIP LOCKED` — atomic job claiming, safe horizontal scaling
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
| **Worker** | Node.js, Puppeteer Stealth, risk-tiered delay engine |
| **Database** | PostgreSQL, Prisma ORM, `FOR UPDATE SKIP LOCKED` queue |
| **AI** | Gemini 2.5 Flash (C-Level inference), GPT-4o-mini (hybrid parsing) |
| **Verification** | SMTP `RCPT TO`, MX lookup, catch-all detection |
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

### 4. Run

```bash
# Terminal 1 — Worker
npm run worker

# Terminal 2 — Dashboard
npm run dev --prefix dashboard
```

Dashboard: `http://localhost:3000` · Worker health: `http://localhost:8080/health`

---

## Production Deployment

### Dashboard → Vercel

1. Import repo → Set root directory to `dashboard`
2. Configure env vars (Clerk, Stripe, `DATABASE_URL`)
3. Deploy

### Worker → VPS (Docker)

```bash
# On your VPS (port 25 must be open for SMTP verification)
git clone <repo> && cd swarm-lead-scraper
cp .env.example .env   # fill production credentials
docker compose -f docker-compose.yml up --build -d
```

> **Important:** SMTP `RCPT TO` verification requires a VPS with port 25 open. Consumer ISPs block port 25 — the worker falls back to `UNKNOWN` status locally.

See [VPS Deployment Guide](docs/VPS-DEPLOYMENT.md) for full instructions.

---

## Project Structure

```
├── dashboard/              # Next.js 16 Frontend
│   ├── src/app/api/        # REST + SSE endpoints
│   └── src/components/     # UI (JobPoller SSE, DataTable)
├── src/                    # Worker Engine
│   ├── scraper/            # Maps scraper, website crawler, stealth browser
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
