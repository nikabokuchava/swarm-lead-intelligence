import { prisma } from './prisma.js';

/**
 * Ensures a user record exists in our DB (synced from Clerk).
 * New users get 100 free credits.
 */
export async function getOrCreateUser(clerkId: string, email: string) {
    return prisma.user.upsert({
        where: { clerkId },
        update: {},
        create: {
            clerkId,
            email,
            credits: 100,
        },
    });
}

/**
 * Atomically deducts credits ONLY if balance is sufficient.
 * SEC-04 Fix: Uses conditional update to prevent negative balances.
 * Returns updated user, or throws if insufficient credits.
 */
export async function deductCredit(clerkId: string, amount = 1) {
    const result = await prisma.user.updateMany({
        where: {
            clerkId,
            credits: { gte: amount },
        },
        data: { credits: { decrement: amount } },
    });

    if (result.count === 0) {
        throw new Error(`Insufficient credits for user ${clerkId}`);
    }

    // Return the updated user for logging
    return prisma.user.findUniqueOrThrow({
        where: { clerkId },
    });
}

/**
 * Returns true if user has at least 1 credit remaining.
 */
export async function hasCredits(clerkId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { credits: true },
    });
    return (user?.credits ?? 0) > 0;
}

/**
 * Returns the current credit balance for a user.
 */
export async function getCredits(clerkId: string): Promise<number> {
    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { credits: true },
    });
    return user?.credits ?? 0;
}
