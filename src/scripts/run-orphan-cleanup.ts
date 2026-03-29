import { cancelOrphanedPendingRecords } from '../db/queue.js';
import { prisma } from '../db/company.js';

async function main() {
  const result = await cancelOrphanedPendingRecords();
  console.log(JSON.stringify(result));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
