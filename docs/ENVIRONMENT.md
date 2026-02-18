# 🔑 Environment Variables

This project uses two separate environment files: one for the Root (Worker) and one for the Dashboard (Next.js).

## 1. Root `.env` (Scraper Worker)

Location: `swarm-lead-scraper/.env`

| Variable         | Description                                | Required | Reference                             |
| ---------------- | ------------------------------------------ | -------- | ------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string               | ✅       | `postgresql://user:pass@host:5432/db` |
| `OPENAI_API_KEY` | Key for LLM-based parsing (optional)       | ❌       | `sk-...`                              |
| `HEADLESS`       | Run browser in background (`true`/`false`) | ❌       | Default: `false`                      |
| `LOG_LEVEL`      | Logging verbosity (`info`, `debug`)        | ❌       | Default: `info`                       |

## 2. Dashboard `.env.local` (Next.js)

Location: `swarm-lead-scraper/dashboard/.env.local`

| Variable                            | Description                                 | Required |
| ----------------------------------- | ------------------------------------------- | -------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Public Key for Frontend               | ✅       |
| `CLERK_SECRET_KEY`                  | Clerk Secret Key for Backend                | ✅       |
| `DATABASE_URL`                      | PostgreSQL connection string (Same as Root) | ✅       |

> **Note:** The `DATABASE_URL` must be identical in both files to ensure they talk to the same database.

## ⚠️ Security Warning

Never commit `.env` files to version control. They are added to `.gitignore` by default.
