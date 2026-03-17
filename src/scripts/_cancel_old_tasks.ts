import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const NEW_JOB_ID = '37118ba2-4bdb-42a2-9ff5-3ac07b3b84ef';

// Fail all PENDING tasks that don't belong to the new Dallas job
const { count: taskCount } = await p.scrapeTask.updateMany({
  where: {
    status: 'PENDING',
    jobId: { not: NEW_JOB_ID },
  },
  data: { status: 'FAILED' },
});

console.log(`[cleanup] Cancelled ${taskCount} old PENDING tasks.`);

// Also mark their parent jobs as FAILED if they have no remaining PENDING/PROCESSING tasks
const staleJobs = await p.scrapeJob.findMany({
  where: {
    id: { not: NEW_JOB_ID },
    status: { in: ['PENDING', 'PROCESSING'] },
  },
  select: { id: true },
});

for (const job of staleJobs) {
  const remaining = await p.scrapeTask.count({
    where: { jobId: job.id, status: { in: ['PENDING', 'PROCESSING'] } },
  });
  if (remaining === 0) {
    await p.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'FAILED' },
    });
  }
}

console.log(`[cleanup] Marked ${staleJobs.length} stale parent jobs as FAILED.`);

// Also remove the duplicate Dallas job (dcc2e18c) if it exists
const DUP_JOB_ID = 'dcc2e18c';
const dupTasks = await p.scrapeTask.updateMany({
  where: { jobId: { startsWith: DUP_JOB_ID }, status: 'PENDING' },
  data: { status: 'FAILED' },
});
if (dupTasks.count > 0) {
  console.log(`[cleanup] Also cancelled ${dupTasks.count} tasks from duplicate Dallas job.`);
}

await p.$disconnect();
