import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const tasks = await p.scrapeTask.findMany({
  where: { status: 'PENDING' },
  select: { jobId: true },
});

const byJob = new Map<string, number>();
for (const t of tasks) {
  byJob.set(t.jobId, (byJob.get(t.jobId) ?? 0) + 1);
}

for (const [jobId, count] of byJob) {
  const job = await p.scrapeJob.findUnique({
    where: { id: jobId },
    select: { query: true, maxResults: true, resultsFound: true, createdAt: true },
  });
  console.log(`${jobId.slice(0, 8)} | ${count} pending | ${job?.query} | ${job?.resultsFound}/${job?.maxResults} | ${job?.createdAt}`);
}

await p.$disconnect();
