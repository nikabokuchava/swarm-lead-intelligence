import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NORTH_MIAMI_ZIPS = ['33138', '33150', '33161', '33162', '33167', '33169'];

async function main() {
  // Find North Miami campaign jobs
  const jobs = await prisma.scrapeJob.findMany({
    where: {
      tasks: { some: { zipCode: { in: NORTH_MIAMI_ZIPS } } },
    },
    include: {
      tasks: true,
      companies: {
        include: {
          contacts: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const campaignJobs = jobs.filter((j) =>
    j.tasks.some((t) => NORTH_MIAMI_ZIPS.includes(t.zipCode ?? ''))
  );

  if (campaignJobs.length === 0) {
    console.log('No North Miami campaign jobs found.');
    await prisma.$disconnect();
    return;
  }

  for (const job of campaignJobs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`JOB: ${job.query}`);
    console.log(`ID: ${job.id} | Status: ${job.status} | Premium: ${job.isPremium}`);

    // Task breakdown
    const taskStats = {
      PENDING: job.tasks.filter((t) => t.status === 'PENDING').length,
      PROCESSING: job.tasks.filter((t) => t.status === 'PROCESSING').length,
      COMPLETED: job.tasks.filter((t) => t.status === 'COMPLETED').length,
      FAILED: job.tasks.filter((t) => t.status === 'FAILED').length,
    };
    console.log(`Tasks: ${JSON.stringify(taskStats)}`);

    if (taskStats.PENDING > 0 || taskStats.PROCESSING > 0) {
      console.log('⚠️  Job still in progress — quality audit incomplete.');
      continue;
    }

    // Company stats
    const companies = job.companies;
    const withWebsite = companies.filter((c) => c.website);
    const withEmails = companies.filter((c) => c.emails.length > 0);
    const emailScraped = companies.filter((c) => c.emailScraped);

    console.log(`\nCompanies: ${companies.length}`);
    console.log(`  With website: ${withWebsite.length} (${pct(withWebsite.length, companies.length)})`);
    console.log(`  Email scraped: ${emailScraped.length} (${pct(emailScraped.length, companies.length)})`);
    console.log(`  With emails: ${withEmails.length} (${pct(withEmails.length, companies.length)})`);

    // Contact stats
    const allContacts = companies.flatMap((c) => c.contacts);
    const valid = allContacts.filter((c) => c.verificationStatus === 'VALID');
    const invalid = allContacts.filter((c) => c.verificationStatus === 'INVALID');
    const unknown = allContacts.filter((c) => c.verificationStatus === 'UNKNOWN');
    const catchAll = allContacts.filter((c) => c.verificationStatus === 'CATCH_ALL');
    const cLevel = allContacts.filter((c) => c.isCLevel);
    const inferred = allContacts.filter((c) => c.emailSource === 'INFERENCE');

    console.log(`\nContacts: ${allContacts.length}`);
    console.log(`  VALID: ${valid.length} (${pct(valid.length, allContacts.length)})`);
    console.log(`  INVALID: ${invalid.length} (${pct(invalid.length, allContacts.length)})`);
    console.log(`  UNKNOWN: ${unknown.length} (${pct(unknown.length, allContacts.length)})`);
    console.log(`  CATCH_ALL: ${catchAll.length} (${pct(catchAll.length, allContacts.length)})`);
    console.log(`  C-Level: ${cLevel.length} (${pct(cLevel.length, allContacts.length)})`);
    console.log(`  Inferred: ${inferred.length} (${pct(inferred.length, allContacts.length)})`);

    // Confidence score distribution
    const scores = allContacts.map((c) => c.confidenceScore ?? 0);
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      console.log(`\nConfidence: avg=${avg.toFixed(1)} min=${min} max=${max}`);
    }

    // Quality score
    const totalCompanies = companies.length || 1;
    const totalContacts = allContacts.length || 1;
    const qualityScore =
      (withWebsite.length / totalCompanies) * 20 +
      (withEmails.length / totalCompanies) * 20 +
      (valid.length / totalContacts) * 30 +
      (cLevel.length / totalContacts) * 30;
    console.log(`\n📊 Quality Score: ${qualityScore.toFixed(1)} / 100`);
  }

  await prisma.$disconnect();
}

function pct(num: number, total: number): string {
  if (total === 0) return '0%';
  return ((num / total) * 100).toFixed(1) + '%';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
