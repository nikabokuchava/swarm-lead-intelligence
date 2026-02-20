import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma instance used by queue.ts (it imports from company.ts which imports from prisma.ts)
vi.mock('../src/db/prisma', () => ({
    prisma: {
        company: {
            updateMany: vi.fn(),
            update: vi.fn(),
        },
        $queryRaw: vi.fn(),
    },
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
});
