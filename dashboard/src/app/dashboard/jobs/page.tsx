import { prisma } from "@/lib/db";
import { JobCreationForm } from "@/components/jobs/JobCreationForm";
import { JobsTable } from "@/components/jobs/JobsTable";

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const jobs = await prisma.scrapeJob.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Scraping Jobs</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-3">
            <JobCreationForm />
        </div>
        <div className="col-span-4">
            <JobsTable jobs={jobs} />
        </div>
      </div>
    </div>
  );
}
