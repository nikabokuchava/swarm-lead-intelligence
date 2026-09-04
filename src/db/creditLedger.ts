import { prisma } from './prisma.js';

export type CreditMutationReason = 
    | 'signup_bonus' 
    | 'stripe_purchase' 
    | 'job_reserved' 
    | 'lead_generated' 
    | 'refund_unfilled_quota' 
    | 'admin_adjustment';

export interface CreditLedgerRecord {
    id: string;
    userId: string;
    clerkId: string;
    delta: number;
    reason: string;
    refId: string | null;
    createdAt: Date;
}

/**
 * Record an auditable credit change in the ledger.
 */
export async function recordCreditMutation(
    clerkId: string,
    userId: string,
    delta: number,
    reason: CreditMutationReason | string,
    refId?: string
): Promise<CreditLedgerRecord> {
    return prisma.creditLedger.create({
        data: {
            clerkId,
            userId,
            delta,
            reason,
            refId: refId ?? null,
        }
    });
}

/**
 * Retrieve credit history for a user.
 */
export async function getCreditHistory(
    clerkId: string,
    limit = 50
): Promise<CreditLedgerRecord[]> {
    return prisma.creditLedger.findMany({
        where: { clerkId },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });
}
