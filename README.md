# 🐝 Swarm Lead Scraper

A robust, stealthy web scraper designed to extract business leads (Name, Phone, Website, Address) from Google Maps and store them in a PostgreSQL database.

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- **Docker Desktop** (must be running)

### 2. Setup Infrastructure
Start the PostgreSQL database container:
```bash
docker compose up -d
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run the Scraper
```bash
npx tsx src/index.ts
```
The scraper will:
1. Launch a stealth Chrome instance.
2. Search for "dentists in tbilisi".
3. Extract details from the first result.
4. Save the data to the local PostgreSQL database.

### 5. Verify Data
Check the saved leads in the database:
```bash
npx tsx verify_db.ts
```

---

## 🏗️ Architecture

- **Scraper Engine:** [Puppeteer Extra](https://github.com/berstend/puppeteer-extra) + Stealth Plugin to bypass bot detection.
- **Database:** PostgreSQL (v15-alpine) running in Docker.
- **Connection:** `pg` client (Node.js) for direct SQL execution.
- **ORM:** Prisma is installed for schema management (schema located in `prisma/schema.prisma`).

## 🗄️ Database Schema

**Table: `Lead`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL (PK) | Unique ID |
| `name` | TEXT | Business Name |
| `phone` | TEXT | Phone Number |
| `email` | TEXT | (Placeholder for future) |
| `website` | TEXT | Website URL |
| `address` | TEXT | Full Address |
| `source` | TEXT | Origin (e.g., 'google_maps') |
| `createdAt` | TIMESTAMP | Creation time |

## 🛠️ Troubleshooting

**Issue: `Connection refused`**
- Ensure Docker is running (`docker compose ps`).
- Check if port `5432` is not occupied by another Postgres instance.

**Issue: Scraper stuck on "Waiting..."**
- The scraper uses `domcontentloaded` to wait for the page. If internet is slow, it might timeout.
- Check `scraper.log` for detailed error messages.

**Issue: `Prisma` errors**
- We currently use raw SQL in `src/index.ts` to avoid complex Prisma CLI issues. Ensure `DATABASE_URL` in `.env` matches `docker-compose.yml`.

## 🤖 MCP Configuration
Add this to your Claude Desktop config to query the database via AI:

```json
{
  "postgres": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://admin:[REDACTED-DB-PASSWORD]@localhost:5432/swarm_leads"
    ]
  }
}
```
