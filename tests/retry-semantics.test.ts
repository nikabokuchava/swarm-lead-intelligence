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

import { getNextPendingLead, failJobOrRetry } from '../src/db/queue';
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

    // Backoff/jitter is NOT supported: no `nextAttemptAt`/scheduler field exists in the
    // schema and failed records are reset to PENDING immediately. Captured as a pending
    // test per Vitest convention; document the gap rather than refactor this pass.
    it.todo('applies a backoff/jitter delay between retries (no scheduling field exists yet)');
});
