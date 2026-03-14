import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const samplesDir = path.join(rootDir, 'samples');

const prisma = new PrismaClient();
const openai = createOpenAI({});
const LIMIT = 20;

function parseDayArg(): number {
  const idx = process.argv.indexOf('--day');
  if (idx === -1 || idx + 1 >= process.argv.length) return 1;
  const parsed = parseInt(process.argv[idx + 1], 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

const DAY = parseDayArg();
const OUTPUT_FILE = `day${DAY}-followups.md`;

const SYSTEM_PROMPT = `You are a cold email copywriter for TrueBase, an AI-verified contact data platform for agencies.
You are writing a SHORT follow-up ("bump") email for a lead that did not reply to the initial outreach.

STRICT RULES:
- Output ONLY the email body. No commentary, no labels, no "Body:" prefix.
- The email must be under 50 words (excluding sign-off).
- Do NOT include a subject line — the subject is pre-set as a reply thread.
- You must mention email confidence scores exactly once.
- Include the free 50-lead offer.
- Sign off as: — Nick Bokuchava, Founder, TrueBase
- If the contact name is "Unknown" or empty, address to "Team at [Company Name]".

TEMPLATE (Follow-Up / Bump):

Hi [First Name],

Just bumping this up — happy to send the 50 free [Niche] leads whenever you're ready.

One thing I'll mention: our data includes email confidence scores that most tools don't expose. Let me know if you'd want a look.

— Nick Bokuchava, Founder, TrueBase

Personalize lightly using the lead data provided. Replace [Niche] with the agency's focus area inferred from their name/website. Keep the tone casual and brief.`;

interface FollowUpDraft {
  companyName: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  body: string;
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
      scrapeJob: { select: { query: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (DAY - 1) * LIMIT,
    take: LIMIT,
  });

  if (companies.length === 0) {
    console.log(`No leads found for day ${DAY}. Pagination may have exceeded available leads.`);
    return;
  }

  console.log(`Found ${companies.length} leads for day ${DAY} follow-ups. Generating...\n`);

  const drafts: FollowUpDraft[] = [];
  const subject = "re: whats your list bounce rate?";

  for (const company of companies) {
    const contact = company.contacts[0];
    const contactName = contact?.fullName && contact.fullName !== 'Unknown'
      ? contact.fullName
      : '';
    const contactEmail = contact?.workEmail ?? company.emails[0] ?? '';
    const niche = company.scrapeJob?.query ?? 'marketing';

    const userPrompt = `Lead data:
- Company: ${company.name}
- Website: ${company.website ?? 'N/A'}
- Contact Name: ${contactName || 'Unknown'}
- Contact Email: ${contactEmail}
- Niche/Query: ${niche}

Generate a personalized follow-up bump email. Keep it under 50 words.`;

    try {
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 200,
        temperature: 0.7,
      });

      const body = result.text
        .replace(/^Subject:\s*.+\n*/im, '')
        .replace(/^Body:\s*/im, '')
        .trim();

      drafts.push({
        companyName: company.name,
        contactName: contactName || `Team at ${company.name}`,
        contactEmail,
        subject,
        body,
      });

      console.log(`  [${drafts.length}/${companies.length}] ${company.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [SKIP] ${company.name}: ${msg}`);
    }
  }

  const lines: string[] = [
    `# Day ${DAY} Follow-Up Emails (Bump)`,
    `> Generated: ${new Date().toISOString().slice(0, 10)} | Leads: ${drafts.length}`,
    `> Subject for all: \`${subject}\``,
    '',
  ];

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    lines.push(`---`);
    lines.push(`## ${i + 1}. ${d.companyName}`);
    lines.push(`**To:** ${d.contactName} <${d.contactEmail}>`);
    lines.push(`**Subject:** ${d.subject}`);
    lines.push('');
    lines.push(d.body);
    lines.push('');
  }

  const outputPath = path.join(samplesDir, OUTPUT_FILE);
  fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
  console.log(`\nSaved ${drafts.length} follow-ups → ${outputPath}`);
}

main()
  .catch((err) => {
    console.error('Generation failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
