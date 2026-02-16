import { prisma } from "@/lib/db";
import { SidebarClient } from "./SidebarClient";

export async function Sidebar() {
  // Fetch last 10 jobs
  const recentJobs = await prisma.scrapeJob.findMany({
    take: 10,
    orderBy: {
      createdAt: 'desc'
    }
  });

  return <SidebarClient recentJobs={recentJobs} />;
}
