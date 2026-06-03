import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock the Server Action's collaborators (hoisted before import) ---
vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(async () => ({ userId: 'user_1' })),
    currentUser: vi.fn(async () => ({
        emailAddresses: [{ emailAddress: 'a@b.com' }],
    })),
}));

vi.mock('@/lib/db', () => ({
    prisma: {
        scrapeJob: {
            create: vi.fn(),
            count: vi.fn(),
        },
    },
}));

vi.mock('@/lib/user', () => ({
    getOrCreateUser: vi.fn(async () => ({ clerkId: 'user_1', credits: 0 })),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

import { createScrapeJob } from '@/app/actions';
import { prisma } from '@/lib/db';

const mockPrisma = vi.mocked(prisma);

// Hardening caps enforced by the server action (see dashboard/src/app/actions.ts).
const MAX_RESULTS_CAP = 500;
const MAX_TASKS_CAP = 100;
const JOB_RATE_LIMIT_PER_MIN = 20;

function makeFormData(fields: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
}

/** Return the `data` object passed to the most recent scrapeJob.create() call. */
function lastCreateData(): any {
    const calls = (mockPrisma.scrapeJob.create as any).mock.calls;
    return calls[calls.length - 1]?.[0]?.data;
}

describe('createScrapeJob hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (mockPrisma.scrapeJob.create as any).mockResolvedValue({ id: 'job-1' });
        (mockPrisma.scrapeJob.count as any).mockResolvedValue(0);
    });

    describe('A — input caps', () => {
        it('clamps an excessive maxResults to the server cap (not the client UI limit)', async () => {
            await createScrapeJob(makeFormData({ query: 'plumbers', maxResults: '999999' }));
            expect(lastCreateData().maxResults).toBeLessThanOrEqual(MAX_RESULTS_CAP);
        });

        it('never persists a negative maxResults', async () => {
            // A negative maxResults must be coerced to a safe minimum (>= 1), not stored as-is.
            await createScrapeJob(makeFormData({ query: 'plumbers', maxResults: '-5' }));
            expect(lastCreateData().maxResults).toBeGreaterThanOrEqual(1);
        });

        it('caps task fan-out from a huge zip-code list', async () => {
            const zips = Array.from({ length: 5000 }, (_, i) =>
                String(10000 + i)
            ).join(',');
            await createScrapeJob(makeFormData({ query: 'plumbers', zipCodes: zips }));
            const tasks = lastCreateData().tasks.create as unknown[];
            expect(tasks.length).toBeLessThanOrEqual(MAX_TASKS_CAP);
        });
    });

    describe('B — entitlement (safety property only)', () => {
        it('ignores a client-provided isPremium=on and stores false', async () => {
            await createScrapeJob(
                makeFormData({ query: 'plumbers', isPremium: 'on' })
            );
            expect(lastCreateData().isPremium).toBe(false);
        });

        it('a free/unverified user cannot enable the paid C-Level path', async () => {
            // With no trusted entitlement source, the safe default must keep premium off,
            // so the worker's C-Level inference branch can never trigger for this job.
            await createScrapeJob(
                makeFormData({ query: 'plumbers', isPremium: 'on' })
            );
            expect(lastCreateData().isPremium).toBe(false);
        });
    });

    describe('C — abuse / cost guard at job creation', () => {
        it('rate-limits job creation after the per-minute threshold', async () => {
            // Create up to the limit, then expect the next call to be rejected/blocked.
            for (let i = 0; i < JOB_RATE_LIMIT_PER_MIN; i++) {
                await createScrapeJob(makeFormData({ query: `q${i}` })).catch(() => {});
            }
            const createCountBefore = (mockPrisma.scrapeJob.create as any).mock.calls.length;

            await expect(
                createScrapeJob(makeFormData({ query: 'over-limit' }))
            ).rejects.toThrow();

            // The blocked call must not have reached the database.
            expect((mockPrisma.scrapeJob.create as any).mock.calls.length).toBe(
                createCountBefore
            );
            // createScrapeJob enforces this via checkRateLimit(`job-create:${userId}`,
            // MAX_JOBS_PER_MIN) before any DB write (dashboard/src/app/actions.ts).
        });
    });
});
