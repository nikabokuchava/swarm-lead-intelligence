# Zip Code Grid Scaling & Global Quota Tracking — Brainstorm

> **Phase:** ANALYSIS (Brainstorm)
> **Date:** 2025-03-06
> **Agents:** @project-planner, @database-architect
> **Status:** DISCOVERY — No code changes

---

## Problem Statement

Google Maps returns a maximum of ~120 results per search query. When a user requests a large quota (e.g., "Plumbers in New York, max 1000"), a single search hits this ceiling. We need to **split large searches into granular Zip Code chunks**, run them as parallel workers, and **track a global quota** across all chunks so we stop collecting the moment the user's target is met.

### Current Architecture (As-Is)

```
Dashboard (Next.js)
    │
    ▼ INSERT
┌──────────────┐
│  ScrapeJob   │  ← Parent container (query, maxResults, status)
│  (1 row)     │
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────┐
│  ScrapeTask  │  ← Per-zipCode worker unit (zipCode, status, workerId)
│  (N rows)    │
└──────┬───────┘
       │ N:M
       ▼
┌──────────────┐
│   Company    │  ← Extracted leads (name, website, emails, jobId)
│  (M rows)    │
└──────────────┘
```

**Current Limitations:**
1. `ScrapeTask` rows must be created manually — no auto-splitting by zip code
2. `jobPoller.ts` processes tasks **sequentially** (single poller loop)
3. Quota check in `scraperService.ts` only counts companies within the current task's loop — no global cross-task awareness
4. No deduplication across zip codes (same business appears in adjacent zips)
5. No mechanism to cancel remaining PENDING tasks when global quota is met
6. `ScrapeJob.resultsFound` is set only at completion — not tracked in real-time

---

## Option 1: Parent/Child DB with Atomic Counter (Postgres-Native)

### Concept

Add an **atomic counter column** `currentResults` to `ScrapeJob`. Each worker increments it atomically after inserting a new unique Company. Workers check the counter before each extraction cycle and self-cancel when quota is met. A **cancellation sweep** marks remaining PENDING tasks as `CANCELLED`.

### Schema Changes (Conceptual)

```
ScrapeJob
  + currentResults   Int     @default(0)    -- atomic counter
  + strategy         String  @default("single")  -- "single" | "zipcode_grid"
  + region           String?                -- "New York, NY" (human-readable)

ScrapeTask
  + status           -- add CANCELLED to ProcessingStatus enum
  + resultsContributed  Int  @default(0)    -- how many leads THIS task added

ProcessingStatus enum
  + CANCELLED        -- new value
```

### Flow

```
1. Dashboard creates ScrapeJob (query="Plumbers", region="New York, NY", maxResults=1000, strategy="zipcode_grid")
2. Job Splitter service:
   a. Lookup zip codes for region (static table or API)
   b. INSERT N ScrapeTask rows (one per zip code), all linked to parent job
   c. Mark ScrapeJob as PROCESSING
3. Workers pick tasks (SKIP LOCKED on ScrapeTask):
   UPDATE "ScrapeTask" SET status='PROCESSING', worker_id=$1, locked_at=NOW()
   WHERE id = (SELECT id FROM "ScrapeTask" WHERE status='PENDING' AND job_id=$2
               ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
   RETURNING *;
4. Per-lead insertion:
   a. INSERT Company (with ON CONFLICT DO NOTHING for dedup)
   b. If inserted (not duplicate):
      UPDATE "ScrapeJob" SET "currentResults" = "currentResults" + 1
      WHERE id = $1 AND "currentResults" < "maxResults"
      RETURNING "currentResults";
   c. If returned currentResults >= maxResults → STOP, mark task COMPLETED
5. Cancellation sweep (triggered by quota-met worker):
   UPDATE "ScrapeTask" SET status='CANCELLED'
   WHERE job_id=$1 AND status='PENDING';
6. Job completion check:
   SELECT COUNT(*) FROM "ScrapeTask" WHERE job_id=$1 AND status IN ('PENDING','PROCESSING');
   → If 0: mark ScrapeJob COMPLETED, set resultsFound = currentResults
```

### Deduplication Strategy

```sql
-- Unique constraint on (name, address, jobId) OR (phone, jobId)
-- ON CONFLICT DO NOTHING ensures no double-count
INSERT INTO "Company" (name, address, phone, ..., job_id)
VALUES ($1, $2, $3, ..., $job)
ON CONFLICT (name, address) WHERE job_id = $job
DO UPDATE SET updated_at = NOW()  -- touch if stale (>30 days)
WHERE "Company".updated_at < NOW() - INTERVAL '30 days';
```

### Pros
| # | Pro |
|---|-----|
| 1 | **Pure Postgres** — no new infrastructure. Fits existing SKIP LOCKED pattern perfectly |
| 2 | **Atomic counter** — `currentResults + 1` is a single UPDATE, race-condition-free |
| 3 | **Cancellation is cheap** — bulk UPDATE on PENDING tasks, no pub/sub needed |
| 4 | **Worker self-governance** — each worker checks counter locally after its own INSERT |
| 5 | **Audit trail** — `resultsContributed` per task enables debugging & billing |
| 6 | **Dashboard ↔ Worker decoupling** preserved — communication is still only via Postgres |

### Cons
| # | Con |
|---|-----|
| 1 | **Row-level lock contention** on `ScrapeJob.currentResults` under high parallelism (>10 workers) |
| 2 | **Counter drift** if a worker crashes between Company INSERT and counter UPDATE (solvable via transaction) |
| 3 | **No real-time push** to dashboard — dashboard must poll `currentResults` |
| 4 | **Zip code lookup** requires either a static table (~42K US zip codes) or external API call |

### Implementation Effort: **LOW-MEDIUM**
- Schema migration: ~1 hour (add columns + enum value)
- Job splitter service: ~3 hours (zip lookup + task creation)
- Modify `scraperService.ts`: ~2 hours (atomic counter + cancellation)
- Modify `jobPoller.ts`: ~1 hour (SKIP LOCKED upgrade + parallel polling)
- Dedup constraint: ~1 hour (migration + ON CONFLICT logic)

---

## Option 2: Lead Aggregation via COUNT on Insert (Stateless Counter)

### Concept

Instead of maintaining an atomic counter column, **derive the current count** from the database every time via `SELECT COUNT(*)` on the Company table filtered by `jobId`. No mutable counter state — the database is the source of truth. Workers query the count before and after each extraction batch.

### Schema Changes (Conceptual)

```
ScrapeJob
  + strategy         String  @default("single")
  + region           String?

ScrapeTask
  + status           -- add CANCELLED

-- NO currentResults column needed
-- Count is always: SELECT COUNT(*) FROM Company WHERE jobId = $x
```

### Flow

```
1. Dashboard creates ScrapeJob + Job Splitter creates ScrapeTask rows (same as Option 1)
2. Workers pick tasks via SKIP LOCKED (same as Option 1)
3. Before each lead extraction:
   SELECT COUNT(*) FROM "Company" WHERE "jobId" = $1;
   → If count >= maxResults → mark task COMPLETED, trigger cancellation sweep
4. After inserting a Company:
   SELECT COUNT(*) FROM "Company" WHERE "jobId" = $1;
   → If count >= maxResults → stop + sweep
5. Job completion: same as Option 1
```

### Deduplication Strategy

Same as Option 1 — `ON CONFLICT` on `(name, address)` scoped to `jobId`.

### Pros
| # | Pro |
|---|-----|
| 1 | **Zero mutable state** — no counter drift, no crash recovery needed |
| 2 | **Always accurate** — COUNT(*) is the ground truth, no stale counters |
| 3 | **Simplest schema** — no new columns on ScrapeJob beyond strategy/region |
| 4 | **Pure Postgres** — no external dependencies |

### Cons
| # | Con |
|---|-----|
| 1 | **Performance under load** — COUNT(*) on Company table for every lead insertion is O(N). At 1000+ leads, this becomes measurable latency |
| 2 | **Race window** — two workers both COUNT = 999, both insert, final count = 1001 (overshoot by ~worker_count) |
| 3 | **Index required** — must add index on `Company(jobId)` to keep COUNT fast (already exists but verify) |
| 4 | **No real-time progress** without polling COUNT repeatedly from dashboard |
| 5 | **Overshoot risk** — without locking, parallel workers can exceed quota by the number of concurrent workers |

### Implementation Effort: **LOW**
- Schema migration: ~30 min (strategy/region columns + CANCELLED enum)
- Job splitter: ~3 hours (same as Option 1)
- Modify `scraperService.ts`: ~1.5 hours (COUNT check before/after insert)
- No counter logic to maintain

---

## Option 3: Postgres Advisory Locks + Quota Reservation (Batch Reservation)

### Concept

Workers **reserve a batch quota** from the parent job before starting their zip code extraction. Instead of checking the counter per-lead, a worker atomically claims a "slot" of N leads (e.g., 20) from the global quota. If fewer than N remain, it gets only what's left. If zero remain, it self-cancels. This minimizes contention to one lock acquisition per task, not per lead.

### Schema Changes (Conceptual)

```
ScrapeJob
  + currentResults   Int     @default(0)    -- tracks consumed quota
  + strategy         String  @default("single")
  + region           String?

ScrapeTask
  + reservedQuota    Int     @default(0)    -- how many leads this task is allowed to collect
  + status           -- add CANCELLED

ProcessingStatus enum
  + CANCELLED
```

### Flow

```
1. Dashboard + Job Splitter: same as Options 1 & 2
2. Worker picks task via SKIP LOCKED
3. Quota Reservation (atomic, per-task):
   -- Worker claims up to DEFAULT_BATCH_SIZE (e.g., 50) leads
   UPDATE "ScrapeJob"
   SET "currentResults" = LEAST("currentResults" + 50, "maxResults")
   WHERE id = $1
   RETURNING "currentResults" - (SELECT "currentResults" FROM "ScrapeJob" WHERE id = $1) AS granted;

   -- Simplified with CTE:
   WITH reservation AS (
     UPDATE "ScrapeJob"
     SET "currentResults" = LEAST("currentResults" + $batch, "maxResults")
     WHERE id = $1 AND "currentResults" < "maxResults"
     RETURNING "currentResults", "maxResults"
   )
   SELECT
     "currentResults" - ("currentResults" - LEAST($batch, "maxResults" - ("currentResults" - $batch))) AS granted_slots,
     "currentResults" >= "maxResults" AS quota_exhausted
   FROM reservation;

   -- Even simpler approach:
   BEGIN;
   SELECT "currentResults", "maxResults" FROM "ScrapeJob" WHERE id = $1 FOR UPDATE;
   -- app calculates: granted = MIN(batch_size, maxResults - currentResults)
   UPDATE "ScrapeJob" SET "currentResults" = "currentResults" + $granted WHERE id = $1;
   UPDATE "ScrapeTask" SET "reservedQuota" = $granted WHERE id = $taskId;
   COMMIT;

4. Worker extracts up to `reservedQuota` leads for its zip code
   - If it finds fewer (zip exhausted), the unused slots are "returned":
     UPDATE "ScrapeJob" SET "currentResults" = "currentResults" - $unused WHERE id = $1;
5. If granted = 0 → mark task CANCELLED immediately
6. Cancellation sweep: same as Option 1 (bulk cancel PENDING when quota fully reserved)
7. Job completion: same as Options 1 & 2
```

### Deduplication Strategy

Same as Options 1 & 2. But duplicates consume reserved quota — worker might "waste" a slot on a duplicate. Mitigation: slight over-reservation (grant batch + 10% buffer) and return unused.

### Pros
| # | Pro |
|---|-----|
| 1 | **Minimal contention** — lock on ScrapeJob row happens once per task, not once per lead |
| 2 | **Predictable worker behavior** — each worker knows exactly how many leads it can extract before starting |
| 3 | **No overshoot** — quota is pre-allocated, total cannot exceed maxResults |
| 4 | **Batch efficiency** — workers don't need per-insert counter checks |
| 5 | **Pure Postgres** — standard row-level locks, no advisory locks actually needed |
| 6 | **Horizontal scaling friendly** — works with 50+ workers without counter bottleneck |

### Cons
| # | Con |
|---|-----|
| 1 | **Quota fragmentation** — if a zip code has only 15 businesses but worker reserved 50, 35 slots are wasted until returned |
| 2 | **Return logic complexity** — workers must return unused quota on completion or crash (requires cleanup job) |
| 3 | **Stale reservation** — if worker crashes after reserving but before returning unused, quota is "leaked" until stale job recovery resets it |
| 4 | **Duplicate waste** — duplicates consume reserved slots, potentially under-delivering |
| 5 | **Most complex implementation** — reservation, return, leak recovery, buffer calculation |

### Implementation Effort: **MEDIUM-HIGH**
- Schema migration: ~1 hour
- Reservation logic: ~3 hours (atomic CTE + return logic)
- Stale reservation recovery: ~2 hours (extend existing `resetStalledJobs`)
- Job splitter: ~3 hours (same as all options)
- Modify `scraperService.ts`: ~2 hours (batch-aware loop)
- Integration testing for edge cases: ~3 hours

---

## Comparative Analysis

| Criterion | Option 1: Atomic Counter | Option 2: COUNT Aggregation | Option 3: Batch Reservation |
|-----------|:------------------------:|:---------------------------:|:---------------------------:|
| **Accuracy** | High (atomic UPDATE) | Highest (ground truth) | High (pre-allocated) |
| **Overshoot Risk** | ~1 lead (within transaction) | ~N workers (race window) | Zero (pre-reserved) |
| **Contention** | Per-lead (row lock on ScrapeJob) | None (read-only COUNT) | Per-task (one lock per batch) |
| **Crash Recovery** | Simple (transaction rollback) | None needed | Complex (return unused quota) |
| **Scalability (workers)** | Good up to ~10 | Good up to ~5 (COUNT cost) | Excellent (50+) |
| **Implementation Effort** | LOW-MEDIUM | LOW | MEDIUM-HIGH |
| **Schema Complexity** | Low (+2 columns) | Minimal (+1 column) | Medium (+3 columns) |
| **Dashboard Decoupling** | Preserved | Preserved | Preserved |
| **Fits SKIP LOCKED Pattern** | Natural extension | Compatible | Natural extension |
| **Real-time Progress** | Poll `currentResults` | Poll COUNT(*) | Poll `currentResults` |

---

## Cross-Cutting Concerns (All Options)

### 1. Zip Code Lookup Source

| Approach | Pros | Cons |
|----------|------|------|
| **Static DB table** (~42K US zips) | Fast, offline, no API cost | Needs initial seed, updates for new zips |
| **External API** (Zippopotam.us, Google Geocoding) | Always current | Rate limits, latency, cost |
| **Hybrid** (static + API fallback) | Best of both | More code |

**Recommendation:** Static `ZipCode` table seeded from Census Bureau data. Columns: `zip`, `city`, `state`, `lat`, `lng`. One-time seed, rarely changes.

### 2. Deduplication (Same Business, Adjacent Zip Codes)

```
"Joe's Plumbing" at "123 Main St" appears in zip 10001 AND 10002 searches.
```

**Strategy:** Composite unique constraint on `(name, phone, jobId)` or `(name, address, jobId)`.
- `ON CONFLICT DO NOTHING` → skip duplicates, don't count toward quota
- `ON CONFLICT DO UPDATE SET updatedAt = NOW() WHERE updatedAt < NOW() - INTERVAL '30 days'` → refresh stale data

### 3. Stale Data Refresh (>30 Days Old)

If a Company already exists from a previous job:
- Check `updatedAt` — if > 30 days, re-extract website/emails
- Don't count as "new" toward quota (it's a refresh, not a new lead)
- Flag with `isRefreshed: true` for dashboard filtering

### 4. Task Cancellation Propagation

When quota is met, remaining PENDING tasks should be cancelled:
```sql
UPDATE "ScrapeTask" SET status = 'CANCELLED'
WHERE "jobId" = $1 AND status = 'PENDING';
```
Currently PROCESSING tasks finish their current lead and self-terminate on next quota check.

### 5. Worker Parallelism Upgrade

Current `jobPoller.ts` is single-threaded sequential. For zip code grid:
- **Option A:** Run multiple poller instances (process-level parallelism via PM2)
- **Option B:** Convert poller to concurrent with `Promise.allSettled` (N workers in one process)
- **Recommendation:** PM2 cluster mode (already in stack) — each instance runs its own poller, SKIP LOCKED prevents double-claiming

---

## Final Recommendation

### Winner: Option 1 — Parent/Child DB with Atomic Counter

**Rationale:**

| Factor | Why Option 1 Wins |
|--------|-------------------|
| **Existing patterns** | Direct extension of current `ScrapeJob → ScrapeTask → Company` hierarchy and `SKIP LOCKED` in `queue.ts` |
| **Minimal new complexity** | Two new columns, one enum value. No reservation/return lifecycle to manage |
| **Acceptable contention** | Our workload is ~3-5 concurrent workers max. Atomic counter row lock is negligible at this scale |
| **Overshoot tolerance** | At most 1 extra lead per worker (within same transaction). Acceptable vs Option 2's N-worker overshoot |
| **Crash safety** | Wrapping Company INSERT + counter UPDATE in a single Prisma transaction eliminates drift entirely |
| **Upgrade path** | If we scale to 50+ workers, we can evolve to Option 3 (batch reservation) without schema redesign — `currentResults` column serves both patterns |
| **Dashboard decoupling** | Dashboard polls `ScrapeJob.currentResults` for real-time progress — pure Postgres, no new infrastructure |

### When to Reconsider

- **If we exceed 20+ parallel workers:** Contention on `currentResults` row becomes measurable → migrate to Option 3 (batch reservation)
- **If we need sub-second progress updates:** Add Postgres LISTEN/NOTIFY for push-based dashboard updates
- **If we go multi-region:** Redis becomes attractive for cross-datacenter quota coordination (but we're not there)

### Implementation Sequence (Preview)

```
Phase 1: Schema (database-architect)
  ├── Add currentResults, strategy, region to ScrapeJob
  ├── Add CANCELLED to ProcessingStatus enum
  ├── Add resultsContributed to ScrapeTask
  ├── Seed ZipCode lookup table
  └── Add dedup constraint on Company

Phase 2: Job Splitter (backend-specialist)
  ├── Region → zip code resolution service
  ├── Auto-create ScrapeTask rows per zip
  └── Dashboard API for zip-grid job creation

Phase 3: Worker Upgrade (backend-specialist)
  ├── Upgrade jobPoller to SKIP LOCKED on ScrapeTask
  ├── Atomic counter increment in scraperService
  ├── Cancellation sweep on quota met
  └── PM2 multi-instance poller support

Phase 4: Dashboard (frontend-specialist)
  ├── Real-time progress bar (poll currentResults)
  ├── Zip code grid visualization
  └── Per-task status breakdown

Phase 5: Verification (test-engineer)
  ├── Concurrent worker quota race test
  ├── Dedup across zip codes test
  ├── Crash recovery + stale job test
  └── End-to-end: 1000 leads across 50 zip codes
```

---

> **Next Step:** User approval → proceed to PLANNING phase with `zipcode-grid.md` task breakdown.
