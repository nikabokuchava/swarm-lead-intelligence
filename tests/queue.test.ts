import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma instance used by queue.ts (it imports from company.ts which imports from prisma.ts)
vi.mock('../src/db/prisma', () => ({
    prisma: {
        company: {
            updateMany: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        scrapeTask: {
            count: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
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



import { resetStalledJobs, completeJob, failJobOrRetry } from '../src/db/queue';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('Queue System', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('resetStalledJobs', () => {
        it('should reset jobs that have been processing longer than timeout', async () => {
            mockPrisma.company.updateMany.mockResolvedValue({ count: 3 });

            const result = await resetStalledJobs(10);

            expect(mockPrisma.company.updateMany).toHaveBeenCalledWith({
                where: {
                    status: 'PROCESSING',
                    lockedAt: {
                        lt: expect.any(Date),
                    },
                },
                data: {
                    status: 'PENDING',
                    workerId: null,
                    lockedAt: null,
                },
            });
            expect(result).toBe(3);
        });

        it('should return 0 when no stalled jobs exist', async () => {
            mockPrisma.company.updateMany.mockResolvedValue({ count: 0 });

            const result = await resetStalledJobs(10);
            expect(result).toBe(0);
        });

        it('should use cutoff time based on provided timeout minutes', async () => {
            mockPrisma.company.updateMany.mockResolvedValue({ count: 0 });

            const beforeCall = Date.now();
            await resetStalledJobs(30);
            const afterCall = Date.now();

            const calledWith = mockPrisma.company.updateMany.mock.calls[0][0] as any;
            const cutoffDate = calledWith.where.lockedAt.lt as Date;
            const cutoffTime = cutoffDate.getTime();

            // Cutoff should be ~30 minutes before now
            const expectedCutoff = beforeCall - 30 * 60 * 1000;
            expect(cutoffTime).toBeGreaterThanOrEqual(expectedCutoff - 100);
            expect(cutoffTime).toBeLessThanOrEqual(afterCall - 30 * 60 * 1000 + 100);
        });
    });

    describe('completeJob', () => {
        it('should mark a job as COMPLETED when success is true', async () => {
            mockPrisma.company.update.mockResolvedValue({} as any);

            await completeJob('company-1', true);

            expect(mockPrisma.company.update).toHaveBeenCalledWith({
                where: { id: 'company-1' },
                data: { status: 'COMPLETED' },
            });
        });

        it('should mark a job as FAILED when success is false', async () => {
            mockPrisma.company.update.mockResolvedValue({} as any);

            await completeJob('company-1', false);

            expect(mockPrisma.company.update).toHaveBeenCalledWith({
                where: { id: 'company-1' },
                data: { status: 'FAILED' },
            });
        });
    });

    describe('failJobOrRetry', () => {
        it('should release job back to queue when retries < MAX_RETRIES', async () => {
            mockPrisma.company.update.mockResolvedValue({} as any);

            await failJobOrRetry('company-1', 1);

            expect(mockPrisma.company.update).toHaveBeenCalledWith({
                where: { id: 'company-1' },
                data: {
                    status: 'PENDING',
                    workerId: null,
                    lockedAt: null,
                },
            });
        });

        it('should permanently fail when retries >= MAX_RETRIES (3)', async () => {
            mockPrisma.company.update.mockResolvedValue({} as any);

            await failJobOrRetry('company-1', 3);

            expect(mockPrisma.company.update).toHaveBeenCalledWith({
                where: { id: 'company-1' },
                data: { status: 'FAILED' },
            });
        });

        it('should fail at exactly MAX_RETRIES boundary', async () => {
            mockPrisma.company.update.mockResolvedValue({} as any);

            // At 2 retries → retry
            await failJobOrRetry('company-x', 2);
            expect(mockPrisma.company.update).toHaveBeenCalledWith({
                where: { id: 'company-x' },
                data: {
                    status: 'PENDING',
                    workerId: null,
                    lockedAt: null,
                },
            });

            vi.clearAllMocks();

            // At 3 retries → hard fail
            await failJobOrRetry('company-x', 3);
            expect(mockPrisma.company.update).toHaveBeenCalledWith({
                where: { id: 'company-x' },
                data: { status: 'FAILED' },
            });
        });

        it('should handle retries well above MAX_RETRIES', async () => {
            mockPrisma.company.update.mockResolvedValue({} as any);

            await failJobOrRetry('company-1', 100);

            expect(mockPrisma.company.update).toHaveBeenCalledWith({
                where: { id: 'company-1' },
                data: { status: 'FAILED' },
            });
        });
    });

    describe('Job Finalization (Transaction) in processJob', () => {
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

            // Use dynamic import so earlier isolated tests aren't affected by module load side-effects
            const { processJob } = await import('../src/services/scraperService');
            await processJob('task-1', true);

            (expect(mockTx.scrapeJob.update) as any).toHaveBeenCalledWith({
                where: { id: 'job-1' },
                data: expect.objectContaining({
                    status: 'COMPLETED',
                    resultsFound: 42
                })
            });
            (expect(mockTx.company.count) as any).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
        });
    });
});
