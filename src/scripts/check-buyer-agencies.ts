import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Find jobs where query contains marketing, agency, or seo
  const buyerJobs = await prisma.scrapeJob.findMany({
    where: {
      OR: [
        { query: { contains: 'marketing', mode: 'insensitive' } },
        { query: { contains: 'agency', mode: 'insensitive' } },
        { query: { contains: 'seo', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      query: true,
      status: true,
      resultsFound: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (buyerJobs.length === 0) {
    console.log('No buyer-agency jobs found.');
    return;
  }

  console.log(`\n=== BUYER-AGENCY JOBS (${buyerJobs.length}) ===\n`);
  for (const job of buyerJobs) {
    console.log(`  [${job.status}] "${job.query}" — ${job.resultsFound} results (${job.createdAt.toISOString().slice(0, 10)})`);
  }

  const jobIds = buyerJobs.map((j) => j.id);

  // Total companies linked to these jobs
  const totalCompanies = await prisma.company.count({
    where: { jobId: { in: jobIds } },
  });

  // Companies with at least one valid email (Contact table OR emails array)
  const companiesWithValidContact = await prisma.company.count({
    where: {
      jobId: { in: jobIds },
      contacts: {
        some: {
          workEmail: { not: null },
          verificationStatus: 'VALID',
        },
      },
    },
  });

  const companiesWithEmailArray = await prisma.company.count({
    where: {
      jobId: { in: jobIds },
      emails: { isEmpty: false },
      // Exclude those already counted via contacts
      NOT: {
        contacts: {
          some: {
            workEmail: { not: null },
            verificationStatus: 'VALID',
          },
        },
      },
    },
  });

  const totalWithEmail = companiesWithValidContact + companiesWithEmailArray;

  console.log(`\n=== SUMMARY ===\n`);
  console.log(`  Total companies:        ${totalCompanies}`);
  console.log(`  With valid email:       ${totalWithEmail} (${companiesWithValidContact} via contacts, ${companiesWithEmailArray} via emails[])`);
  console.log(`  Email coverage:         ${totalCompanies > 0 ? ((totalWithEmail / totalCompanies) * 100).toFixed(1) : 0}%`);

  // Last 5 agencies with best contact
  const sample = await prisma.company.findMany({
    where: { jobId: { in: jobIds } },
    include: {
      contacts: {
        where: { workEmail: { not: null } },
        orderBy: [
          { verificationStatus: 'asc' }, // VALID sorts first alphabetically
          { confidenceScore: 'desc' },
        ],
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log(`\n=== LAST 5 AGENCIES ===\n`);
  for (const c of sample) {
    const contact = c.contacts[0];
    const email = contact?.workEmail ?? c.emails[0] ?? '—';
    console.log(`  ${c.name}`);
    console.log(`    Website: ${c.website ?? '—'}`);
    console.log(`    Email:   ${email}`);
    console.log('');
  }
}

main()
  .catch((err) => {
    console.error('Check failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
