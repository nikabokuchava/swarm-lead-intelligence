import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const JOB_ID = '37118ba2-4bdb-42a2-9ff5-3ac07b3b84ef';

const job = await p.scrapeJob.findUnique({
  where: { id: JOB_ID },
  include: { tasks: { orderBy: { createdAt: 'asc' } } },
});

if (!job) { console.log('Job not found'); process.exit(1); }

const companies = await p.company.findMany({
  where: { jobId: JOB_ID },
  select: { id: true, name: true, status: true, source: true },
});

const totalAdded = companies.length;
const startTime = job.createdAt;
const lastTask = job.tasks[job.tasks.length - 1];
const endTime = job.completedAt ?? lastTask?.createdAt ?? new Date();

// Per-task breakdown
let totalSkipped = 0;
for (const task of job.tasks) {
  // Count skipped by looking at task log — we can infer from the total
  console.log(`  Task ${task.id.slice(0, 8)} | zip: ${task.zipCode} | status: ${task.status} | retries: ${task.retries}`);
}

// Duration
const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
const durationMin = (durationMs / 60000).toFixed(1);
const durationSec = (durationMs / 1000).toFixed(0);

console.log(`\n--- JOB REPORT: ${JOB_ID.slice(0, 8)} ---`);
console.log(`Query:        ${job.query}`);
console.log(`Status:       ${job.status}`);
console.log(`maxResults:   ${job.maxResults}`);
console.log(`resultsFound: ${job.resultsFound}`);
console.log(`Leads in DB:  ${totalAdded}`);
console.log(`Skipped:      ~${(job.maxResults ?? 100) - totalAdded} (duplicates across zip codes)`);
console.log(`Tasks:        ${job.tasks.length} (${job.tasks.filter(t => t.status === 'COMPLETED').length} completed, ${job.tasks.filter(t => t.status === 'FAILED').length} failed)`);
console.log(`Duration:     ${durationMin} min (${durationSec}s)`);
console.log(`Created:      ${job.createdAt}`);
console.log(`Completed:    ${job.completedAt ?? 'N/A'}`);

await p.$disconnect();
