# 🔑 Environment Variables

This project uses two separate environment files: one for the Root (Worker) and one for the Dashboard (Next.js).

## 1. Root `.env` (Data Collection Worker)

Location: `swarm-lead-scraper/.env`

| Variable         | Description                                | Required | Reference                             |
| ---------------- | ------------------------------------------ | -------- | ------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string               | ✅       | `postgresql://user:pass@host:5432/db` |
| `OPENAI_API_KEY` | Key for LLM-based parsing (optional)       | ❌       | `sk-...`                              |
| `HEADLESS`       | Run browser in background (`true`/`false`) | ❌       | Default: `false`                      |
| `LOG_LEVEL`      | Logging verbosity (`info`, `debug`)        | ❌       | Default: `info`                       |
| `SMTP_HELO_DOMAIN` | Domain announced in SMTP `HELO` when probing mailboxes. **No default.** | ❌ | `mail.yourdomain.com` |
| `SMTP_PROBE_FROM`  | Envelope sender for `MAIL FROM` probes. Defaults to `ping@$SMTP_HELO_DOMAIN`. | ❌ | `verify@yourdomain.com` |
| `MX_CACHE_TTL_MS`  | Lifetime of cached MX/catch-all lookups    | ❌       | Default: `3600000` (1h)               |

### SMTP probing is disabled by default

Mailbox-level verification opens a connection to the recipient's mail server and
announces an identity (`HELO <domain>`, `MAIL FROM:<address>`). **Set these only to a
domain you actually control** — a borrowed domain impersonates its real owner to every
server probed. There is deliberately no default value.

When unset, the worker logs `SMTP probing disabled (SMTP_HELO_DOMAIN unset)` at startup
and performs syntax + MX (domain-level) checks only, returning `UNKNOWN` rather than
`VALID`/`INVALID` for any individual mailbox. Full probing additionally needs outbound
port 25, which most consumer ISPs block.

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
