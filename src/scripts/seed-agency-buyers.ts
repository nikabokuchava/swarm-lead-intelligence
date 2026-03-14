import { prisma } from '../db/prisma.js';

const US_CITIES = [
  'New York',
  'Los Angeles',
  'Chicago',
  'Houston',
  'Phoenix',
  'Philadelphia',
  'San Antonio',
  'San Diego',
  'Dallas',
  'San Jose',
  'Austin',
  'Jacksonville',
  'Fort Worth',
  'Columbus',
  'Indianapolis',
  'Charlotte',
  'San Francisco',
  'Seattle',
  'Denver',
  'Washington DC',
  'Boston',
  'El Paso',
  'Nashville',
  'Detroit',
  'Oklahoma City',
  'Portland',
  'Las Vegas',
  'Memphis',
  'Louisville',
  'Baltimore',
  'Milwaukee',
  'Albuquerque',
  'Tucson',
  'Fresno',
  'Sacramento',
  'Kansas City',
  'Mesa',
  'Atlanta',
  'Omaha',
  'Colorado Springs',
  'Raleigh',
  'Miami',
  'Virginia Beach',
  'Oakland',
  'Minneapolis',
  'Tulsa',
  'Arlington',
  'New Orleans',
  'Wichita',
  'Tampa',
] as const;

const BUYER_QUERIES = [
  'medspa marketing agency',
  'healthcare marketing agency',
  'local seo agency',
  'b2b lead generation agency',
] as const;

const MAX_RESULTS = 40;

async function seedAgencyBuyers() {
  const combinations = US_CITIES.flatMap((city) =>
    BUYER_QUERIES.map((query) => `${query} in ${city}`)
  );

  console.log(
    `Seeding ${combinations.length} buyer jobs (${US_CITIES.length} cities × ${BUYER_QUERIES.length} queries)...`
  );

  let created = 0;

  for (const searchQuery of combinations) {
    try {
      const job = await prisma.scrapeJob.create({
        data: {
          userId: 'admin',
          query: searchQuery,
          maxResults: MAX_RESULTS,
          isPremium: true,
          status: 'PENDING',
          tasks: {
            create: {
              query: searchQuery,
              status: 'PENDING',
            },
          },
        },
      });

      created++;
      console.log(`[${created}/${combinations.length}] ${job.id} → "${searchQuery}"`);
    } catch (err) {
      console.error(`FAILED: "${searchQuery}" →`, err);
    }
  }

  console.log(`\nDone. ${created}/${combinations.length} jobs created (isPremium: true).`);
  await prisma.$disconnect();
}

seedAgencyBuyers().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
