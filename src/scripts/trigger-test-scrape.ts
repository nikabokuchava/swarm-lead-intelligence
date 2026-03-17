import { prisma } from '../db/prisma.js';

const QUERY = 'HVAC Contractor';
const LOCATION = 'Miami, FL';
const MAX_RESULTS = 100;
const IS_PREMIUM = true;

// Representative Miami zip grid (8 zips to hit 100 lead goal)
const ZIP_CODES = [
  '33101', // Downtown Miami
  '33125', // Little Havana
  '33127', // Wynwood / Edgewater
  '33130', // Brickell
  '33131', // Brickell Key / Downtown
  '33133', // Coral Gables North
  '33135', // Flagami
  '33145', // Shenandoah / Silver Bluff
] as const;

async function triggerTestScrape() {
  // Resolve userId: prefer real Clerk user, fall back to 'admin'
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  const userId = user?.clerkId ?? 'admin';

  console.log(`[trigger] userId resolved → ${userId}`);
  console.log(`[trigger] Query: "${QUERY} ${LOCATION}" | maxResults: ${MAX_RESULTS} | premium: ${IS_PREMIUM}`);
  console.log(`[trigger] Zip codes: ${ZIP_CODES.join(', ')}`);

  const job = await prisma.scrapeJob.create({
    data: {
      userId,
      query: `${QUERY} ${LOCATION}`,
      maxResults: MAX_RESULTS,
      isPremium: IS_PREMIUM,
      status: 'PROCESSING',
      tasks: {
        create: ZIP_CODES.map((zip) => ({
          zipCode: zip,
          query: `${QUERY} ${LOCATION}`,
          status: 'PENDING' as const,
        })),
      },
    },
    include: { tasks: true },
  });

  console.log(`[trigger] Job created: ${job.id}`);
  console.log(`[trigger] Tasks created: ${job.tasks.length}`);
  job.tasks.forEach((t) => console.log(`  └─ Task ${t.id} | zip: ${t.zipCode} | status: ${t.status}`));
  console.log(`[trigger] Start the worker with: npm run worker`);

  await prisma.$disconnect();
}

triggerTestScrape().catch(async (e) => {
  console.error('[trigger] Fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
