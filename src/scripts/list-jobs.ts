import { prisma } from '../db/prisma.js';

async function listJobs() {
  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, query: true, status: true, isPremium: true, createdAt: true },
  });

  for (const j of jobs) {
    console.log(
      `${j.id.substring(0, 8)} | ${String(j.status).padEnd(12)} | ${j.isPremium ? 'PREMIUM' : 'FREE   '} | ${j.query} | ${j.createdAt.toISOString()}`
    );
  }

  await prisma.$disconnect();
}

listJobs();
