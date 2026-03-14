import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const exportsDir = path.join(rootDir, 'exports');

const prisma = new PrismaClient();

const OUTPUT_FILE = 'medspa-healthcare-agencies-top-100.csv';
const LIMIT = 100;

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADERS = [
  'Company Name',
  'Phone',
  'Website',
  'Address',
  'Contact Name',
  'Email',
  'Title',
  'AI Confidence',
  'MX Provider',
];

async function main(): Promise<void> {
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  const companies = await prisma.company.findMany({
    where: {
      scrapeJob: {
        AND: [
          {
            OR: [
              { query: { contains: 'medspa', mode: 'insensitive' } },
              { query: { contains: 'healthcare', mode: 'insensitive' } },
            ],
          },
          { query: { contains: 'agency', mode: 'insensitive' } },
        ],
      },
      contacts: {
        some: {
          verificationStatus: 'VALID',
          workEmail: { not: null },
        },
      },
    },
    include: {
      contacts: {
        where: {
          verificationStatus: 'VALID',
          workEmail: { not: null },
        },
        orderBy: [
          { isCLevel: 'desc' },
          { confidenceScore: 'desc' },
        ],
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Deduplicate by email and cap at LIMIT
  const seenEmails = new Set<string>();
  const rows: string[] = [CSV_HEADERS.join(',')];
  let count = 0;

  for (const company of companies) {
    if (count >= LIMIT) break;

    const contact = company.contacts[0];
    if (!contact?.workEmail) continue;

    const emailLower = contact.workEmail.toLowerCase();
    if (seenEmails.has(emailLower)) continue;
    seenEmails.add(emailLower);

    rows.push([
      escapeCSV(company.name),
      escapeCSV(company.phone),
      escapeCSV(company.website),
      escapeCSV(company.address),
      escapeCSV(contact.fullName),
      escapeCSV(contact.workEmail),
      escapeCSV(contact.title),
      escapeCSV(contact.confidenceScore),
      escapeCSV(contact.mxProvider),
    ].join(','));

    count++;
  }

  const outputPath = path.join(exportsDir, OUTPUT_FILE);
  fs.writeFileSync(outputPath, rows.join('\n') + '\n', 'utf8');
  console.log(`Exported ${count} agency buyer leads → ${outputPath}`);
}

main()
  .catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
