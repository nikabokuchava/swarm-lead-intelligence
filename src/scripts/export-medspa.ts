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

// --- Tier definitions ---

const TIERS = [
  { name: 'medspa-starter-500', limit: 500 },
  { name: 'medspa-growth-1000', limit: 1000 },
  { name: 'medspa-agency-5000', limit: 5000 },
] as const;

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
  'Company Name',
  'Phone',
  'Website',
  'Address',
  'Email',
  'AI Confidence',
  'MX Provider',
];

interface LeadRow {
  companyName: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  email: string;
  confidenceScore: number | null;
  mxProvider: string | null;
}

async function main(): Promise<void> {
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  // Fetch all medspa companies with at least one VALID contact,
  // ordered by best contact confidence descending
  const companies = await prisma.company.findMany({
    where: {
      emailScraped: true,
      scrapeJob: {
        query: { contains: 'medspa', mode: 'insensitive' },
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
        orderBy: { confidenceScore: 'desc' },
        take: 1, // one primary contact per company (dedup)
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Build deduplicated lead rows (one email per company)
  const seenEmails = new Set<string>();
  const leads: LeadRow[] = [];

  for (const company of companies) {
    const contact = company.contacts[0];
    if (!contact?.workEmail) continue;

    const emailLower = contact.workEmail.toLowerCase();
    if (seenEmails.has(emailLower)) continue;
    seenEmails.add(emailLower);

    leads.push({
      companyName: company.name,
      phone: company.phone,
      website: company.website,
      address: company.address,
      email: contact.workEmail,
      confidenceScore: contact.confidenceScore,
      mxProvider: contact.mxProvider,
    });
  }

  console.log(`Total deduplicated MedSpa leads with VALID emails: ${leads.length}`);

  // Export each tier
  for (const tier of TIERS) {
    const tierLeads = leads.slice(0, tier.limit);

    if (tierLeads.length === 0) {
      console.log(`[${tier.name}] No leads available — skipped.`);
      continue;
    }

    const rows: string[] = [CSV_HEADERS.join(',')];

    for (const lead of tierLeads) {
      rows.push([
        escapeCSV(lead.companyName),
        escapeCSV(lead.phone),
        escapeCSV(lead.website),
        escapeCSV(lead.address),
        escapeCSV(lead.email),
        escapeCSV(lead.confidenceScore),
        escapeCSV(lead.mxProvider),
      ].join(','));
    }

    const outputPath = path.join(exportsDir, `${tier.name}.csv`);
    fs.writeFileSync(outputPath, rows.join('\n') + '\n', 'utf8');
    console.log(`[${tier.name}] Exported ${tierLeads.length} leads → ${outputPath}`);
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
