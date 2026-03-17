import { prisma } from '../db/prisma.js';

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

async function checkQueueHealth() {
  const job = await prisma.scrapeJob.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!job) {
    console.log('[queue] No jobs found.');
    await prisma.$disconnect();
    return;
  }

  // --- Task breakdown ---
  const tasks = await prisma.scrapeTask.groupBy({
    by: ['status'],
    where: { jobId: job.id },
    _count: true,
  });

  const taskTotal = tasks.reduce((s, t) => s + t._count, 0);

  // --- Company breakdown ---
  const companies = await prisma.company.groupBy({
    by: ['status'],
    where: { jobId: job.id },
    _count: true,
  });

  const companyTotal = companies.reduce((s, c) => s + c._count, 0);

  // --- Stale locks (Company) ---
  const now = new Date();
  const staleCompanies = await prisma.company.findMany({
    where: {
      jobId: job.id,
      status: 'PROCESSING',
      lockedAt: { lt: new Date(now.getTime() - STALE_THRESHOLD_MS) },
    },
    select: { id: true, name: true, workerId: true, lockedAt: true },
  });

  // --- Stale locks (ScrapeTask) ---
  const staleTasks = await prisma.scrapeTask.findMany({
    where: {
      jobId: job.id,
      status: 'PROCESSING',
      lockedAt: { lt: new Date(now.getTime() - STALE_THRESHOLD_MS) },
    },
    select: { id: true, zipCode: true, workerId: true, lockedAt: true },
  });

  // --- Output ---
  console.log('');
  console.log('='.repeat(60));
  console.log('  QUEUE HEALTH CHECK');
  console.log('='.repeat(60));
  console.log(`  Job ID:     ${job.id}`);
  console.log(`  Query:      ${job.query}`);
  console.log(`  Status:     ${job.status}`);
  console.log(`  Premium:    ${job.isPremium}`);
  console.log(`  Created:    ${job.createdAt.toISOString()}`);

  console.log('');
  console.log('  SCRAPE TASKS');
  console.log('-'.repeat(60));
  for (const t of tasks) {
    console.log(`  ${String(t.status).padEnd(14)} ${String(t._count).padStart(4)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(14)} ${String(taskTotal).padStart(4)}`);

  console.log('');
  console.log('  COMPANIES (LEADS)');
  console.log('-'.repeat(60));
  for (const c of companies) {
    console.log(`  ${String(c.status).padEnd(14)} ${String(c._count).padStart(4)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(14)} ${String(companyTotal).padStart(4)}`);

  console.log('');
  console.log('  STALE LOCKS (>10 min)');
  console.log('-'.repeat(60));

  if (staleTasks.length === 0 && staleCompanies.length === 0) {
    console.log('  None detected.');
  }

  if (staleTasks.length > 0) {
    console.log(`  Stale Tasks: ${staleTasks.length}`);
    for (const t of staleTasks) {
      const mins = ((now.getTime() - (t.lockedAt?.getTime() ?? 0)) / 60000).toFixed(1);
      console.log(`    Task ${t.id.substring(0, 8)}  zip=${t.zipCode}  worker=${t.workerId}  locked=${mins}m`);
    }
  }

  if (staleCompanies.length > 0) {
    console.log(`  Stale Companies: ${staleCompanies.length}`);
    for (const c of staleCompanies) {
      const mins = ((now.getTime() - (c.lockedAt?.getTime() ?? 0)) / 60000).toFixed(1);
      console.log(`    ${c.name.substring(0, 30).padEnd(30)}  worker=${c.workerId}  locked=${mins}m`);
    }
  }

  console.log('');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

checkQueueHealth().catch(async (e) => {
  console.error('[queue] Fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
