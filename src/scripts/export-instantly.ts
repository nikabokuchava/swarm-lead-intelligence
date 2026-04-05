import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');
const outputDir = path.join(rootDir, 'marketing', 'campaigns');
const OUTPUT_FILE = 'instantly-hvac-leads.csv';

const prisma = new PrismaClient();

// Accept optional --jobId <id> CLI argument for targeting a specific job
const jobIdArg = (() => {
  const idx = process.argv.indexOf('--jobId');
  return idx !== -1 ? process.argv[idx + 1] : undefined;
})();

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function splitName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  if (!fullName || fullName.trim() === '' || fullName === 'Unknown') {
    return { firstName: '', lastName: '' };
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

const CSV_HEADERS = [
  'email',
  'firstName',
  'lastName',
  'companyName',
  'website',
  'rating',
  'mxProvider',
];

async function main(): Promise<void> {
  // Resolve target job
  let jobId: string | undefined = jobIdArg;

  if (!jobId) {
    // Auto-detect: most recent COMPLETED HVAC job that has deliverable contacts
    const job = await prisma.scrapeJob.findFirst({
      where: {
        status: 'COMPLETED',
        query: { contains: 'HVAC', mode: 'insensitive' },
        contacts: {
          some: { verificationStatus: { in: ['VALID', 'CATCH_ALL'] } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      console.error('No completed HVAC job with deliverable contacts found. Pass --jobId <id>.');
      process.exit(1);
    }

    jobId = job.id;
    console.log(`Auto-detected job: "${job.query}" (${job.id})`);
  } else {
    console.log(`Using specified jobId: ${jobId}`);
  }

  // Fetch deliverable contacts (VALID + CATCH_ALL) for the job
  const contacts = await prisma.contact.findMany({
    where: {
      jobId,
      verificationStatus: { in: ['VALID', 'CATCH_ALL'] },
      workEmail: { not: null },
    },
    orderBy: [
      { isCLevel: 'desc' },
      { confidenceScore: 'desc' },
    ],
    include: {
      company: {
        select: {
          name: true,
          website: true,
          rating: true,
        },
      },
    },
  });

  if (contacts.length === 0) {
    console.log('No deliverable contacts (VALID/CATCH_ALL) found for this job.');
    return;
  }

  console.log(`Found ${contacts.length} deliverable contacts.`);

  // Deduplicate by email address
  const seenEmails = new Set<string>();
  const rows: string[] = [CSV_HEADERS.join(',')];
  let exported = 0;

  for (const contact of contacts) {
    if (!contact.workEmail) continue;

    const emailLower = contact.workEmail.toLowerCase();
    if (seenEmails.has(emailLower)) continue;
    seenEmails.add(emailLower);

    const { firstName, lastName } = splitName(contact.fullName);

    rows.push([
      escapeCSV(contact.workEmail),
      escapeCSV(firstName),
      escapeCSV(lastName),
      escapeCSV(contact.company.name),
      escapeCSV(contact.company.website),
      escapeCSV(contact.company.rating),
      escapeCSV(contact.mxProvider),
    ].join(','));

    exported++;
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, OUTPUT_FILE);
  fs.writeFileSync(outputPath, rows.join('\n') + '\n', 'utf8');

  const validCount = contacts.filter(c => c.verificationStatus === 'VALID').length;
  const catchAllCount = contacts.filter(c => c.verificationStatus === 'CATCH_ALL').length;

  console.log(`\nExport complete:`);
  console.log(`  VALID:      ${validCount}`);
  console.log(`  CATCH_ALL:  ${catchAllCount}`);
  console.log(`  Total rows: ${exported}`);
  console.log(`  Output:     ${outputPath}`);
}

main()
  .catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
