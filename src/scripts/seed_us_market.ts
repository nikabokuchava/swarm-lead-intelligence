import { prisma } from '../db/prisma.js';

/**
 * 50 Major / Wealthy US Zip Codes for MedSpa lead generation.
 * Covers top metro areas with high disposable income demographics.
 */
const US_ZIP_CODES = [
  // New York Metro
  '10001', // Manhattan – Midtown
  '10021', // Manhattan – Upper East Side
  '10013', // Manhattan – Tribeca/SoHo
  '11201', // Brooklyn Heights

  // Los Angeles Metro
  '90210', // Beverly Hills
  '90024', // Westwood / Bel Air
  '90401', // Santa Monica
  '92660', // Newport Beach

  // Miami / South Florida
  '33101', // Downtown Miami
  '33139', // Miami Beach
  '33480', // Palm Beach
  '33301', // Fort Lauderdale

  // Chicago Metro
  '60601', // The Loop
  '60611', // Gold Coast / Mag Mile
  '60093', // Winnetka

  // Dallas / Houston / Austin
  '75201', // Downtown Dallas
  '75205', // Highland Park
  '77002', // Downtown Houston
  '77005', // West University Place
  '78701', // Downtown Austin

  // San Francisco / Bay Area
  '94102', // San Francisco – Civic Center
  '94301', // Palo Alto
  '94027', // Atherton

  // Washington D.C. Metro
  '20001', // Northwest DC
  '22101', // McLean, VA
  '20816', // Bethesda, MD

  // Boston Metro
  '02116', // Back Bay
  '02199', // Prudential / Copley

  // Phoenix / Scottsdale
  '85251', // Old Town Scottsdale
  '85254', // North Scottsdale

  // Las Vegas
  '89109', // The Strip
  '89135', // Summerlin

  // Seattle Metro
  '98101', // Downtown Seattle
  '98004', // Bellevue

  // Denver
  '80202', // Downtown Denver
  '80206', // Cherry Creek

  // Atlanta
  '30301', // Midtown Atlanta
  '30305', // Buckhead

  // San Diego
  '92037', // La Jolla
  '92101', // Downtown San Diego

  // Nashville
  '37203', // The Gulch / Midtown

  // Charlotte
  '28202', // Uptown Charlotte

  // Minneapolis
  '55401', // Downtown Minneapolis

  // Philadelphia
  '19102', // Center City

  // Tampa / St. Pete
  '33602', // Downtown Tampa

  // Honolulu
  '96815', // Waikiki

  // Naples, FL
  '34102', // Downtown Naples

  // Additional High-Income Markets
  '07078', // Short Hills, NJ
  '06830', // Greenwich, CT
  '97209', // Portland – Pearl District
] as const;

const QUERY = 'MedSpas';
const MAX_RESULTS = 5000;

async function seedUSMarket() {
  console.log(`Seeding ${US_ZIP_CODES.length} zip codes for "${QUERY}"...`);

  const job = await prisma.scrapeJob.create({
    data: {
      userId: 'admin',
      query: QUERY,
      maxResults: MAX_RESULTS,
      isPremium: true,
      status: 'PROCESSING',
    },
  });

  console.log(`Parent job created: ${job.id}`);

  const taskData = US_ZIP_CODES.map((zip) => ({
    jobId: job.id,
    zipCode: zip,
    query: QUERY,
    status: 'PENDING' as const,
  }));

  const { count } = await prisma.scrapeTask.createMany({ data: taskData });

  console.log(`${count} tasks queued.`);

  await prisma.$disconnect();
}

seedUSMarket().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
