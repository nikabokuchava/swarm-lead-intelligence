import { prisma } from '../db/prisma.js';

const QUERY = 'HVAC Contractor';
const LOCATION = 'Miami, FL';

// Broad Miami-Dade zip coverage for maximum lead density
const ZIP_CODES = [
  '33125', // Little Havana
  '33126', // Flagami
  '33127', // Wynwood / Edgewater
  '33130', // Brickell
  '33131', // Downtown Miami
  '33132', // Port of Miami
  '33133', // Coconut Grove
  '33134', // Coral Gables North
  '33135', // West Flagler
  '33136', // Overtown
  '33137', // Design District
  '33138', // Upper East Side
  '33139', // Miami Beach South
  '33140', // Mid-Beach
  '33141', // North Beach / Surfside
  '33142', // Liberty City
  '33143', // South Miami
  '33144', // Westchester
  '33145', // Shenandoah
  '33146', // Coral Gables South
  '33147', // Brownsville
  '33149', // Key Biscayne
  '33150', // North Miami
  '33154', // Bay Harbor Islands
  '33155', // Kendall North
  '33156', // Pinecrest
  '33157', // Perrine
  '33158', // Palmetto Bay
  '33160', // Sunny Isles Beach
  '33161', // North Miami Beach
  '33162', // Aventura South
  '33165', // West Kendall
  '33166', // Medley / Doral East
  '33167', // Carol City
  '33168', // Miami Gardens South
  '33169', // Ives Estates
  '33170', // Homestead North
  '33172', // Doral West
  '33173', // Kendall
  '33174', // Sweetwater
  '33175', // Tamiami
  '33176', // South Kendall
  '33177', // Richmond Heights
  '33178', // Doral
  '33179', // Ojus / Aventura
  '33180', // Aventura
  '33181', // North Miami Beach East
  '33182', // West Doral
  '33183', // Kendall Lakes
  '33184', // West Kendall
  '33185', // Kendall West
  '33186', // The Crossings
  '33187', // South Dade
  '33189', // Cutler Bay
  '33190', // Cutler Bay South
  '33193', // West Kendall South
  '33194', // Country Walk
  '33196', // The Hammocks
] as const;

async function triggerMiamiHvac() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  const userId = user?.clerkId ?? 'admin';

  const fullQuery = `${QUERY} ${LOCATION}`;

  console.log(`[miami-hvac] userId: ${userId}`);
  console.log(`[miami-hvac] Query: "${fullQuery}"`);
  console.log(`[miami-hvac] Zip codes: ${ZIP_CODES.length}`);
  console.log(`[miami-hvac] maxResults: 100 | isPremium: true\n`);

  const job = await prisma.scrapeJob.create({
    data: {
      userId,
      query: fullQuery,
      maxResults: 100,
      isPremium: true,
      status: 'PROCESSING',
      tasks: {
        create: ZIP_CODES.map((zip) => ({
          zipCode: zip,
          query: fullQuery,
          status: 'PENDING' as const,
        })),
      },
    },
    include: { tasks: true },
  });

  console.log(`[miami-hvac] Job created: ${job.id}`);
  console.log(`[miami-hvac] Tasks created: ${job.tasks.length}`);
  job.tasks.forEach((t) => console.log(`  └─ ${t.id.substring(0, 8)} | zip: ${t.zipCode}`));
  console.log(`\n[miami-hvac] Queued. Run: npm run worker`);

  await prisma.$disconnect();
}

triggerMiamiHvac().catch(async (e) => {
  console.error('[miami-hvac] Fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
