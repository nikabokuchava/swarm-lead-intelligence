import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
 * Atomically deducts credits. Returns updated user.
 * Uses Prisma decrement to avoid race conditions.
 */
export async function deductCredit(clerkId: string, amount = 1) {
    return prisma.user.update({
        where: { clerkId },
        data: { credits: { decrement: amount } },
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

export { prisma as userPrisma };
