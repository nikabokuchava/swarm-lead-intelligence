import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetStuckTasks() {
  try {
    const result = await prisma.scrapeTask.updateMany({
      where: { status: 'PROCESSING' },
      data: {
        status: 'PENDING',
        workerId: null,
        lockedAt: null,
      },
    });
    console.log(`✅ Reset ${result.count} stuck PROCESSING tasks → PENDING`);
  } finally {
    await prisma.$disconnect();
  }
}

resetStuckTasks();
