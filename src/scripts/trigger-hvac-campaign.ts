import { prisma } from '../db/prisma.js';

const LOCATION = 'Miami, FL';

const JOBS = [
  {
    label: 'HVAC Contractors (Payload)',
    query: `HVAC Contractor ${LOCATION}`,
    maxResults: 100,
  },
  {
    label: 'Digital Marketing Agencies (Buyers)',
    query: `Digital Marketing Agency ${LOCATION}`,
    maxResults: 60,
  },
] as const;

const ZIP_CODES = [
  '33138', // Upper East Side
  '33150', // North Miami
  '33161', // North Miami Beach
  '33162', // Aventura South
  '33167', // Carol City
  '33169', // Ives Estates
] as const;

async function triggerHvacCampaign() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  const userId = user?.clerkId ?? 'admin';

  console.log(`[hvac-campaign] userId resolved → ${userId}`);
  console.log(`[hvac-campaign] Zip codes: ${ZIP_CODES.join(', ')}\n`);

  for (const cfg of JOBS) {
    console.log(`[hvac-campaign] Creating: ${cfg.label}`);
    console.log(`  Query: "${cfg.query}" | maxResults: ${cfg.maxResults} | premium: true`);

    const job = await prisma.scrapeJob.create({
      data: {
        userId,
        query: cfg.query,
        maxResults: cfg.maxResults,
        isPremium: true,
        status: 'PROCESSING',
        tasks: {
          create: ZIP_CODES.map((zip) => ({
            zipCode: zip,
            query: cfg.query,
            status: 'PENDING' as const,
          })),
        },
      },
      include: { tasks: true },
    });

    console.log(`  Job created: ${job.id}`);
    console.log(`  Tasks created: ${job.tasks.length}`);
    job.tasks.forEach((t) => console.log(`    └─ Task ${t.id} | zip: ${t.zipCode}`));
    console.log('');
  }

  console.log('[hvac-campaign] Both jobs queued. Run: npm run worker');
  await prisma.$disconnect();
}

triggerHvacCampaign().catch(async (e) => {
  console.error('[hvac-campaign] Fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
