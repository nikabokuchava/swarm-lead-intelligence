/**
 * Seed 100 HVAC leads across diverse US zip codes for VPS quality testing
 * Run: npx tsx src/scripts/seed-hvac-test.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 20 diverse US zip codes (major metro areas for high HVAC density)
const ZIP_CODES = [
  '10001', // New York, NY
  '90001', // Los Angeles, CA
  '60601', // Chicago, IL
  '77001', // Houston, TX
  '85001', // Phoenix, AZ
  '19101', // Philadelphia, PA
  '78201', // San Antonio, TX
  '92101', // San Diego, CA
  '75201', // Dallas, TX
  '95101', // San Jose, CA
  '32801', // Orlando, FL
  '28201', // Charlotte, NC
  '46201', // Indianapolis, IN
  '94101', // San Francisco, CA
  '98101', // Seattle, WA
  '80201', // Denver, CO
  '20001', // Washington, DC
  '37201', // Nashville, TN
  '73101', // Oklahoma City, OK
  '04101', // Portland, ME
];

async function seed() {
  // Create premium job with 100 max results (5 per zip × 20 zips)
  const job = await prisma.scrapeJob.create({
    data: {
      query: 'HVAC contractor',
      status: 'PENDING',
      isPremium: true,
      maxResults: 5,
      resultsFound: 0,
    },
  });

  console.log(`✅ Created ScrapeJob: ${job.id}`);

  // Create one ScrapeTask per zip code
  const tasks = await prisma.scrapeTask.createMany({
    data: ZIP_CODES.map((zip) => ({
      jobId: job.id,
      query: 'HVAC contractor',
      zipCode: zip,
      status: 'PENDING',
      retries: 0,
      maxRetries: 3,
    })),
  });

  console.log(`✅ Created ${tasks.count} ScrapeTasks across ${ZIP_CODES.length} zip codes`);
  console.log(`📊 Expected: ~100 companies (5 per zip × 20 zips)`);
  console.log(`🔑 Job ID: ${job.id}`);
  console.log(`⭐ Premium: true (C-Level inference enabled)`);

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error('❌ Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
