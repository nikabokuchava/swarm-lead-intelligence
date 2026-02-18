# 🏗️ Architecture Guide

## The "Bridge" Pattern

Swarm Lead Scraper uses a decoupled "Bridge" architecture to separate the User Interface (Next.js) from the Scraping Engine (Node.js).

### Why this pattern?

Web scraping is resource-intensive and long-running. Keeping it separate from the Next.js server prevents request timeouts and allows the scraper to scale independently.

### How it works:

1.  **Dashboard (Frontend):** User creates a `ScrapeJob` via Server Actions.
2.  **Database (Bridge):** The job is saved with status `PENDING`.
3.  **Worker (Backend):** A continuous polling loop (`jobPoller.ts`) checks for `PENDING` jobs.
4.  **Execution:** The worker picks up the job, updates status to `PROCESSING`, and launches Puppeteer.
5.  **Completion:** Leads are saved to `Company` and `Contact` tables, and job status becomes `COMPLETED`.

---

## 🗄️ Database Schema

We use PostgreSQL with Prisma ORM.

### Key Models

#### `ScrapeJob`

Represents a user's request to scrape data.

- **id:** UUID
- **userId:** Clerk User ID (Multi-tenancy isolation)
- **query:** Search term (e.g., "Software Companies in Austin")
- **status:** `PENDING` | `PROCESSING` | `COMPLETED` | `FAILED`

#### `Company`

The main entity extracted from Google Maps.

- **name:** Business Name
- **website:** Official Website
- **phone:** Contact Number
- **jobId:** Link to the job that found this company

#### `Contact`

People associated with the company (if extracted).

- **fullName:** Name
- **workEmail:** Email address
- **title:** Job Title

---

## 🕷️ Scraping Logic

The scraper (`src/scraper/`) employs a Hybrid Strategy for maximum reliability.

### 1. Stealth Browser

Uses `puppeteer-extra-plugin-stealth` to evade bot detection. It mimics real user behavior (mouse movements, random delays).

### 2. Extraction Pipeline

- **Google Maps:** Extracts basic info (Name, Address, Website).
- **Website Visit:** If a website exists, the scraper visits it to find emails.
- **Hybrid Parser:**
  1.  **HTML/Regex:** Scans for `mailto:` links and email patterns.
  2.  **LLM Fallback:** (Optional) If regex fails, uses an LLM to infer contact info from "About Us" or "Contact" pages.

### 3. Multi-Tenancy

All data access is scoped by `userId`.

- **Dashboard:** Queries filter by `userId` from Clerk.
- **Worker:** Processes jobs globally but maintains the `userId` link so data appears only for the correct user.
