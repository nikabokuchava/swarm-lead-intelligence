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

    it('does not reserve credits when amount <= 0', async () => {
        const result = await reserveCreditsForJob('user_123', 0, 'job-zero');
        expect(result).toBe(true);
        expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
    });

    it('does not refund credits when actual leads extracted >= reserved', async () => {
        await refundUnusedCredits('user_123', 'job-999', 20, 20);
        await refundUnusedCredits('user_123', 'job-999', 20, 25);

        expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
    });

    it('does not refund credits if user is not found in database', async () => {
        (mockPrisma.user.findUnique as any).mockResolvedValue(null);

        await refundUnusedCredits('user_unknown', 'job-999', 20, 10);

        expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
    });
});
