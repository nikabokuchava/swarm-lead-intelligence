import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const prisma = new PrismaClient();

const MICRO_NICHE = 'HVAC contractors';

const INVALID_NAMES = ['not', 'n/a', 'unknown', 'unspecified', 'team', 'none', 'null'];
const ROLE_WORDS = ['ceo', 'founder', 'founders', 'owner', 'president', 'director', 'manager', 'partner', 'vp', 'staff', 'admin', 'info', 'contact', 'sales', 'marketing', 'support', 'hello', 'hi', 'creative', 'creatives', 'consulting', 'services', 'media', 'digital', 'agency', 'team', 'general'];

function getFirstName(fullName: string | null | undefined, companyName: string): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (INVALID_NAMES.includes(lower)) return null;
  // Check if entire name is role-based (e.g. "Founder/CEO", "Founders and Creatives")
  const lowerTokens = lower.split(/[\s/,&]+/);
  if (lowerTokens.every((t) => ROLE_WORDS.includes(t) || t === 'and' || t === 'at' || t === 'of' || t.length < 2)) return null;
  const first = trimmed.split(/\s+/)[0];
  if (!first || first.length < 2) return null;
  const firstLower = first.toLowerCase();
  if (INVALID_NAMES.includes(firstLower)) return null;
  if (ROLE_WORDS.includes(firstLower)) return null;
  // Check if first word contains role via slash (e.g. "Founder/Owner")
  const firstSlashTokens = firstLower.split('/');
  if (firstSlashTokens.length > 1 && firstSlashTokens.every((t) => ROLE_WORDS.includes(t) || t.length < 2)) return null;
  if (companyName && companyName.toLowerCase().startsWith(firstLower)) return null;
  return first;
}

function buildSubject(firstName: string | null, companyName: string): string {
  const tag = firstName ? firstName.toLowerCase() : companyName.toLowerCase();
  return `${tag} — what's your list bounce rate?`;
}

function buildBody(firstName: string | null, companyName: string): string {
  const greeting = firstName ? `Hi ${firstName}` : `Hi Team at ${companyName}`;
  return (
    `${greeting},\n\n` +
    `I built an AI tool that finds verified decision-maker emails for ${MICRO_NICHE} — ` +
    `not scraped lists, but MX-verified contacts with 90%+ confidence scores.\n\n` +
    `Most agencies I talk to waste hours on ZoomInfo or Apollo for local trades and still get 30-40% bounce rates. ` +
    `Our data consistently hits under 5%.\n\n` +
    `I put together a free sample of 50 ${MICRO_NICHE} leads in your area — owners and GMs with verified emails. ` +
    `Want me to send it over?\n\n` +
    `— Nick Bokuchava, Founder, TrueBase`
  );
}

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const contacts = await prisma.contact.findMany({
    where: {
      verificationStatus: 'VALID',
      isCLevel: true,
      scrapeJob: {
        query: { contains: 'Marketing Agency' },
      },
    },
    include: {
      company: true,
    },
    orderBy: { confidenceScore: 'desc' },
  });

  if (contacts.length === 0) {
    console.log('No valid C-Level Marketing Agency contacts found.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${contacts.length} valid C-Level agency contacts.`);

  const headers = ['Company Name', 'Contact Name', 'Email', 'Subject', 'Email Body'];
  const csvRows = [headers.join(',')];

  for (const c of contacts) {
    const firstName = getFirstName(c.fullName, c.company.name);
    const subject = buildSubject(firstName, c.company.name);
    const body = buildBody(firstName, c.company.name);

    // Verify no raw brackets remain
    if (subject.includes('[') || body.includes('[')) {
      console.error(`BRACKET LEAK in row for ${c.workEmail}`);
      process.exit(1);
    }

    const row = [
      escapeCSV(c.company.name),
      escapeCSV(c.fullName),
      escapeCSV(c.workEmail),
      escapeCSV(subject),
      escapeCSV(body),
    ];
    csvRows.push(row.join(','));
  }

  const csvPath = path.join(rootDir, 'day1-hvac-campaign.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n') + '\n', 'utf8');

  console.log(`Wrote ${contacts.length} rows to ${csvPath}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
