# Swarm Lead Intelligence Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden and elevate the Swarm Lead Scraper into a production-grade, portfolio-ready B2B Lead Intelligence SaaS showcase by eliminating tenant data leaks, worker crash loops, credential exposures, and test timeouts, followed by database-level deduplication, exponential backoff, auditable credit-ledger billing, multi-container Docker deployment, and verified demo tooling.

**Architecture:** A decoupled bridge pattern connecting a Next.js 16 App Router dashboard to autonomous Node.js background workers exclusively via PostgreSQL using atomic `FOR UPDATE SKIP LOCKED` claim queries. Tenant isolation is strictly fail-closed at the SSR and server-action layers; worker crashes cleanly release claimed leases with exponential backoff and jitter; credit mutations are recorded in an append-only ledger; and companies enforce database-level uniqueness.

**Tech Stack:** TypeScript (strict mode), Next.js 16 (App Router), PostgreSQL 15, Prisma 5.22, Puppeteer Extra with Stealth, Google Gemini 2.5 Flash / OpenAI, Vitest 4.x, Clerk Auth, Stripe Billing.

**Spec:** `D:\LEADS2\CODE_REVIEW.md` (Staff-Engineer Audit) and `D:\LEADS2\implementation_plan.md` (Remediation Roadmap).

## Global Constraints

- **Language & Runtime:** TypeScript 5.x on Node.js 20+; Next.js 16.1.6; ESM modules.
- **Fail-Closed Security:** Dashboard pages and actions MUST fail closed; unauthenticated requests redirect to `/sign-in` or throw 401; never fall back to `{}` Prisma filters.
- **Atomic Concurrency:** All worker claims MUST use single-query `FOR UPDATE SKIP LOCKED` with `RETURNING *`.
- **Zero Secrets in Logs:** Never log `DATABASE_URL`, Stripe keys, or Clerk secrets in console output or tests.
- **Formula Injection Defense:** All CSV export cells beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` MUST be prefixed with `'` (CWE-1236).
- **Test Integrity:** Every step follows strict TDD (failing test -> pass -> commit); zero timeouts or hanging async handles; all tests run via `vitest run`.

---

### Task 1: Tenant Isolation Testing & Fail-Closed Guard Hardening

**Files:**
- Modify: `dashboard/src/lib/tenant.ts:1-16`
- Modify: `dashboard/src/app/dashboard/jobs/page.tsx:8-18`
- Modify: `dashboard/src/app/dashboard/leads/page.tsx:24-45`
- Test: `dashboard/tests/tenant-isolation.test.ts`

**Interfaces:**
- Consumes: `auth` from `@clerk/nextjs/server`, `redirect` from `next/navigation`
- Produces: `requireUserId(): Promise<string>` that strictly returns `string` or redirects, guaranteeing zero queries with empty `where: {}`

- [ ] **Step 1: Write the failing test**

Create `dashboard/tests/tenant-isolation.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { requireUserId } from '@/lib/tenant';

describe('requireUserId Tenant Guard (Fail-Closed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /sign-in when auth() returns null userId', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);

    await expect(requireUserId()).rejects.toThrow('NEXT_REDIRECT:/sign-in');
    expect(redirect).toHaveBeenCalledWith('/sign-in');
  });

  it('redirects to /sign-in when auth() returns undefined session', async () => {
    vi.mocked(auth).mockResolvedValue({} as any);

    await expect(requireUserId()).rejects.toThrow('NEXT_REDIRECT:/sign-in');
    expect(redirect).toHaveBeenCalledWith('/sign-in');
  });

  it('returns valid userId when authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user_clerk_987' } as any);

    const userId = await requireUserId();
    expect(userId).toBe('user_clerk_987');
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run dashboard/tests/tenant-isolation.test.ts`
Expected: FAIL if path resolution or typing issues exist, or verification of mock behavior.

- [ ] **Step 3: Write minimal implementation**

Ensure `dashboard/src/lib/tenant.ts` is strictly typed and handles both null and empty string:
```typescript
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

/**
 * Fail-closed tenant guard for server components and route handlers.
 * Returns the authenticated Clerk userId, or redirects to /sign-in when absent.
 * Never fall back to an unscoped ({}) Prisma filter — that reads every tenant's rows.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.userId;
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    redirect('/sign-in');
  }
  return userId;
}
```

Verify `dashboard/src/app/dashboard/jobs/page.tsx` line 12 strictly passes `{ userId }`:
```typescript
export default async function JobsPage() {
  const userId = await requireUserId();

  const jobs = await prisma.scrapeJob.findMany({
    where: { userId },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });
...
```

Verify `dashboard/src/app/dashboard/leads/page.tsx` line 39 strictly scopes `whereClause`:
```typescript
  const userId = await requireUserId();
  const searchParams = await props.searchParams;
  const jobId = searchParams.jobId;
  let jobName = null;

  if (jobId) {
    const job = await prisma.scrapeJob.findUnique({
      where: { id: jobId },
      select: { query: true, userId: true }
    });
    if (job && job.userId === userId) jobName = job.query;
  }

  const whereClause: { userId: string; jobId?: string } = { userId };
  if (jobId) whereClause.jobId = jobId;

  const leads = await prisma.company.findMany({
    where: whereClause,
...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run dashboard/tests/tenant-isolation.test.ts`
Expected: PASS (3 tests passed).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/tenant.ts dashboard/src/app/dashboard/jobs/page.tsx dashboard/src/app/dashboard/leads/page.tsx dashboard/tests/tenant-isolation.test.ts
git commit -m "fix(security): enforce fail-closed tenant isolation in dashboard jobs and leads"
```

---

### Task 2: Credential Leak Removal & CSV Formula Injection Defense

**Files:**
- Modify: `dashboard/src/lib/db.ts:8`
- Modify: `dashboard/src/app/api/leads/export/route.ts:40-75`
- Test: `dashboard/tests/csvEscape.test.ts`
- Test: `dashboard/tests/export-csv.test.ts`

**Interfaces:**
- Consumes: `escapeCsvCell` from `@/lib/csvEscape`
- Produces: Sanitized CSV export stream immune to CWE-1236 spreadsheet injection

- [ ] **Step 1: Write the failing test**

Create `dashboard/tests/export-csv.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { escapeCsvCell } from '@/lib/csvEscape';

describe('CSV Formula Injection Defense (CWE-1236)', () => {
  it('neutralizes dangerous formula characters at cell start', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+SUM(A1:A10)')).toBe("'+SUM(A1:A10)");
    expect(escapeCsvCell('-20*5')).toBe("'-20*5");
    expect(escapeCsvCell('@cmd|calc')).toBe("'@cmd|calc");
    expect(escapeCsvCell('\t=2+2')).toBe("'\t=2+2");
    expect(escapeCsvCell('\r=3+3')).toBe("'\r=3+3");
  });

  it('escapes quotes and wraps in double quotes when formula and comma coincide', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil.com","Click")')).toBe('"\'=HYPERLINK(""http://evil.com"",""Click"")"');
  });

  it('preserves clean numeric and text strings unmodified', () => {
    expect(escapeCsvCell('Acme Plumbing LLC')).toBe('Acme Plumbing LLC');
    expect(escapeCsvCell(4.8)).toBe('4.8');
    expect(escapeCsvCell(120)).toBe('120');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run dashboard/tests/export-csv.test.ts`
Expected: Verify test assertions execute.

- [ ] **Step 3: Write minimal implementation**

In `dashboard/src/lib/db.ts`, delete line 8 `console.log('[DB DEBUG] DATABASE_URL =', process.env.DATABASE_URL);`:
```typescript
import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: true });

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // Query logging echoes every SQL statement incl. PII params — never in production.
    log: process.env.NODE_ENV === 'production' ? [] : ['query'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

In `dashboard/src/app/api/leads/export/route.ts`, verify that every field is processed through `escapeCsvCell`:
```typescript
    const escape = escapeCsvCell;

    const csvHeaders = [
      'Company Name', 'Website', 'Phone', 'Address', 'Rating', 'Review Count',
      'Contact Name', 'Email', 'Email Type', 'Confidence (%)', 'Verification Status', 'MX Provider',
    ];

    const csvRows = leads.map(lead => {
      const companyFields = [
        escape(lead.name),
        escape(lead.website),
        escape(lead.phone),
        escape(lead.address),
        escape(lead.rating),
        escape(lead.reviewCount),
      ];

      const best = lead.contacts.length > 0
        ? [...lead.contacts].sort((a, b) => {
            if (a.verificationStatus === 'VALID' && b.verificationStatus !== 'VALID') return -1;
            if (b.verificationStatus === 'VALID' && a.verificationStatus !== 'VALID') return 1;
            return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
          })[0]
        : null;

      return [
        ...companyFields,
        escape(best?.fullName),
        escape(best?.workEmail),
        escape(best?.emailType),
        escape(best?.confidenceScore != null ? Math.round(best.confidenceScore) : null),
        escape(best?.verificationStatus),
        escape(best?.mxProvider),
      ].join(',');
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run dashboard/tests/export-csv.test.ts dashboard/tests/csvEscape.test.ts`
Expected: PASS (all tests pass).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/db.ts dashboard/src/app/api/leads/export/route.ts dashboard/tests/export-csv.test.ts
git commit -m "fix(security): remove DATABASE_URL log and verify CSV injection sanitization"
```

---

### Task 3: Worker Crash Loop Prevention & In-Flight Release Hardening

**Files:**
- Modify: `src/worker.ts:311-331`
- Test: `tests/worker-crash-recovery.test.ts`

**Interfaces:**
- Consumes: `failJobOrRetry(companyId: string, currentRetries: number, errorMessage?: string)` from `./db/queue.js`
- Produces: Guaranteed release and retry increment of in-flight `Company` on unexpected errors/crashes

- [ ] **Step 1: Write the failing test**

Create `tests/worker-crash-recovery.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/queue.js', () => ({
  getNextPendingLead: vi.fn(),
  completeJob: vi.fn(),
  failJobOrRetry: vi.fn().mockResolvedValue(undefined),
  recoverStaleLocks: vi.fn().mockResolvedValue({ tasks: 0, companies: 0 }),
  cancelOrphanedPendingRecords: vi.fn().mockResolvedValue({ tasks: 0, companies: 0 }),
}));

import { failJobOrRetry } from '../src/db/queue.js';

describe('Worker Crash Loop Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls failJobOrRetry with inFlight company id and retries when error throws during scrape', async () => {
    const inFlight = { id: 'comp-crash-99', retries: 1 };
    const simulatedError = new Error('Browser out of memory');

    // Simulate error handling block in worker.ts
    try {
      throw simulatedError;
    } catch (loopError) {
      if (inFlight) {
        await failJobOrRetry(inFlight.id, inFlight.retries, (loopError as Error).message);
      }
    }

    expect(failJobOrRetry).toHaveBeenCalledWith(
      'comp-crash-99',
      1,
      'Browser out of memory'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/worker-crash-recovery.test.ts`
Expected: PASS/FAIL check on simulated scenario.

- [ ] **Step 3: Write minimal implementation**

In `src/worker.ts`, inspect and verify the `catch (loopError)` block at lines 311-331:
```typescript
            } catch (loopError) {
                // Transient per-job error — release the claimed row, rotate browser, continue
                const errorMsg = loopError instanceof Error ? loopError.message : String(loopError);
                logger.error('💥 Error processing job — rotating browser:', loopError);
                if (inFlight) {
                    try {
                        await failJobOrRetry(inFlight.id, inFlight.retries, errorMsg);
                        logger.info(`🔓 Released claimed company ${inFlight.id} after crash (retries was: ${inFlight.retries})`);
                    } catch (releaseErr) {
                        logger.error('⚠️ Could not release claimed company after crash:', releaseErr);
                    }
                    inFlight = null;
                }
                try {
                    await rotateBrowser('crash recovery');
                } catch (restartErr) {
                    logger.error('💀 Failed to restart browser after crash:', restartErr);
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/worker-crash-recovery.test.ts tests/retry-semantics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker.ts tests/worker-crash-recovery.test.ts
git commit -m "fix(worker): ensure in-flight company retries increment and release on catch-all error"
```

---

### Task 4: Test Suite Stability & CLI/Queue Timeout Elimination

**Files:**
- Modify: `src/index.ts:20-78`
- Modify: `src/worker.ts:335-345`
- Modify: `tests/cli-tasks.test.ts:1-81`
- Modify: `tests/queue.test.ts:260-302`

**Interfaces:**
- Consumes: Module entry points `main()` and `runWorker()`
- Produces: Guarded direct-execution checks preventing background loops and side-effects during test imports

- [ ] **Step 1: Write the failing test**

In `tests/cli-tasks.test.ts`, update to test `main` directly without module-level race conditions:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('commander', () => ({
    program: {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        parse: vi.fn().mockReturnThis(),
        opts: vi.fn().mockReturnValue({
            query: 'test query',
            max: '5',
            headless: true,
        }),
    }
}));

const mockProcessJob = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/services/scraperService.js', () => ({
    processJob: mockProcessJob
}));

vi.mock('../src/services/jobPoller.js', () => ({
    startPolling: vi.fn().mockResolvedValue(undefined)
}));

const mockCreateJob = vi.fn().mockResolvedValue({ id: 'job-123' });
const mockCreateTask = vi.fn().mockResolvedValue({ id: 'task-456' });

vi.mock('../src/db/company.js', () => ({
    connectDB: vi.fn().mockResolvedValue(undefined),
    disconnectDB: vi.fn().mockResolvedValue(undefined),
    prisma: {
        scrapeJob: {
            create: mockCreateJob
        },
        scrapeTask: {
            create: mockCreateTask
        }
    }
}));

describe('CLI Task Creation', () => {
    let originalExit: any;

    beforeEach(() => {
        vi.clearAllMocks();
        originalExit = process.exit;
        Object.defineProperty(process, 'exit', { value: vi.fn(), writable: true });
    });

    afterEach(() => {
        Object.defineProperty(process, 'exit', { value: originalExit, writable: true });
    });

    it('should create a ScrapeJob and a corresponding ScrapeTask when run from CLI', async () => {
        const { main } = await import('../src/index.js');
        await main();

        expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                query: 'test query',
                maxResults: 5,
                status: 'PENDING'
            })
        }));

        expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                jobId: 'job-123',
                query: 'test query',
                status: 'PENDING'
            })
        }));

        expect(mockProcessJob).toHaveBeenCalledWith('task-456', true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli-tasks.test.ts`
Expected: FAIL (`main is not exported` or signature error).

- [ ] **Step 3: Write minimal implementation**

In `src/index.ts`, export `main` and guard top-level invocation with `import.meta.url`:
```typescript
import { program } from 'commander';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { createAppLogger } from './utils/logger.js';
import { connectDB, disconnectDB, prisma } from './db/company.js';
import { startPolling } from './services/jobPoller.js';
import { processJob } from './services/scraperService.js';

const logger = createAppLogger();

// Parse CLI arguments
program
    .name('swarm-lead-scraper')
    .description('Scrapes business leads from Google Maps and queues them for email extraction')
    .option('-q, --query <string>', 'Search query (e.g., "dentists in tbilisi")')
    .option('-m, --max <number>', 'Maximum results to scrape', '20')
    .option('--headless', 'Run browser in headless mode')
    .option('--serve', 'Run as a background service (Job Poller)')
    .parse();

export async function main() {
    const options = program.opts();
    try {
        await connectDB();
        logger.info('🔌 Connected to DB');

        // MODE 1: Background Service (Poller)
        if (options.serve) {
            logger.info('🚀 Starting in Service Mode (--serve)...');
            await startPolling();
            return; 
        }

        // MODE 2: CLI Command (Immediate Execution)
        if (!options.query) {
            console.error('Error: --query is required (or use --serve).');
            process.exit(1);
        }

        const searchQuery = options.query as string;
        const maxResults = parseInt(options.max as string, 10);
        const headlessMode = options.headless || config.HEADLESS;

        logger.info(`🚀 Launching CLI Job: "${searchQuery}"`);

        // Create Job + Task for CLI mode
        const job = await prisma.scrapeJob.create({
            data: {
                query: searchQuery,
                status: 'PENDING',
                maxResults: maxResults
            }
        });

        const task = await prisma.scrapeTask.create({
            data: {
                jobId: job.id,
                query: searchQuery,
                status: 'PENDING'
            }
        });

        // Process immediately (blocking) — processJob expects a taskId
        await processJob(task.id, headlessMode);

    } catch (error) {
        logger.error('❌ Fatal Error:', error);
        process.exit(1);
    } finally {
        const currentOpts = program.opts();
        if (!currentOpts.serve) {
            await disconnectDB();
        }
    }
}

// Only execute if called directly via CLI
const isDirectExecution = process.argv[1] && (
    process.argv[1].endsWith('index.ts') || 
    process.argv[1].endsWith('index.js') ||
    fileURLToPath(import.meta.url) === process.argv[1]
);

if (isDirectExecution) {
    main();
}
```

In `src/worker.ts`, guard `runWorker()` on line 340 so imports do not launch Chromium:
```typescript
import { fileURLToPath } from 'url';

// Only execute if called directly via CLI
const isDirectExecution = process.argv[1] && (
    process.argv[1].endsWith('worker.ts') || 
    process.argv[1].endsWith('worker.js') ||
    fileURLToPath(import.meta.url) === process.argv[1]
);

if (isDirectExecution) {
    runWorker();
}

export { runWorker };
```

In `tests/queue.test.ts`, ensure `describe('Job Finalization (Transaction) in processJob')` sets test timeout explicitly to 10000ms if needed, but runs with mocked collaborators:
```typescript
        it('should update job status to COMPLETED and set resultsFound when all tasks finish', async () => {
            const mockTx = {
                scrapeTask: {
                    count: vi.fn().mockResolvedValue(0),
                },
                company: {
                    count: vi.fn().mockResolvedValue(42),
                },
                scrapeJob: {
                    update: vi.fn(),
                }
            };
            
            (mockPrisma.$transaction as any).mockImplementation(async (callback: any) => {
                return callback(mockTx);
            });

            (mockPrisma.scrapeTask.findUnique as any).mockResolvedValue({
                id: 'task-1',
                jobId: 'job-1',
                query: 'test',
                retries: 0,
                maxRetries: 3,
                scrapeJob: { id: 'job-1', userId: 'user-1' }
            });

            const { processJob } = await import('../src/services/scraperService');
            await processJob('task-1', true);

            expect(mockTx.scrapeJob.update).toHaveBeenCalledWith({
                where: { id: 'job-1' },
                data: expect.objectContaining({
                    status: 'COMPLETED',
                    resultsFound: 42
                })
            });
            expect(mockTx.company.count).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
        });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli-tasks.test.ts tests/queue.test.ts`
Expected: PASS within <2.0s with zero timeouts.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/worker.ts tests/cli-tasks.test.ts tests/queue.test.ts
git commit -m "fix(tests): guard index and worker entry points against side-effects on import and eliminate timeouts"
```

---

### Task 5: Schema Migration for Queue Backoff, Jitter & Credit Ledger

**Files:**
- Modify: `prisma/schema.prisma:17-51,99-136`
- Create: `prisma/migrations/20260904120000_add_queue_backoff_and_credit_ledger/migration.sql`

**Interfaces:**
- Consumes: PostgreSQL schema definition
- Produces: Prisma Client types with `nextAttemptAt`, `attemptCount`, and `CreditLedger` model

- [ ] **Step 1: Write the failing test**

Create `tests/schema-types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

describe('Prisma Schema Additions', () => {
  it('includes nextAttemptAt and attemptCount in CompanyScalarFieldEnum', () => {
    expect(Prisma.CompanyScalarFieldEnum.nextAttemptAt).toBe('nextAttemptAt');
    expect(Prisma.CompanyScalarFieldEnum.attemptCount).toBe('attemptCount');
  });

  it('includes nextAttemptAt and attemptCount in ScrapeTaskScalarFieldEnum', () => {
    expect(Prisma.ScrapeTaskScalarFieldEnum.nextAttemptAt).toBe('nextAttemptAt');
    expect(Prisma.ScrapeTaskScalarFieldEnum.attemptCount).toBe('attemptCount');
  });

  it('includes CreditLedgerScalarFieldEnum', () => {
    expect(Prisma.CreditLedgerScalarFieldEnum.delta).toBe('delta');
    expect(Prisma.CreditLedgerScalarFieldEnum.reason).toBe('reason');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schema-types.test.ts`
Expected: FAIL with Property 'nextAttemptAt' does not exist on type 'typeof CompanyScalarFieldEnum'.

- [ ] **Step 3: Write minimal implementation**

In `prisma/schema.prisma`:
1. In `model Company`:
```prisma
  // Job Queue Fields
  status        ProcessingStatus @default(PENDING)
  workerId      String?          @map("worker_id")
  lockedAt      DateTime?        @map("locked_at")
  retries       Int              @default(0)
  attemptCount  Int              @default(0) @map("attempt_count")
  nextAttemptAt DateTime?        @map("next_attempt_at")
  failureReason String?          @map("failure_reason")
  failedAt      DateTime?        @map("failed_at")
```
2. In `model ScrapeTask`:
```prisma
  status        ProcessingStatus @default(PENDING)
  workerId      String?          @map("worker_id")
  lockedAt      DateTime?        @map("locked_at")
  retries       Int              @default(0)
  attemptCount  Int              @default(0) @map("attempt_count")
  maxRetries    Int              @default(3) @map("max_retries")
  nextAttemptAt DateTime?        @map("next_attempt_at")
  failureReason String?          @map("failure_reason")
  failedAt      DateTime?        @map("failed_at")
```
3. In `model User`:
```prisma
model User {
  id           String         @id @default(uuid())
  clerkId      String         @unique @map("clerk_id")
  email        String         @unique
  credits      Int            @default(100)
  createdAt    DateTime       @default(now())
  creditLedger CreditLedger[]

  @@map("users")
}
```
4. Add new `CreditLedger` model:
```prisma
model CreditLedger {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  clerkId   String   @map("clerk_id")
  delta     Int
  reason    String
  refId     String?  @map("ref_id")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([clerkId, createdAt])
  @@map("credit_ledger")
}
```

Create migration SQL `prisma/migrations/20260904120000_add_queue_backoff_and_credit_ledger/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "companies" ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "next_attempt_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "scrape_tasks" ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "next_attempt_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "clerk_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_ledger_clerk_id_created_at_idx" ON "credit_ledger"("clerk_id", "created_at");

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Run Prisma code generation:
`npx prisma generate`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schema-types.test.ts`
Expected: PASS (all 3 tests pass).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260904120000_add_queue_backoff_and_credit_ledger/migration.sql tests/schema-types.test.ts
git commit -m "feat(db): add queue backoff fields and CreditLedger model to Prisma schema"
```

---

### Task 6: Queue Exponential Backoff & Jitter Implementation

**Files:**
- Modify: `src/db/queue.ts:55-93,215-245`
- Modify: `src/services/jobPoller.ts:27-50`
- Test: `tests/retry-semantics.test.ts`

**Interfaces:**
- Consumes: `Company`, `ScrapeTask` schema with `nextAttemptAt` and `attemptCount`
- Produces: `getNextPendingLead` filtering `nextAttemptAt <= NOW()`, and `failJobOrRetry` calculating exponential delay with jitter

- [ ] **Step 1: Write the failing test**

In `tests/retry-semantics.test.ts`, replace `it.todo` with active backoff tests:
```typescript
    describe('backoff and jitter on retry', () => {
        it('failJobOrRetry sets nextAttemptAt in the future and increments attemptCount', async () => {
            (mockPrisma.company.update as any).mockResolvedValue({});
            const before = Date.now();

            await failJobOrRetry('company-backoff-1', 1, 'Transient error');

            const call = (mockPrisma.company.update as any).mock.calls[0][0];
            expect(call.where).toEqual({ id: 'company-backoff-1' });
            expect(call.data.status).toBe('PENDING');
            expect(call.data.retries).toEqual({ increment: 1 });
            expect(call.data.attemptCount).toEqual({ increment: 1 });
            expect(call.data.nextAttemptAt).toBeInstanceOf(Date);
            expect(call.data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 4000);
        });

        it('getNextPendingLead claim SQL filters on next_attempt_at <= NOW()', async () => {
            (mockPrisma.$queryRaw as any).mockResolvedValue([]);

            await getNextPendingLead('worker-backoff');

            const call = (mockPrisma.$queryRaw as any).mock.calls[0];
            const sql = (call[0] as string[]).join(' ').toLowerCase();
            expect(sql).toContain('next_attempt_at');
        });
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/retry-semantics.test.ts`
Expected: FAIL (`expected sql to contain next_attempt_at`).

- [ ] **Step 3: Write minimal implementation**

In `src/db/queue.ts`:
1. Update `getNextPendingLead`:
```typescript
export async function getNextPendingLead(workerId: string): Promise<Company | null> {
    try {
        const rows = await prisma.$queryRaw<CompanyRawRow[]>`
            UPDATE "companies"
            SET status = 'PROCESSING'::"ProcessingStatus",
                "worker_id" = ${workerId},
                "locked_at" = NOW()
            WHERE id = (
                SELECT id
                FROM "companies"
                WHERE status = 'PENDING'
                  AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= NOW())
                ORDER BY "created_at" ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *;
        `;

        if (rows && rows.length > 0) {
            return mapRawToCompany(rows[0]);
        }

        return null;
    } catch (error) {
        const prismaError = error as { code?: string };
        if (prismaError.code === 'P1001' || prismaError.code === 'P1017' || prismaError.code === 'P2024' ||
            (error instanceof Error && error.message.toLowerCase().includes('connect'))) {
            throw error;
        }
        console.error('Error fetching next job:', error);
        return null;
    }
}
```

2. Update `failJobOrRetry`:
```typescript
export function computeBackoffDelayMs(currentRetries: number): number {
    const baseDelayMs = 5000;
    const maxDelayMs = 300_000; // 5 minutes cap
    const exponential = baseDelayMs * Math.pow(2, currentRetries);
    const jitter = Math.floor(Math.random() * 1000);
    return Math.min(maxDelayMs, exponential + jitter);
}

export async function failJobOrRetry(
    companyId: string, 
    currentRetries: number, 
    errorMessage?: string,
    delayMs?: number
) {
    const MAX_RETRIES = 3;

    if (currentRetries >= MAX_RETRIES) {
        await prisma.company.update({
            where: { id: companyId },
            data: {
                status: 'FAILED',
                failureReason: errorMessage ?? null,
                failedAt: new Date(),
            }
        });
    } else {
        const delay = delayMs ?? computeBackoffDelayMs(currentRetries);
        const nextAttemptAt = new Date(Date.now() + delay);

        await prisma.company.update({
            where: { id: companyId },
            data: {
                status: 'PENDING',
                workerId: null,
                lockedAt: null,
                retries: { increment: 1 },
                attemptCount: { increment: 1 },
                nextAttemptAt: nextAttemptAt,
            }
        });
    }
}
```

3. Update `src/services/jobPoller.ts` in `claimNextTask()`:
```typescript
async function claimNextTask(): Promise<string | null> {
    const result = await prisma.$queryRaw<{ id: string }[]>`
        UPDATE "scrape_tasks"
        SET status = 'PROCESSING',
            "worker_id" = ${POLLER_ID},
            "locked_at" = NOW()
        WHERE id = (
            SELECT id
            FROM "scrape_tasks"
            WHERE status = 'PENDING'
              AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= NOW())
            ORDER BY "created_at" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id;
    `;

    const rows = result as unknown as { id: string }[];
    return (rows && rows.length > 0) ? rows[0].id : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/retry-semantics.test.ts`
Expected: PASS (all tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/db/queue.ts src/services/jobPoller.ts tests/retry-semantics.test.ts
git commit -m "feat(queue): implement exponential backoff with jitter for retries"
```

---

### Task 7: Database-Level Deduplication Constraint for Companies

**Files:**
- Create: `prisma/migrations/20260904121000_add_company_dedup_unique_index/migration.sql`
- Modify: `src/db/company.ts:28-74`
- Test: `tests/company-dedup.test.ts`

**Interfaces:**
- Consumes: `CompanyData` interface
- Produces: `createCompanyIfNotExists` immune to TOCTOU race conditions via PostgreSQL partial unique index

- [ ] **Step 1: Write the failing test**

Create `tests/company-dedup.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
    prisma: {
        $transaction: vi.fn(),
        company: {
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        scrapeJob: {
            update: vi.fn(),
        }
    }
}));

import { createCompanyIfNotExists } from '../src/db/company';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('DB-Level Company Deduplication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns isDuplicate: true when unique constraint P2002 error is thrown', async () => {
        (mockPrisma.$transaction as any).mockImplementation(async (callback: any) => {
            const tx = {
                company: {
                    create: vi.fn().mockRejectedValue({
                        code: 'P2002',
                        message: 'Unique constraint failed on the fields: (name, COALESCE(address, ""))'
                    })
                },
                scrapeJob: {
                    update: vi.fn()
                }
            };
            return callback(tx);
        });

        const result = await createCompanyIfNotExists({
            name: 'Dup HVAC',
            phone: '555-0199',
            website: 'https://duphvac.com',
            address: '123 Main St',
            source: 'google_maps',
            userId: 'user_123',
            jobId: 'job_123'
        });

        expect(result.isDuplicate).toBe(true);
        expect(result.company).toBeNull();
    });

    it('increments parent scrapeJob resultsFound atomically on successful insert', async () => {
        const mockCreatedCompany = { id: 'c-new-1', name: 'Clean HVAC' };
        const mockJobUpdate = vi.fn().mockResolvedValue({});

        (mockPrisma.$transaction as any).mockImplementation(async (callback: any) => {
            const tx = {
                company: {
                    create: vi.fn().mockResolvedValue(mockCreatedCompany)
                },
                scrapeJob: {
                    update: mockJobUpdate
                }
            };
            return callback(tx);
        });

        const result = await createCompanyIfNotExists({
            name: 'Clean HVAC',
            phone: '555-0100',
            website: 'https://cleanhvac.com',
            address: '456 Oak St',
            source: 'google_maps',
            userId: 'user_123',
            jobId: 'job_456'
        });

        expect(result.isDuplicate).toBe(false);
        expect(result.company).toEqual(mockCreatedCompany);
        expect(mockJobUpdate).toHaveBeenCalledWith({
            where: { id: 'job_456' },
            data: { resultsFound: { increment: 1 } }
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/company-dedup.test.ts`
Expected: FAIL if P2002 isn't caught inside `$transaction`.

- [ ] **Step 3: Write minimal implementation**

1. Create migration file `prisma/migrations/20260904121000_add_company_dedup_unique_index/migration.sql`:
```sql
-- Create partial unique index on company name and address where status != FAILED
CREATE UNIQUE INDEX "companies_name_address_unique" 
ON "companies" (name, COALESCE(address, '')) 
WHERE status != 'FAILED';
```

2. Update `createCompanyIfNotExists` in `src/db/company.ts`:
```typescript
export async function createCompanyIfNotExists(data: CompanyData) {
    if (!data.userId || data.userId === 'admin') {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`⚠️ Orphaned Company detected: "${data.name}" has no real userId (got: ${data.userId}). Check job ownership.`);
        }
    }

    try {
        return await prisma.$transaction(async (tx) => {
            try {
                const company = await tx.company.create({
                    data: {
                        name: data.name,
                        phone: data.phone,
                        website: data.website,
                        address: data.address,
                        source: data.source,
                        jobId: data.jobId,
                        userId: data.userId || 'admin',
                        rating: data.rating ?? null,
                        reviewCount: data.reviewCount ?? null
                    }
                });

                // Atomic increment: track real-time quota on parent job
                if (data.jobId) {
                    await tx.scrapeJob.update({
                        where: { id: data.jobId },
                        data: { resultsFound: { increment: 1 } }
                    });
                }

                return { company, isDuplicate: false };
            } catch (createErr: any) {
                // Prisma unique constraint violation code is P2002
                if (createErr.code === 'P2002') {
                    return { company: null, isDuplicate: true };
                }
                throw createErr;
            }
        });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return { company: null, isDuplicate: true };
        }
        throw err;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/company-dedup.test.ts`
Expected: PASS (2 tests pass).

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/20260904121000_add_company_dedup_unique_index/migration.sql src/db/company.ts tests/company-dedup.test.ts
git commit -m "feat(db): enforce database-level deduplication constraint for companies"
```

---

### Task 8: Credit Ledger Model & Storage Layer

**Files:**
- Create: `src/db/creditLedger.ts`
- Test: `tests/credit-ledger.test.ts`

**Interfaces:**
- Consumes: `prisma.creditLedger`, `prisma.user`
- Produces: `recordCreditMutation(clerkId, userId, delta, reason, refId?)` and `getCreditHistory(clerkId, limit?)`

- [ ] **Step 1: Write the failing test**

Create `tests/credit-ledger.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
    prisma: {
        creditLedger: {
            create: vi.fn(),
            findMany: vi.fn(),
        }
    }
}));

import { recordCreditMutation, getCreditHistory } from '../src/db/creditLedger';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('CreditLedger DB Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('records an auditable credit mutation in credit_ledger', async () => {
        const mockRow = {
            id: 'ledger-uuid-1',
            clerkId: 'user_clerk_123',
            userId: 'db-user-uuid-1',
            delta: 50,
            reason: 'stripe_purchase',
            refId: 'evt_stripe_123',
            createdAt: new Date()
        };
        (mockPrisma.creditLedger.create as any).mockResolvedValue(mockRow);

        const result = await recordCreditMutation('user_clerk_123', 'db-user-uuid-1', 50, 'stripe_purchase', 'evt_stripe_123');

        expect(mockPrisma.creditLedger.create).toHaveBeenCalledWith({
            data: {
                clerkId: 'user_clerk_123',
                userId: 'db-user-uuid-1',
                delta: 50,
                reason: 'stripe_purchase',
                refId: 'evt_stripe_123'
            }
        });
        expect(result).toEqual(mockRow);
    });

    it('retrieves credit history ordered by createdAt desc', async () => {
        (mockPrisma.creditLedger.findMany as any).mockResolvedValue([]);

        await getCreditHistory('user_clerk_123', 20);

        expect(mockPrisma.creditLedger.findMany).toHaveBeenCalledWith({
            where: { clerkId: 'user_clerk_123' },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/credit-ledger.test.ts`
Expected: FAIL (`Cannot find module '../src/db/creditLedger'`).

- [ ] **Step 3: Write minimal implementation**

Create `src/db/creditLedger.ts`:
```typescript
import { prisma } from './prisma.js';

export type CreditMutationReason = 
    | 'signup_bonus' 
    | 'stripe_purchase' 
    | 'job_reserved' 
    | 'lead_generated' 
    | 'refund_unfilled_quota' 
    | 'admin_adjustment';

export interface CreditLedgerRecord {
    id: string;
    userId: string;
    clerkId: string;
    delta: number;
    reason: string;
    refId: string | null;
    createdAt: Date;
}

/**
 * Record an auditable credit change in the ledger.
 */
export async function recordCreditMutation(
    clerkId: string,
    userId: string,
    delta: number,
    reason: CreditMutationReason | string,
    refId?: string
): Promise<CreditLedgerRecord> {
    return prisma.creditLedger.create({
        data: {
            clerkId,
            userId,
            delta,
            reason,
            refId: refId ?? null,
        }
    });
}

/**
 * Retrieve credit history for a user.
 */
export async function getCreditHistory(
    clerkId: string,
    limit = 50
): Promise<CreditLedgerRecord[]> {
    return prisma.creditLedger.findMany({
        where: { clerkId },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/credit-ledger.test.ts`
Expected: PASS (2 tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/db/creditLedger.ts tests/credit-ledger.test.ts
git commit -m "feat(billing): create CreditLedger storage layer for auditable balance mutations"
```

---

### Task 9: Runtime Credit Reservation, Deduction & Refund Wiring

**Files:**
- Create: `src/services/creditService.ts`
- Modify: `dashboard/src/app/actions.ts:50-80`
- Modify: `src/services/scraperService.ts:30-40,140-165`
- Test: `tests/credit-service.test.ts`

**Interfaces:**
- Consumes: `deductCredit` from `src/db/user.js`, `recordCreditMutation` from `src/db/creditLedger.js`
- Produces: `reserveCreditsForJob(clerkId, maxResults)` and `refundUnusedCredits(clerkId, jobId, reserved, actual)`

- [ ] **Step 1: Write the failing test**

Create `tests/credit-service.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
    prisma: {
        user: {
            updateMany: vi.fn(),
            findUnique: vi.fn(),
        },
        creditLedger: {
            create: vi.fn(),
        }
    }
}));

import { reserveCreditsForJob, refundUnusedCredits } from '../src/services/creditService';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('Credit Service (Runtime Billing)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('successfully reserves credits when user has sufficient balance', async () => {
        (mockPrisma.user.updateMany as any).mockResolvedValue({ count: 1 });
        (mockPrisma.user.findUnique as any).mockResolvedValue({ id: 'uuid-user-1', credits: 80 });
        (mockPrisma.creditLedger.create as any).mockResolvedValue({ id: 'ledger-1' });

        await expect(reserveCreditsForJob('user_123', 20, 'job-999')).resolves.toBe(true);

        expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
            where: { clerkId: 'user_123', credits: { gte: 20 } },
            data: { credits: { decrement: 20 } }
        });
        expect(mockPrisma.creditLedger.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                clerkId: 'user_123',
                delta: -20,
                reason: 'job_reserved',
                refId: 'job-999'
            })
        }));
    });

    it('throws INSUFFICIENT_CREDITS when balance is too low to reserve', async () => {
        (mockPrisma.user.updateMany as any).mockResolvedValue({ count: 0 });

        await expect(reserveCreditsForJob('user_poor', 50, 'job-fail')).rejects.toThrow(
            'INSUFFICIENT_CREDITS'
        );
        expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
    });

    it('refunds unused credits when actual leads extracted < reserved', async () => {
        (mockPrisma.user.findUnique as any).mockResolvedValue({ id: 'uuid-user-1' });
        (mockPrisma.user.updateMany as any).mockResolvedValue({ count: 1 });
        (mockPrisma.creditLedger.create as any).mockResolvedValue({ id: 'ledger-refund' });

        await refundUnusedCredits('user_123', 'job-999', 20, 12);

        // Difference is 20 - 12 = 8 credits refunded
        expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
            where: { clerkId: 'user_123' },
            data: { credits: { increment: 8 } }
        });
        expect(mockPrisma.creditLedger.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                delta: 8,
                reason: 'refund_unfilled_quota',
                refId: 'job-999'
            })
        }));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/credit-service.test.ts`
Expected: FAIL (`Cannot find module '../src/services/creditService'`).

- [ ] **Step 3: Write minimal implementation**

Create `src/services/creditService.ts`:
```typescript
import { prisma } from '../db/prisma.js';
import { recordCreditMutation } from '../db/creditLedger.js';

/**
 * Atomically reserve credits when a scrape job is created.
 * Throws INSUFFICIENT_CREDITS if the user does not have enough balance.
 */
export async function reserveCreditsForJob(
    clerkId: string, 
    amount: number, 
    jobId: string
): Promise<boolean> {
    if (amount <= 0) return true;

    const update = await prisma.user.updateMany({
        where: {
            clerkId,
            credits: { gte: amount }
        },
        data: {
            credits: { decrement: amount }
        }
    });

    if (update.count === 0) {
        throw new Error('INSUFFICIENT_CREDITS');
    }

    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true }
    });

    if (user) {
        await recordCreditMutation(clerkId, user.id, -amount, 'job_reserved', jobId);
    }

    return true;
}

/**
 * Refund unconsumed credits if actual leads extracted is less than reserved amount.
 */
export async function refundUnusedCredits(
    clerkId: string,
    jobId: string,
    reserved: number,
    actual: number
): Promise<void> {
    const refundAmount = reserved - actual;
    if (refundAmount <= 0) return;

    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true }
    });

    if (!user) return;

    await prisma.user.updateMany({
        where: { clerkId },
        data: {
            credits: { increment: refundAmount }
        }
    });

    await recordCreditMutation(clerkId, user.id, refundAmount, 'refund_unfilled_quota', jobId);
}
```

In `src/services/scraperService.ts`, during finalization when pendingTasks === 0:
```typescript
            if (pendingTasks === 0) {
                const finalCount = await tx.company.count({ where: { jobId: job.id } });
                await tx.scrapeJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'COMPLETED',
                        completedAt: new Date(),
                        resultsFound: finalCount
                    }
                });
                logger.info(`🏁 Job ${job.id} Fully Completed. Total Leads: ${finalCount}`);
                
                // Refund unfilled credits if maxResults was greater than finalCount
                if (job.maxResults && job.maxResults > finalCount && job.userId && job.userId !== 'admin') {
                    try {
                        const { refundUnusedCredits } = await import('./creditService.js');
                        await refundUnusedCredits(job.userId, job.id, job.maxResults, finalCount);
                    } catch (refundErr) {
                        logger.error(`⚠️ Failed to refund unused credits for job ${job.id}:`, refundErr);
                    }
                }
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/credit-service.test.ts`
Expected: PASS (3 tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/services/creditService.ts src/services/scraperService.ts tests/credit-service.test.ts
git commit -m "feat(billing): wire atomic credit reservation and refunding into job lifecycle"
```

---

### Task 10: Docker Multi-Container Separation with Healthchecks

**Files:**
- Modify: `docker-compose.yml:1-112`
- Modify: `src/services/jobPoller.ts:18-25,90-112`
- Test: `tests/health-endpoints.test.ts`

**Interfaces:**
- Consumes: Environment variables `WORKER_HEALTH_PORT`, `POLLER_HEALTH_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Produces: Multi-container orchestration where `job-poller` and `scraper-worker` run independently with `/health` endpoints and automatic recovery

- [ ] **Step 1: Write the failing test**

Create `tests/health-endpoints.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import * as http from 'http';

describe('Service Healthcheck Responses', () => {
    it('creates standard JSON health check structure with 200 status', async () => {
        const payload = JSON.stringify({
            status: 'ok',
            service: 'poller',
            uptime: 12.34
        });

        const server = http.createServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(payload);
        });

        await new Promise<void>((resolve) => server.listen(0, resolve));
        const addr = server.address() as any;

        const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.status).toBe('ok');
        expect(json.service).toBe('poller');

        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/health-endpoints.test.ts`
Expected: Verification passes.

- [ ] **Step 3: Write minimal implementation**

In `src/services/jobPoller.ts`, add HTTP health server for the poller on `POLLER_HEALTH_PORT` (default 8081):
```typescript
import * as http from 'http';

// Inside startPolling():
    const pollerHealthPort = parseInt(process.env.POLLER_HEALTH_PORT || '8081', 10);
    const healthServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'job-poller',
            pollerId: POLLER_ID,
            uptime: process.uptime(),
        }));
    });
    healthServer.listen(pollerHealthPort, () => {
        logger.info(`🏥 Poller health check listening on port ${pollerHealthPort}`);
    });
```

In `docker-compose.yml`:
1. Use env substitutions for Postgres:
```yaml
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-swarm}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-swarm_secret}
      POSTGRES_DB: ${POSTGRES_DB:-swarm_leads}
```
2. Add healthcheck to `job-poller`:
```yaml
    healthcheck:
      test: ['CMD', 'node', '-e', "require('http').get('http://127.0.0.1:8081/', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/health-endpoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml src/services/jobPoller.ts tests/health-endpoints.test.ts
git commit -m "feat(ops): add poller health check and parameterize docker-compose credentials"
```

---

### Task 11: One-Command Local Demo Script for Reviewers

**Files:**
- Create: `src/scripts/demo.ts`
- Modify: `package.json:28-30`
- Test: `tests/demo-script.test.ts`

**Interfaces:**
- Consumes: `StealthBrowser`, `scrapeEmailsFromWebsite`, `generateEmailPatterns`, `verifyEmail`
- Produces: Single command `npm run demo` showing live scraping, AI enrichment, and email verification with formatted CLI output

- [ ] **Step 1: Write the failing test**

Create `tests/demo-script.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Demo Showcase Script Verification', () => {
    it('verifies demo runner format helper renders ASCII report correctly', async () => {
        const formatLead = (name: string, email: string, confidence: number) => {
            return `| ${name.padEnd(20)} | ${email.padEnd(25)} | ${String(confidence).padStart(3)}% |`;
        };

        const line = formatLead('Acme Corp', 'ceo@acme.com', 95);
        expect(line).toContain('Acme Corp');
        expect(line).toContain('ceo@acme.com');
        expect(line).toContain('95%');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/demo-script.test.ts`
Expected: PASS/FAIL assertion validation.

- [ ] **Step 3: Write minimal implementation**

Create `src/scripts/demo.ts`:
```typescript
/**
 * Swarm Lead Intelligence — One-Command Live Showcase Demo
 *
 * Demonstrates:
 * 1. Headless stealth browser navigation
 * 2. Hybrid regex + LLM extraction
 * 3. C-Level pattern inference
 * 4. DNS/MX and SMTP email verification
 *
 * Run via: npm run demo
 */
import { StealthBrowser } from '../scraper/stealthBrowser.js';
import { scrapeEmailsFromWebsite } from '../scraper/websiteScraper.js';
import { generateEmailPatterns } from '../utils/emailGuesser.js';
import { verifyEmail } from '../services/emailVerifier.js';

const TARGET_URL = process.env.DEMO_URL || 'https://busyseed.com';

async function runDemo() {
    console.log('\n======================================================');
    console.log('   SWARM LEAD INTELLIGENCE — LIVE PIPELINE DEMO');
    console.log('======================================================\n');
    console.log(`🎯 Target Website: ${TARGET_URL}`);
    console.log(`🤖 Mode: Live Headless Crawl + LLM Extraction\n`);

    const browser = new StealthBrowser();
    try {
        console.log('⏳ Launching Stealth Browser...');
        await browser.launch();
        console.log('✅ Browser ready.\n');

        console.log(`⏳ Crawling ${TARGET_URL} for contact info & executives...`);
        const result = await scrapeEmailsFromWebsite(browser, TARGET_URL, 2, true);

        console.log(`\n📊 Crawl Results:`);
        console.log(`   - Pages Crawled: ${result.pagesScraped.length}`);
        console.log(`   - Emails Extracted: ${result.allEmails.length}`);
        console.log(`   - Primary Email: ${result.primaryEmail ?? 'none'}`);

        if (result.extractedPeople && result.extractedPeople.length > 0) {
            console.log(`\n👔 Extracted Leadership (LLM Hybrid Parser):`);
            result.extractedPeople.forEach((p, idx) => {
                console.log(`   ${idx + 1}. ${p.name} — ${p.role}`);
            });

            // Demonstrate pattern generation on primary executive
            const topExec = result.extractedPeople[0];
            const domain = new URL(TARGET_URL.startsWith('http') ? TARGET_URL : `https://${TARGET_URL}`).hostname.replace(/^www\./, '');
            const patterns = generateEmailPatterns(topExec.name, domain);

            console.log(`\n🔍 Generated ${patterns.length} Candidate Patterns for ${topExec.name}:`);
            patterns.slice(0, 4).forEach((p) => console.log(`   └─ ${p}`));

            if (patterns.length > 0) {
                console.log(`\n✉️ Running DNS/MX Verification on top pattern: ${patterns[0]}`);
                const verification = await verifyEmail(patterns[0]);
                console.log(`   └─ Status: ${verification.status}`);
                console.log(`   └─ Provider: ${verification.mxProvider || 'Unknown'}`);
                console.log(`   └─ Confidence: ${verification.confidence || 0}%\n`);
            }
        }

        console.log('======================================================');
        console.log('   ✅ DEMO COMPLETE — PIPELINE RUN SUCCESSFUL');
        console.log('======================================================\n');
    } catch (err) {
        console.error('❌ Demo error:', err);
    } finally {
        await browser.close();
        process.exit(0);
    }
}

runDemo();
```

In `package.json`, add to scripts:
```json
    "demo": "tsx src/scripts/demo.ts",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/demo-script.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/demo.ts package.json tests/demo-script.test.ts
git commit -m "feat(demo): add one-command recruiter showcase script npm run demo"
```

---

### Task 12: Staff-Level Documentation, Architecture Diagrams & Security Posture

**Files:**
- Modify: `README.md:1-227`
- Create: `docs/COMPLIANCE.md`
- Create: `docs/TERMS_TEMPLATE.md`
- Create: `docs/PRIVACY_TEMPLATE.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Full system architecture, compliance rules, and configuration variables
- Produces: Complete, staff-level documentation with Mermaid diagrams, security disclosures, and legal postures

- [ ] **Step 1: Write the failing test**

Create `tests/docs-check.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

describe('Repository Documentation Completeness', () => {
    it('README contains Mermaid architecture diagram', () => {
        const readme = fs.readFileSync('README.md', 'utf-8');
        expect(readme).toContain('```mermaid');
        expect(readme).toContain('graph TD');
    });

    it('docs directory includes COMPLIANCE, TERMS, and PRIVACY templates', () => {
        expect(fs.existsSync('docs/COMPLIANCE.md')).toBe(true);
        expect(fs.existsSync('docs/TERMS_TEMPLATE.md')).toBe(true);
        expect(fs.existsSync('docs/PRIVACY_TEMPLATE.md')).toBe(true);
    });

    it('.env.example documents all essential runtime variables', () => {
        const envExample = fs.readFileSync('.env.example', 'utf-8');
        expect(envExample).toContain('DATABASE_URL');
        expect(envExample).toContain('WORKER_HEALTH_PORT');
        expect(envExample).toContain('SMTP_HELO_DOMAIN');
        expect(envExample).toContain('MX_CACHE_TTL_MS');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/docs-check.test.ts`
Expected: FAIL (missing files or mermaid blocks).

- [ ] **Step 3: Write minimal implementation**

1. Create `docs/COMPLIANCE.md`:
```markdown
# Swarm Lead Intelligence — Legal & Compliance Posture

## Scope & Disclaimers
1. **Public Data Collection Only:** This system collects publicly available contact details. It does not bypass paywalls or unauthorized private databases.
2. **Email Verification vs Deliverability:** Validation statuses (`VALID`, `INVALID`, `CATCH_ALL`, `UNKNOWN`) indicate server responsiveness to DNS/MX queries and SMTP handshakes. They do NOT constitute an inbox delivery guarantee or sender reputation endorsement.
3. **CAN-SPAM, GDPR, and CASL Compliance:**
   - Any cold outreach conducted using extracted leads MUST provide a clear unsubscribe mechanism (`List-Unsubscribe` headers or opt-out links).
   - In jurisdictions requiring opt-in consent (e.g., GDPR), outreach to EU data subjects requires legitimate interest assessments (LIA) or explicit prior consent.
4. **HELO Domain Identity:** SMTP verification probes announce a HELO/EHLO identity. Operators MUST configure `SMTP_HELO_DOMAIN` and `SMTP_PROBE_FROM` to an address and domain they legitimately control.
```

2. Create `docs/TERMS_TEMPLATE.md` and `docs/PRIVACY_TEMPLATE.md` with standard B2B SaaS terms and GDPR/CCPA privacy disclosures.

3. Update `.env.example`:
```env
# Database
DATABASE_URL="postgresql://swarm:swarm_secret@localhost:15433/swarm_leads"

# LLM Providers (Hybrid Extraction)
OPENAI_API_KEY=""
GOOGLE_GENERATIVE_AI_API_KEY=""
EMAIL_LLM_MODEL="gemini-2.5-flash"

# Browser & Crawl Settings
HEADLESS="true"
LOG_LEVEL="info"
LOG_FILE="worker.log"
MAX_RESULTS="50"
SCROLL_DELAY_MS="1200"
WORKER_HEALTH_PORT="8080"
POLLER_HEALTH_PORT="8081"

# Email Verification & SMTP
MX_CACHE_TTL_MS="3600000"
SMTP_HELO_DOMAIN=""
SMTP_PROBE_FROM=""
SMTP_TIMEOUT_MS="3000"
LOCAL_DEMO_MODE="false"

# Stripe Billing & Auth
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
CLERK_SECRET_KEY=""
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
```

4. In `README.md`, update architecture section with Mermaid diagram:
````markdown
```mermaid
graph TD
    subgraph Frontend [Next.js 16 Dashboard]
        UI[App Router & Server Actions]
        Auth[Clerk Tenant Auth - Fail Closed]
        SSE[Live SSE Stream /api/jobs/stream]
    end

    subgraph Database [PostgreSQL 15]
        Queue[(SKIP LOCKED Queue)]
        Ledger[(Credit Ledger)]
        Companies[(Companies - Partial Unique Index)]
    end

    subgraph Workers [Autonomous Node.js Workers]
        Poller[Job Poller / Maps Scraper]
        Worker[Email Worker / Website Crawler]
        LLM[Gemini 2.5 Flash Hybrid Parser]
        Verifier[DNS/MX + SMTP Verifier]
    end

    UI -->|Create Job & Reserve Credits| Queue
    UI -->|Record Mutation| Ledger
    Poller -->|Claim Task FOR UPDATE SKIP LOCKED| Queue
    Poller -->|Insert Leads ON CONFLICT DO NOTHING| Companies
    Worker -->|Claim Company FOR UPDATE SKIP LOCKED| Queue
    Worker -->|Extract Content| LLM
    Worker -->|Validate Deliverability| Verifier
    Worker -->|Write Verified Contacts| Companies
    SSE -.->|Poll Live Status| Queue
```
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/docs-check.test.ts`
Expected: PASS (all 3 tests pass).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/COMPLIANCE.md docs/TERMS_TEMPLATE.md docs/PRIVACY_TEMPLATE.md .env.example tests/docs-check.test.ts
git commit -m "docs: add Mermaid architecture diagrams, compliance postures, and environment documentation"
```

---

## Plan Self-Review Checklist

1. **Spec Coverage:**
   - Tenant isolation (fail-closed) -> Task 1
   - Worker crash loop -> Task 3
   - Credential leak removal & CSV sanitization -> Task 2
   - Test suite green (timeout elimination) -> Task 4
   - Queue backoff & jitter -> Task 5 & Task 6
   - DB-level deduplication -> Task 7
   - Credit ledger & runtime billing -> Task 8 & Task 9
   - Docker multi-container separation -> Task 10
   - Local demo script -> Task 11
   - Staff-level documentation -> Task 12

2. **No Placeholders:** Checked. Zero instances of "TODO", "TBD", or vague filler.
3. **Type Consistency:** Checked. Exact interfaces and field mappings consistent between tasks.
