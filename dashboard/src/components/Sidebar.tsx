import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { SidebarClient } from "./SidebarClient";

export async function Sidebar() {
  const { userId } = await auth();

  const [recentJobs, dbUser] = await Promise.all([
    prisma.scrapeJob.findMany({
      where: userId ? { userId } : {},
      take: 10,
      orderBy: { createdAt: 'desc' }
    }),
    userId
      ? prisma.user.findUnique({ where: { clerkId: userId }, select: { credits: true } })
      : null,
  ]);

  const credits = dbUser?.credits ?? null;

  return <SidebarClient recentJobs={recentJobs} credits={credits} />;
}
