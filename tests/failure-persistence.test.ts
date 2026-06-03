import { describe, it, expect, vi, beforeEach } from 'vitest';

// prisma.ts is the shared singleton re-exported through company.ts and used by
// both queue.ts (failJobOrRetry) and scraperService.ts (processJob).
vi.mock('../src/db/prisma', () => ({
    prisma: {
        company: {
            update: vi.fn(),
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
        $transaction: vi.fn(),
        $queryRaw: vi.fn(),
    },
}));

// Force processJob into its failure path by rejecting during link collection.
vi.mock('../src/scraper/googleMapsScraper', () => ({
    GoogleMapsScraper: class {
        init() { return Promise.resolve(); }
        search() { return Promise.resolve(); }
        collectResultLinks() { return Promise.reject(new Error('Simulated failure')); }
        extractDetailsOnPage() { return Promise.resolve({}); }
        close() { return Promise.resolve(); }
    }
}));

vi.mock('../src/scraper/stealthBrowser', () => ({
    StealthBrowser: class {
        launch() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
        createPage() { return Promise.resolve({}); }
        closePage() { return Promise.resolve(); }
    }
}));

import { failJobOrRetry } from '../src/db/queue';
import { processJob } from '../src/services/scraperService';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('Failure persistence (D)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('company hard-fail (failJobOrRetry)', () => {
        it('persists a failure reason when a company is marked FAILED', async () => {
            (mockPrisma.company.update as any).mockResolvedValue({});

            await failJobOrRetry('company-1', 3, 'SMTP timeout exploded');

            const arg = (mockPrisma.company.update as any).mock.calls[0][0];
            expect(arg.data.status).toBe('FAILED');
            // Desired: the error message is stored, not discarded.
            expect(arg.data).toEqual(
                expect.objectContaining({ failureReason: expect.stringContaining('SMTP timeout') })
            );
        });

        it('persists a failure timestamp when a company is marked FAILED', async () => {
            (mockPrisma.company.update as any).mockResolvedValue({});

            await failJobOrRetry('company-1', 3, 'boom');

            const arg = (mockPrisma.company.update as any).mock.calls[0][0];
            expect(arg.data.failedAt).toBeInstanceOf(Date);
        });

        it('does not silently discard the error message', async () => {
            (mockPrisma.company.update as any).mockResolvedValue({});

            await failJobOrRetry('company-1', 3, 'unique-error-marker-123');

            const arg = (mockPrisma.company.update as any).mock.calls[0][0];
            expect(JSON.stringify(arg.data)).toContain('unique-error-marker-123');
        });
    });

    describe('task hard-fail (processJob catch path)', () => {
        it('persists a failure reason + timestamp when a task is marked FAILED', async () => {
            // retries === maxRetries -> hard-fail branch (status FAILED).
            (mockPrisma.scrapeTask.findUnique as any).mockResolvedValue({
                id: 'task-1',
                jobId: 'job-1',
                query: 'test query',
                retries: 3,
                maxRetries: 3,
                scrapeJob: { id: 'job-1', userId: 'user-1' },
            });

            const result = await processJob('task-1', true);

            expect(result.success).toBe(false);
            // Find the FAILED-status update call (the catch path writes status: 'FAILED').
            const failedCall = (mockPrisma.scrapeTask.update as any).mock.calls
                .map((c: any[]) => c[0])
                .find((a: any) => a?.data?.status === 'FAILED');
            expect(failedCall).toBeTruthy();
            expect(failedCall.data).toEqual(
                expect.objectContaining({
                    failureReason: expect.stringContaining('Simulated failure'),
                    failedAt: expect.any(Date),
                })
            );
        });
    });
});
