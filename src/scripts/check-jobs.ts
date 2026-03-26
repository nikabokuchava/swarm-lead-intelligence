import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.scrapeJob.findMany({
    where: {
      OR: [
        { query: { contains: 'HVAC' } },
        { query: { contains: 'Marketing Agency' } },
      ],
    },
    include: {
      tasks: true,
      _count: { select: { companies: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  for (const j of jobs) {
    console.log(`\nJob: ${j.id.slice(0, 8)} | ${j.query} | status: ${j.status} | companies: ${j._count.companies}`);
    for (const t of j.tasks) {
      console.log(`  zip: ${t.zipCode} | status: ${t.status} | retries: ${t.retries}`);
    }
  }

  // Check all previous tasks for these zip codes
  const allTasks = await prisma.scrapeTask.findMany({
    where: { zipCode: { in: ['33101', '33125', '33127', '33130', '33131', '33133'] } },
    include: { scrapeJob: { select: { query: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n--- All tasks for these zip codes ---');
  for (const t of allTasks) {
    console.log(`${t.zipCode} | ${t.scrapeJob.query} | status: ${t.status} | created: ${t.scrapeJob.createdAt.toISOString().slice(0, 10)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
