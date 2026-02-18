import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { SidebarClient } from "./SidebarClient";

export async function Sidebar() {
  const { userId } = await auth();

  const recentJobs = await prisma.scrapeJob.findMany({
    where: userId ? { userId } : {},
    take: 10,
    orderBy: {
      createdAt: 'desc'
    }
  });

  return <SidebarClient recentJobs={recentJobs} />;
}
