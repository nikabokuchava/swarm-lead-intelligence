/**
 * User credit helpers for the dashboard (Next.js server-side).
 * Uses the shared Prisma client from @/lib/db which points to root node_modules.
 */
import { prisma } from '@/lib/db';

export async function getOrCreateUser(clerkId: string, email: string) {
    return prisma.user.upsert({
        where: { clerkId },
        update: {},
        create: { clerkId, email, credits: 100 },
    });
}

export async function hasCredits(clerkId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { credits: true },
    });
    return (user?.credits ?? 0) > 0;
}

export async function getCredits(clerkId: string): Promise<number> {
    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { credits: true },
    });
    return user?.credits ?? 0;
}
