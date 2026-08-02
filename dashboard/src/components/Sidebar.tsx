import { requireUserId } from "@/lib/tenant";
import { SidebarClient } from "./SidebarClient";
import { prisma } from "@/lib/db";

export async function Sidebar() {
  const userId = await requireUserId();

  const recentJobs = await prisma.scrapeJob.findMany({
    where: { userId },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });

  return <SidebarClient recentJobs={recentJobs} />;
}
