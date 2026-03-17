import 'dotenv/config';
import { verifyEmail } from '../services/emailVerifier.js';
import { prisma } from '../db/prisma.js';

async function reverify() {
  const contacts = await prisma.contact.findMany({
    where: {
      company: { scrapeJob: { query: { contains: 'HVAC' } } },
      workEmail: { not: null }
    },
    select: { workEmail: true },
    take: 5
  });

  console.log('Re-verifying 5 HVAC emails with fixed verifier:\n');
  for (const ct of contacts) {
    if (!ct.workEmail) continue;
    const result = await verifyEmail(ct.workEmail);
    console.log(`  ${(ct.workEmail).padEnd(45)} → ${result.status.padEnd(10)} mx=${result.mxProvider ?? 'N/A'}  conf=${result.confidence}`);
    await new Promise(r => setTimeout(r, 500));
  }

  await prisma.$disconnect();
}

reverify().catch(async (e) => {
  console.error('Fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
