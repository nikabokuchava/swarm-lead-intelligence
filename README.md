# 🐝 Swarm Lead Scraper

> **Automated B2B Lead Generation Engine**

Swarm Lead Scraper is a robust, production-ready B2B lead generation tool. It combines a Next.js Dashboard for management with a stealthy Node.js/Puppeteer worker for data extraction.

## 🏗️ Architecture

```mermaid
graph LR
    User[User] -->|Manage| Dashboard[Next.js Dashboard]
    Dashboard -->|Read/Write| DB[(PostgreSQL)]
    Worker[Node.js Worker] -->|Poll Jobs| DB
    Worker -->|Scrape| Puppeteer[Puppeteer Stealth]
    Puppeteer -->|Extract| GMaps[Google Maps]
    Puppeteer -->|Save Leads| DB
```

## 🛠️ Tech Stack

- **Frontend:** Next.js 16 (App Router), Tailwind CSS v4, Lucide React
- **Auth:** Clerk (Multi-tenancy)
- **Backend:** Node.js, Puppeteer (Stealth Plugin), Server Actions
- **Database:** PostgreSQL, Prisma ORM
- **Infrastructure:** Docker (for DB)

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js** (v18+)
- **Docker Desktop** (must be running)
- **Clerk Account** (for authentication)

### 2. Setup

**1. Start Database**

```bash
docker compose up -d
```

**2. Configure Environment**

```bash
cp .env.example .env
# Fill in DATABASE_URL, OPENAI_API_KEY
```

**3. Install Dependencies**

```bash
npm install           # Root dependencies
npm install --prefix dashboard # Dashboard dependencies
```

**4. Initialize Database**

```bash
npx prisma migrate dev
```

### 3. Run Application

**Start the Worker (Scraper Engine):**

```bash
npm start
```

**Start the Dashboard (UI):**

```bash
npm run dev --prefix dashboard
```

Visit `http://localhost:3000` to access the dashboard.

## 📦 Project Structure

```
├── dashboard/        # Next.js Frontend
│   ├── src/app/      # App Router
│   └── src/actions/  # Server Actions
├── src/              # Scraper Worker
│   ├── scraper/      # Puppeteer Logic
│   └── services/     # Job Poller
├── prisma/           # Database Schema
└── docs/             # Documentation
```

## 📄 Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [Environment Variables](docs/ENVIRONMENT.md)
- [API Reference](docs/API_REFERENCE.md)

---

## 🚢 Deployment Guide

Swarm has two independently deployable components. Deploy them separately.

### 1. Next.js Dashboard → Vercel

The dashboard is a standard Next.js 16 (App Router) application. Deploy it directly from your repository.

**Steps:**

1. Push the `dashboard/` directory to GitHub.
2. Import the repository into [Vercel](https://vercel.com) and set the **Root Directory** to `dashboard`.
3. Set the following **Environment Variables** in the Vercel project settings:

| Variable                            | Description                                                 |
| ----------------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`                      | PostgreSQL connection string (e.g. Neon, Supabase, Railway) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key                                            |
| `CLERK_SECRET_KEY`                  | Clerk secret key                                            |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`     | `/sign-in`                                                  |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`     | `/sign-up`                                                  |
| `STRIPE_SECRET_KEY`                 | Stripe live secret key                                      |
| `STRIPE_WEBHOOK_SECRET`             | From `stripe listen --forward-to`                           |
| `NEXT_PUBLIC_APP_URL`               | Your Vercel deployment URL                                  |

4. Deploy. Vercel will run `next build` automatically.

> **Database:** Use a managed Postgres provider (Neon, Supabase, or Railway). Run `npx prisma migrate deploy` once after provisioning.

---

### 2. Background Worker → VPS (Docker)

The scraper worker is a long-running Node.js process. Deploy it on any server that supports Docker (DigitalOcean Droplet, AWS EC2, Railway, Render).

#### Local Production Stack

Start a local production-like environment (Postgres + Worker):

```bash
npm run docker:up     # Build image and start all services
npm run docker:down   # Stop and remove containers
```

This uses `docker-compose.yml` which:

- Starts **PostgreSQL 15** with a persistent volume
- Waits for the DB health check (`pg_isready`) before starting the worker
- Runs `prisma migrate deploy` then starts the worker in `--serve` mode

#### VPS Deployment

1. Copy `Dockerfile.worker`, `docker-compose.yml`, `prisma/`, `src/`, `package.json`, and `tsconfig.json` to your server.
2. Create a `.env` file on the server (never commit this):

```env
DATABASE_URL=postgresql://swarm:swarm_secret@postgres:5432/swarm_leads
HEADLESS=true
LOG_FILE=/app/logs/worker.log
```

3. Build and start:

```bash
docker-compose up --build -d
```

4. Verify the worker is running:

```bash
docker logs swarm_worker --follow
```

> **Scaling:** To run multiple workers, increase `replicas` in `docker-compose.yml` (requires Swarm mode or Kubernetes). Each worker polls the same job queue from the shared database.
