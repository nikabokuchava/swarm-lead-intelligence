import { auth, currentUser } from "@clerk/nextjs/server";
import { SidebarClient } from "./SidebarClient";
import { prisma } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";

export async function Sidebar() {
  const { userId } = await auth();
  const clerkUser = userId ? await currentUser() : null;

  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? '';

  const [recentJobs, dbUser] = await Promise.all([
    prisma.scrapeJob.findMany({
      where: userId ? { userId } : {},
      take: 10,
      orderBy: { createdAt: 'desc' }
    }),
    // getOrCreateUser is idempotent: creates with 100 credits if new, returns existing if not
    userId && email ? getOrCreateUser(userId, email) : null,
  ]);

  const credits = dbUser?.credits ?? null;

  return <SidebarClient recentJobs={recentJobs} credits={credits} />;
}
