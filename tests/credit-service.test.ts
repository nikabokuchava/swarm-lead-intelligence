import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => {
    const mockPrismaObj: any = {
        $transaction: vi.fn(async (cb: any) => {
            if (typeof cb === 'function') {
                return cb(mockPrismaObj);
            }
            return cb;
        }),
        user: {
            updateMany: vi.fn(),
            findUnique: vi.fn(),
        },
        creditLedger: {
            create: vi.fn(),
            findFirst: vi.fn(),
        }
    };
    return { prisma: mockPrismaObj };
});

import { reserveCreditsForJob, refundUnusedCredits } from '../src/services/creditService';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('Credit Service (Runtime Billing)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('reserveCreditsForJob', () => {
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

        it('short-circuits reservation when clerkId is admin', async () => {
            const result = await reserveCreditsForJob('admin', 50, 'job-admin');
            expect(result).toBe(true);
            expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
            expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
        });

        it('does not reserve credits when amount <= 0', async () => {
            const result = await reserveCreditsForJob('user_123', 0, 'job-zero');
            expect(result).toBe(true);
            expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
            expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
        });

        it('uses provided txClient if passed', async () => {
            const mockTx = {
                user: {
                    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                    findUnique: vi.fn().mockResolvedValue({ id: 'tx-user-1' }),
                },
                creditLedger: {
                    create: vi.fn().mockResolvedValue({ id: 'tx-ledger-1' }),
                }
            };

            await reserveCreditsForJob('user_tx', 10, 'job-tx', mockTx);

            expect(mockTx.user.updateMany).toHaveBeenCalled();
            expect(mockTx.creditLedger.create).toHaveBeenCalled();
            expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        });
    });

    describe('refundUnusedCredits', () => {
        it('refunds unused credits when actual leads extracted < reserved and reservation exists', async () => {
            (mockPrisma.creditLedger.findFirst as any).mockImplementation(async ({ where }: any) => {
                if (where.reason === 'refund_unfilled_quota') return null;
                if (where.reason === 'job_reserved') return { id: 'res-1', delta: -20, reason: 'job_reserved', refId: 'job-999' };
                return null;
            });
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

        it('is idempotent: does not refund if refund_unfilled_quota already recorded', async () => {
            (mockPrisma.creditLedger.findFirst as any).mockResolvedValueOnce({
                id: 'existing-refund-1',
                reason: 'refund_unfilled_quota',
                refId: 'job-999'
            });

            await refundUnusedCredits('user_123', 'job-999', 20, 10);

            expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
            expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
        });

        it('prevents exploit: does not refund if no job_reserved record exists', async () => {
            (mockPrisma.creditLedger.findFirst as any).mockImplementation(async ({ where }: any) => {
                if (where.reason === 'refund_unfilled_quota') return null;
                if (where.reason === 'job_reserved') return null; // No reservation!
                return null;
            });

            await refundUnusedCredits('user_attacker', 'fake-job-id', 100, 0);

            expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
            expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
        });

        it('caps refund amount to originally reserved amount', async () => {
            (mockPrisma.creditLedger.findFirst as any).mockImplementation(async ({ where }: any) => {
                if (where.reason === 'refund_unfilled_quota') return null;
                // Only 10 credits were reserved
                if (where.reason === 'job_reserved') return { id: 'res-1', delta: -10, reason: 'job_reserved', refId: 'job-cap' };
                return null;
            });
            (mockPrisma.user.findUnique as any).mockResolvedValue({ id: 'uuid-user-cap' });
            (mockPrisma.user.updateMany as any).mockResolvedValue({ count: 1 });
            (mockPrisma.creditLedger.create as any).mockResolvedValue({ id: 'ledger-cap' });

            // Caller claims 50 reserved, 0 actual (claims 50 refund), but only 10 was in ledger
            await refundUnusedCredits('user_123', 'job-cap', 50, 0);

            // Refund must be capped at 10
            expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
                where: { clerkId: 'user_123' },
                data: { credits: { increment: 10 } }
            });
            expect(mockPrisma.creditLedger.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    delta: 10,
                    reason: 'refund_unfilled_quota',
                    refId: 'job-cap'
                })
            }));
        });

        it('short-circuits refund when clerkId is admin', async () => {
            await refundUnusedCredits('admin', 'job-admin', 50, 10);
            expect(mockPrisma.creditLedger.findFirst).not.toHaveBeenCalled();
            expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
        });

        it('does not refund credits when actual leads extracted >= reserved', async () => {
            await refundUnusedCredits('user_123', 'job-999', 20, 20);
            await refundUnusedCredits('user_123', 'job-999', 20, 25);

            expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
            expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
        });

        it('does not refund credits if user is not found in database', async () => {
            (mockPrisma.creditLedger.findFirst as any).mockImplementation(async ({ where }: any) => {
                if (where.reason === 'refund_unfilled_quota') return null;
                if (where.reason === 'job_reserved') return { id: 'res-1', delta: -20, reason: 'job_reserved', refId: 'job-999' };
                return null;
            });
            (mockPrisma.user.findUnique as any).mockResolvedValue(null);

            await refundUnusedCredits('user_unknown', 'job-999', 20, 10);

            expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
            expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
        });
    });
});
