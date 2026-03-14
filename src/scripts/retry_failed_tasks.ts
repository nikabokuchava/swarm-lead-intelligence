import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function retryFailedTasks() {
  try {
    const tasks = await prisma.scrapeTask.updateMany({
      where: { status: 'FAILED' },
      data: {
        status: 'PENDING',
        workerId: null,
        lockedAt: null,
      },
    });
    console.log(`✅ Reset ${tasks.count} FAILED tasks → PENDING`);

    const jobs = await prisma.scrapeJob.updateMany({
      where: { status: { in: ['COMPLETED', 'FAILED'] } },
      data: {
        status: 'PROCESSING',
        completedAt: null,
      },
    });
    console.log(`✅ Reset ${jobs.count} COMPLETED/FAILED jobs → PROCESSING`);
  } finally {
    await prisma.$disconnect();
  }
}

retryFailedTasks();
