import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { program } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const exportsDir = path.join(rootDir, 'exports');

const prisma = new PrismaClient();

// --- CLI Arguments ---

program
  .name('export-premium-csv')
  .description('Export premium leads to Gumroad-ready CSV')
  .option('-n, --niche <string>', 'Filter by niche (ScrapeJob.query keyword)')
  .option('-l, --limit <number>', 'Max leads to export', '5000')
  .option('-o, --output <path>', 'Custom output file path')
  .parse();

const opts = program.opts();
const LIMIT = parseInt(opts.limit as string, 10) || 5000;
const NICHE_FILTER = opts.niche as string | undefined;
const CUSTOM_OUTPUT = opts.output as string | undefined;

// --- Address Parsing ---

const US_STATE_ABBREVS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

function parseStateFromAddress(address: string | null): string {
  if (!address) return '';
  // Pattern: "City, ST 12345"
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
  if (match && US_STATE_ABBREVS.has(match[1])) return match[1];
  // Fallback: last 2-letter uppercase token that's a valid state
  const tokens = address.split(/[\s,]+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].toUpperCase();
    if (US_STATE_ABBREVS.has(t)) return t;
  }
  return '';
}

function parseZipFromAddress(address: string | null): string {
  if (!address) return '';
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : '';
}

// --- CSV Escaping (RFC 4180) ---

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// --- Main ---

const CSV_HEADERS = [
  'company_name', 'phone', 'website', 'address',
  'google_rating', 'review_count',
  'email_1', 'email_2',
  'email_type', 'email_confidence', 'email_source', 'verification_status',
  'niche', 'state', 'zip_code', 'scraped_date',
];

async function main(): Promise<void> {
  console.log('Fetching premium leads...');
  if (NICHE_FILTER) console.log(`Niche filter: "${NICHE_FILTER}"`);
  console.log(`Limit: ${LIMIT}`);

  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  const companies = await prisma.company.findMany({
    where: {
      emailScraped: true,
      emails: { isEmpty: false },
      contacts: {
        some: { verificationStatus: 'VALID' },
      },
      ...(NICHE_FILTER ? {
        scrapeJob: {
          query: { contains: NICHE_FILTER, mode: 'insensitive' as const },
        },
      } : {}),
    },
    include: {
      contacts: {
        where: { workEmail: { not: null } },
        orderBy: { confidenceScore: 'desc' },
      },
      scrapeJob: {
        include: {
          tasks: {
            select: { zipCode: true },
            take: 1,
          },
        },
      },
    },
    take: LIMIT,
    orderBy: { emailScrapedAt: 'desc' },
  });

  if (companies.length === 0) {
    console.log('No premium leads found matching criteria.');
    return;
  }

  const csvRows: string[] = [CSV_HEADERS.join(',')];

  for (const company of companies) {
    const validContacts = company.contacts.filter(
      (c) => c.verificationStatus === 'VALID' && c.workEmail,
    );
    const bestContact = validContacts[0] ?? null;
    const secondContact = validContacts[1] ?? null;

    const taskZip = company.scrapeJob?.tasks?.[0]?.zipCode ?? '';
    const zipCode = taskZip || parseZipFromAddress(company.address);

    const row = [
      escapeCSV(company.name),
      escapeCSV(company.phone),
      escapeCSV(company.website),
      escapeCSV(company.address),
      escapeCSV(company.rating),
      escapeCSV(company.reviewCount),
      escapeCSV(bestContact?.workEmail),
      escapeCSV(secondContact?.workEmail),
      escapeCSV(bestContact?.emailType),
      escapeCSV(bestContact?.confidenceScore),
      escapeCSV(bestContact?.emailSource),
      escapeCSV(bestContact?.verificationStatus),
      escapeCSV(company.scrapeJob?.query),
      escapeCSV(parseStateFromAddress(company.address)),
      escapeCSV(zipCode),
      escapeCSV(company.emailScrapedAt?.toISOString().split('T')[0]),
    ];

    csvRows.push(row.join(','));
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const nicheSlug = NICHE_FILTER
    ? `-${NICHE_FILTER.toLowerCase().replace(/\s+/g, '-')}`
    : '';
  const outputPath = CUSTOM_OUTPUT
    ?? path.join(exportsDir, `premium-leads${nicheSlug}-${timestamp}.csv`);

  fs.writeFileSync(outputPath, csvRows.join('\n') + '\n', 'utf8');
  console.log(`Exported ${companies.length} premium leads to ${outputPath}`);
}

main()
  .catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
