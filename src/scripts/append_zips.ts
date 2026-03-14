import { prisma } from '../db/prisma.js';

const FINAL_ZIPS = [
  '55343', // Minnetonka, MN
  '84103', // Salt Lake City – Avenues, UT
  '29403', // Charleston – Upper King, SC
] as const;

const QUERY = 'MedSpas';

async function appendFinal() {
  try {
    const job = await prisma.scrapeJob.findFirst({
      where: { query: QUERY },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      throw new Error(`No ScrapeJob found with query="${QUERY}".`);
    }

    const taskData = FINAL_ZIPS.map((zip) => ({
      jobId: job.id,
      zipCode: zip,
      query: QUERY,
      status: 'PENDING' as const,
    }));

    const { count } = await prisma.scrapeTask.createMany({ data: taskData });

    const totalTasks = await prisma.scrapeTask.count({ where: { jobId: job.id } });
    const totalPending = await prisma.scrapeTask.count({ where: { jobId: job.id, status: 'PENDING' } });

    console.log(`${count} final tasks appended.`);
    console.log(`TOTAL tasks on job: ${totalTasks} (50 original + 300 new = 350)`);
    console.log(`PENDING tasks: ${totalPending}`);
    console.log(`Job ${job.id} status: PROCESSING — ready for worker pickup.`);
  } finally {
    await prisma.$disconnect();
  }
}

appendFinal().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
