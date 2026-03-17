import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const prisma = new PrismaClient();

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  console.log('Fetching top 50 premium C-Level leads...');

  const contacts = await prisma.contact.findMany({
    where: {
      verificationStatus: 'VALID',
      isCLevel: true,
    },
    orderBy: {
      confidenceScore: 'desc',
    },
    take: 50,
    include: {
      company: true,
    },
  });

  if (contacts.length === 0) {
    console.log('No premium C-Level leads found matching criteria (VALID + isCLevel).');
    return;
  }

  console.log(`Found ${contacts.length} premium C-Level leads.`);

  const headers = [
    'Company Name',
    'Website',
    'Contact Name',
    'Email',
    'Job Title',
    'AI Confidence Score',
    'MX Provider',
    'Verification Status',
  ];

  const csvRows = [headers.join(',')];

  for (const c of contacts) {
    const row = [
      escapeCSV(c.company.name),
      escapeCSV(c.company.website),
      escapeCSV(c.fullName),
      escapeCSV(c.workEmail),
      escapeCSV(c.title),
      escapeCSV(c.confidenceScore?.toString()),
      escapeCSV(c.mxProvider),
      escapeCSV(c.verificationStatus),
    ];
    csvRows.push(row.join(','));
  }

  const csvPath = path.join(rootDir, 'premium-50-sample.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n') + '\n', 'utf8');

  console.log(`Wrote ${contacts.length} rows to ${csvPath}`);
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
