import { prisma } from '../db/prisma.js';
import type { PrismaClient } from '@prisma/client';

type PrismaTransactionClient = Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Atomically reserve credits when a scrape job is created.
 * Throws INSUFFICIENT_CREDITS if the user does not have enough balance.
 */
export async function reserveCreditsForJob(
    clerkId: string, 
    amount: number, 
    jobId: string,
    txClient?: PrismaTransactionClient
): Promise<boolean> {
    // Admin user guard & non-positive amounts do not require credit reservation
    if (clerkId === 'admin' || amount <= 0) return true;

    const executeReservation = async (tx: PrismaTransactionClient) => {
        const update = await tx.user.updateMany({
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

        const user = await tx.user.findUnique({
            where: { clerkId },
            select: { id: true }
        });

        if (user) {
            await tx.creditLedger.create({
                data: {
                    clerkId,
                    userId: user.id,
                    delta: -amount,
                    reason: 'job_reserved',
                    refId: jobId
                }
            });
        }

        return true;
    };

    if (txClient) {
        return executeReservation(txClient);
    }

    if ('$transaction' in prisma && typeof prisma.$transaction === 'function') {
        return prisma.$transaction(executeReservation);
    }

    return executeReservation(prisma);
}

/**
 * Refund unconsumed credits if actual leads extracted is less than reserved amount.
 * Verifies that credits were actually reserved for this jobId and ensures idempotency.
 */
export async function refundUnusedCredits(
    clerkId: string,
    jobId: string,
    reserved: number,
    actual: number,
    txClient?: PrismaTransactionClient
): Promise<void> {
    if (clerkId === 'admin') return;

    let refundAmount = reserved - actual;
    if (refundAmount <= 0) return;

    const executeRefund = async (tx: PrismaTransactionClient) => {
        // 1. Refund Idempotency: check if already refunded
        const existingRefund = await tx.creditLedger.findFirst({
            where: {
                refId: jobId,
                reason: 'refund_unfilled_quota'
            }
        });
        if (existingRefund) return;

        // 2. Prevent Infinite Credit Minting / Exploit: check that reservation exists
        const reservationRecord = await tx.creditLedger.findFirst({
            where: {
                refId: jobId,
                reason: 'job_reserved'
            }
        });
        if (!reservationRecord) return;

        // Ensure refund amount does not exceed what was actually reserved
        const maxRefundable = Math.abs(reservationRecord.delta);
        if (refundAmount > maxRefundable) {
            refundAmount = maxRefundable;
        }
        if (refundAmount <= 0) return;

        const user = await tx.user.findUnique({
            where: { clerkId },
            select: { id: true }
        });

        if (!user) return;

        await tx.user.updateMany({
            where: { clerkId },
            data: {
                credits: { increment: refundAmount }
            }
        });

        await tx.creditLedger.create({
            data: {
                clerkId,
                userId: user.id,
                delta: refundAmount,
                reason: 'refund_unfilled_quota',
                refId: jobId
            }
        });
    };

    if (txClient) {
        return executeRefund(txClient);
    }

    if ('$transaction' in prisma && typeof prisma.$transaction === 'function') {
        return prisma.$transaction(executeRefund);
    }

    return executeRefund(prisma);
}
