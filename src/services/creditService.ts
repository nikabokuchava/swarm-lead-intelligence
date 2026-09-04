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
