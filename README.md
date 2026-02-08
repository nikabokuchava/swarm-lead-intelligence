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

### 4. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

### 5. Initialize Database

```bash
npx prisma migrate dev
```

### 6. Run the Scraper

```bash
npx tsx src/index.ts --query "dentists in tbilisi" --max 20
```

---

## 💻 CLI Usage

```bash
npx tsx src/index.ts [options]
```

### Options

| Option                 | Description                  | Default                |
| ---------------------- | ---------------------------- | ---------------------- |
| `-q, --query <string>` | Search query (required)      | -                      |
| `-m, --max <number>`   | Maximum results to scrape    | `20`                   |
| `--headless`           | Run browser in headless mode | `false`                |
| `-o, --output <path>`  | Custom CSV output path       | `leads_YYYY-MM-DD.csv` |
| `-h, --help`           | Display help                 | -                      |

### Examples

```bash
# Basic usage
npx tsx src/index.ts --query "restaurants in berlin"

# Limit to 10 results
npx tsx src/index.ts --query "lawyers in london" --max 10

# Run headless with custom output
npx tsx src/index.ts --query "gyms in tokyo" --max 50 --headless --output gyms.csv

# View help
npx tsx src/index.ts --help
```

### Output

- **Database**: Results saved to PostgreSQL (`companies` table)
- **CSV**: Auto-generated `leads_YYYY-MM-DD_HH-mm-ss.csv`
- **Logs**: Detailed logs saved to `scraper.log`

---

## 🏗️ Architecture

- **Scraper Engine:** [Puppeteer Extra](https://github.com/berstend/puppeteer-extra) + Stealth Plugin
- **Database:** PostgreSQL (v15-alpine) in Docker
- **ORM:** Prisma for schema management
- **CLI:** Commander.js for argument parsing
- **Config:** Centralized configuration via `.env`

## 🗄️ Database Schema

### Table: `companies`

| Column       | Type      | Description                  |
| ------------ | --------- | ---------------------------- |
| `id`         | UUID (PK) | Unique ID                    |
| `name`       | TEXT      | Business Name                |
| `phone`      | TEXT      | Phone Number                 |
| `website`    | TEXT      | Website URL                  |
| `address`    | TEXT      | Full Address                 |
| `source`     | TEXT      | Origin (e.g., 'google_maps') |
| `created_at` | TIMESTAMP | Creation time                |

### Table: `contacts`

| Column             | Type      | Description           |
| ------------------ | --------- | --------------------- |
| `id`               | UUID (PK) | Unique ID             |
| `company_id`       | UUID (FK) | Reference to company  |
| `full_name`        | TEXT      | Contact Name          |
| `title`            | TEXT      | Job Title             |
| `linkedin_url`     | TEXT      | LinkedIn Profile      |
| `work_email`       | TEXT      | Work Email            |
| `confidence_score` | FLOAT     | Data confidence (0-1) |

### Table: `scrape_jobs`

| Column          | Type      | Description           |
| --------------- | --------- | --------------------- |
| `id`            | UUID (PK) | Unique ID             |
| `query`         | TEXT      | Search query          |
| `status`        | TEXT      | Job status            |
| `max_results`   | INT       | Max results requested |
| `results_found` | INT       | Actual results found  |
| `created_at`    | TIMESTAMP | Job start time        |
| `completed_at`  | TIMESTAMP | Job end time          |

---

## ⚙️ Configuration

Environment variables (`.env`):

```bash
DATABASE_URL=postgresql://admin:[REDACTED-DB-PASSWORD]@localhost:5432/swarm_leads

# Optional (with defaults)
# MAX_RESULTS=20
# SCROLL_DELAY_MS=1200
# HEADLESS=false
# LOG_FILE=scraper.log
```

---

## 🛠️ Troubleshooting

**Issue: `Connection refused`**

- Ensure Docker is running (`docker compose ps`)
- Check if port `5432` is not occupied

**Issue: Scraper stuck on "Waiting..."**

- Check `scraper.log` for detailed error messages
- Slow internet may cause timeouts

**Issue: `Prisma` errors**

- Run `npx prisma migrate dev` to sync schema
- Ensure `DATABASE_URL` in `.env` matches `docker-compose.yml`

---

## 🤖 MCP Configuration

Add this to Claude Desktop config to query the database via AI:

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

---

## 📁 Project Structure

```
swarm-lead-scraper/
├── src/
│   ├── index.ts          # Main scraper with CLI
│   ├── config/           # Centralized configuration
│   └── utils/            # Utility functions (CSV export)
├── prisma/
│   └── schema.prisma     # Database schema
├── .env.example          # Environment template
├── docker-compose.yml    # PostgreSQL container
└── scraper.log           # Execution logs
```
