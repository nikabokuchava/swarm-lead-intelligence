import { describe, it, expect, vi, beforeEach } from 'vitest';

// queue.ts imports prisma from company.ts, which re-exports it from prisma.ts.
// Mocking prisma.ts therefore substitutes the instance queue.ts uses.
vi.mock('../src/db/prisma', () => ({
    prisma: {
        company: {
            update: vi.fn(),
            updateMany: vi.fn(),
            count: vi.fn(),
        },
        scrapeTask: {
            update: vi.fn(),
            findUnique: vi.fn(),
            count: vi.fn(),
        },
        scrapeJob: {
            update: vi.fn(),
        },
        $queryRaw: vi.fn(),
        $transaction: vi.fn(),
    },
}));

vi.mock('../src/scraper/googleMapsScraper', () => ({
    GoogleMapsScraper: class {
        init() { return Promise.resolve(); }
        search() { return Promise.resolve(); }
        collectResultLinks() { return Promise.resolve([]); }
        extractDetails() { return Promise.resolve({}); }
        close() { return Promise.resolve(); }
    }
}));

vi.mock('../src/scraper/stealthBrowser', () => ({
    StealthBrowser: class {
        launch() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
    }
}));

import { getNextPendingLead, failJobOrRetry, computeBackoffDelayMs } from '../src/db/queue';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('Retry counter semantics (E)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('claim / redelivery does not burn retries', () => {
        it('getNextPendingLead claim SQL never touches the retries column', async () => {
            (mockPrisma.$queryRaw as any).mockResolvedValue([]);

            await getNextPendingLead('worker-1');

            // $queryRaw is a tagged template: first arg is the TemplateStringsArray.
            const call = (mockPrisma.$queryRaw as any).mock.calls[0];
            expect(call).toBeTruthy();
            const sql = (call[0] as string[]).join(' ');
            // Claiming a job must NOT increment/modify retries — only failure transitions may.
            expect(sql.toLowerCase()).not.toContain('retries');
        });

        it('claiming a lead does not issue a company.update retry increment', async () => {
            (mockPrisma.$queryRaw as any).mockResolvedValue([]);

            await getNextPendingLead('worker-1');

            expect(mockPrisma.company.update).not.toHaveBeenCalled();
        });
    });

    describe('retries increment only inside the failure/retry transition', () => {
        it('failJobOrRetry under cap increments retries atomically and re-queues', async () => {
            (mockPrisma.company.update as any).mockResolvedValue({});

            await failJobOrRetry('company-1', 1, 'boom');

            expect(mockPrisma.company.update).toHaveBeenCalledWith({
                where: { id: 'company-1' },
                data: expect.objectContaining({
                    status: 'PENDING',
                    workerId: null,
                    lockedAt: null,
                    // Atomic increment (Prisma) — NOT a precomputed number / read-modify-write.
                    retries: { increment: 1 },
                }),
            });
        });
    });

    describe('retry cap is respected', () => {
        it('failJobOrRetry at the cap hard-fails and does NOT increment retries', async () => {
            (mockPrisma.company.update as any).mockResolvedValue({});

            await failJobOrRetry('company-2', 3, 'boom');

            const arg = (mockPrisma.company.update as any).mock.calls[0][0];
            expect(arg.where).toEqual({ id: 'company-2' });
            expect(arg.data.status).toBe('FAILED');
            // Must not bump retries once the cap is hit.
            expect(arg.data.retries).toBeUndefined();
        });
    });

    describe('backoff and jitter on retry', () => {
        it('computeBackoffDelayMs computes exponential delay with jitter and caps at 300s', () => {
            // retry 0: 5000 * 1 + [0..1000) => [5000, 6000)
            const delay0 = computeBackoffDelayMs(0);
            expect(delay0).toBeGreaterThanOrEqual(5000);
            expect(delay0).toBeLessThan(6000);

            // retry 1: 5000 * 2 + [0..1000) => [10000, 11000)
            const delay1 = computeBackoffDelayMs(1);
            expect(delay1).toBeGreaterThanOrEqual(10000);
            expect(delay1).toBeLessThan(11000);

            // retry 2: 5000 * 4 + [0..1000) => [20000, 21000)
            const delay2 = computeBackoffDelayMs(2);
            expect(delay2).toBeGreaterThanOrEqual(20000);
            expect(delay2).toBeLessThan(21000);

            // retry 10: 5000 * 1024 + jitter => capped at 300_000
            const delay10 = computeBackoffDelayMs(10);
            expect(delay10).toBe(300_000);
        });

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

        it('failJobOrRetry respects explicit delayMs override when provided', async () => {
            (mockPrisma.company.update as any).mockResolvedValue({});
            const before = Date.now();

            await failJobOrRetry('company-backoff-2', 0, 'Rate limit error', 60_000);

            const call = (mockPrisma.company.update as any).mock.calls[0][0];
            expect(call.where).toEqual({ id: 'company-backoff-2' });
            expect(call.data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
            expect(call.data.nextAttemptAt.getTime()).toBeLessThanOrEqual(before + 61_000);
        });

        it('getNextPendingLead claim SQL filters on next_attempt_at <= NOW()', async () => {
            (mockPrisma.$queryRaw as any).mockResolvedValue([]);

            await getNextPendingLead('worker-backoff');

            const call = (mockPrisma.$queryRaw as any).mock.calls[0];
            const sql = (call[0] as string[]).join(' ').toLowerCase();
            expect(sql).toContain('next_attempt_at');
        });
    });
});
