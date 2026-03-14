import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const samplesDir = path.join(rootDir, 'samples');

const prisma = new PrismaClient();
const LIMIT = 20;
const OUTPUT_FILE = 'day1-outreach.csv';

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main(): Promise<void> {
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  const companies = await prisma.company.findMany({
    where: {
      scrapeJob: {
        OR: [
          { query: { contains: 'marketing', mode: 'insensitive' } },
          { query: { contains: 'agency', mode: 'insensitive' } },
        ],
      },
      contacts: {
        some: {
          workEmail: { not: null },
          verificationStatus: 'VALID',
          confidenceScore: { gte: 80 },
        },
      },
    },
    include: {
      contacts: {
        where: {
          workEmail: { not: null },
          verificationStatus: 'VALID',
          confidenceScore: { gte: 80 },
        },
        orderBy: [
          { isCLevel: 'desc' },
          { confidenceScore: 'desc' },
        ],
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: LIMIT,
  });

  if (companies.length === 0) {
    console.log('No companies matching outreach criteria found.');
    return;
  }

  const headers = ['Company Name', 'Website', 'Contact Email'];
  const rows: string[] = [headers.join(',')];

  for (const c of companies) {
    const email = c.contacts[0]?.workEmail ?? c.emails[0] ?? '';
    rows.push([
      escapeCSV(c.name),
      escapeCSV(c.website),
      escapeCSV(email),
    ].join(','));
  }

  const outputPath = path.join(samplesDir, OUTPUT_FILE);
  fs.writeFileSync(outputPath, rows.join('\n') + '\n', 'utf8');

  console.log(`Exported ${companies.length} leads → ${outputPath}\n`);
  console.log('Preview (first 3):');
  for (const c of companies.slice(0, 3)) {
    const email = c.contacts[0]?.workEmail ?? c.emails[0] ?? '—';
    console.log(`  ${c.name} | ${c.website ?? '—'} | ${email}`);
  }
}

main()
  .catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
