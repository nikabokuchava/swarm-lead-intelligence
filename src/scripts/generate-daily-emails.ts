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
const OUTPUT_FILE = `day${DAY}-emails.md`;

const SYSTEM_PROMPT = `You are a cold email copywriter for TrueBase, an AI-verified contact data platform for agencies.

STRICT RULES:
- Output ONLY the subject line and email body. No commentary, no labels beyond "Subject:" and "Body:".
- The email must be under 100 words.
- Subject line must be entirely lowercase.
- You must mention AI confidence score (0–100) and MX verification exactly once.
- Include the free 50-lead offer.
- Sign off as: — Nick Bokuchava, Founder, TrueBase
- If the contact name is "Unknown" or empty, address to "Team at [Company Name]".

TEMPLATE (Bounce Rate Angle):
Subject: [first name] — what's your list bounce rate?

Hi [First Name],

Quick one — if you're running cold email for your clients, bounce rate is probably your #1 deliverability killer.

We build AI-verified contact lists specifically for agencies. Every email comes with an AI confidence score (0–100) and live MX verification — so you know exactly what you're sending before you send it.

I'd like to send you 50 [Niche] leads free. No strings. Just reply "yes" and I'll drop the CSV in this thread.

— Nick Bokuchava, Founder, TrueBase

Personalize the template using the lead data provided. Replace [Niche] with the agency's focus area inferred from their name/website. Keep the core structure intact.`;

interface EmailDraft {
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
    console.log(`No more leads found for day ${DAY}. Pagination may have exceeded available leads.`);
    return;
  }

  console.log(`Found ${companies.length} leads. Generating emails...\n`);

  const drafts: EmailDraft[] = [];

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

Generate a personalized cold email using the Bounce Rate Angle template.
Output format:
Subject: <subject line>
Body:
<email body>`;

    try {
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 300,
        temperature: 0.7,
      });

      const text = result.text.trim();
      const subjectMatch = text.match(/^Subject:\s*(.+)/im);
      const bodyMatch = text.match(/Body:\s*([\s\S]+)/im);

      let body = bodyMatch?.[1]?.trim() ?? text;
      // Strip duplicate subject line the LLM sometimes echoes at the top of the body
      if (subjectMatch) {
        body = body.replace(/^Subject:\s*.+\n*/im, '').trim();
      }

      drafts.push({
        companyName: company.name,
        contactName: contactName || `Team at ${company.name}`,
        contactEmail,
        subject: subjectMatch?.[1]?.trim() ?? `${contactName || company.name} — what's your list bounce rate?`,
        body,
      });

      console.log(`  [${drafts.length}/${companies.length}] ${company.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [SKIP] ${company.name}: ${msg}`);
    }
  }

  // Build markdown output
  const lines: string[] = [
    `# Day ${DAY} Outreach Emails`,
    `> Generated: ${new Date().toISOString().slice(0, 10)} | Leads: ${drafts.length}`,
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
  console.log(`\nSaved ${drafts.length} emails → ${outputPath}`);
}

main()
  .catch((err) => {
    console.error('Generation failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
