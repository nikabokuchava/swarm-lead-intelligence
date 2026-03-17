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

const prisma = new PrismaClient();
const openai = createOpenAI({});
const LIMIT = 60;

// CLI flag: --day4 triggers switch-angle mode
const IS_DAY4 = process.argv.includes('--day4');
const OUTPUT_FILE = IS_DAY4 ? 'day4-switch-angle-ready.csv' : 'day3-followups-ready.md';

const DAY3_SYSTEM_PROMPT = `You are a cold email copywriter for TrueBase, an AI-verified contact data platform for agencies.
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

const DAY4_SYSTEM_PROMPT = `You are a cold email copywriter for TrueBase, an AI-verified contact data platform for agencies.
You are writing a "Switch Angle" email — a NEW angle for a prospect who received the bounce-rate pitch on Day 1 and a short bump on Day 3 but did not reply. This email pivots to the HIDDEN MARKET angle.

STRICT RULES:
- Output ONLY the email body. No commentary, no labels, no "Body:" prefix.
- The email must be under 75 words (excluding sign-off).
- Do NOT include a subject line — the subject is provided separately.
- The core message: their niche businesses are nearly invisible on Apollo and ZoomInfo. TrueBase surfaces direct emails from Google Maps + company websites using AI, with a confidence score (0-100) per contact and live MX verification.
- Include the free 50-lead CSV offer.
- Mention BOTH: AI confidence score (0-100) AND live MX verification.
- Sign off as: — Nick Bokuchava, Founder, TrueBase
- If the contact name is "Unknown" or empty, address to "Team at [Company Name]".
- Do NOT mention the previous emails or say "following up". This is a fresh angle, not a bump.

TEMPLATE (Hidden Market Angle):

Hi [First Name],

Quick context: [Niche] businesses are nearly invisible on Apollo and ZoomInfo. We use an AI pipeline to surface their direct emails from Google Maps + company websites — with a confidence score (0-100) per contact and live MX verification on every domain.

Want me to send 50 [Niche] leads as a free sample? Just say the word.

— Nick Bokuchava, Founder, TrueBase

Personalize lightly using the lead data provided. Replace [Niche] with the agency's focus area inferred from their name/website. Keep the tone casual and confident.`;

const SYSTEM_PROMPT = IS_DAY4 ? DAY4_SYSTEM_PROMPT : DAY3_SYSTEM_PROMPT;

interface FollowUpDraft {
  companyName: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  body: string;
}

// Keywords that identify actual marketing/lead-gen agencies (buyers)
const AGENCY_KEYWORDS = [
  'marketing', 'agency', 'seo', 'digital', 'media', 'creative',
  'advertising', 'branding', 'consulting', 'consultants', 'communications',
  'pr ', 'public relations', 'growth', 'demand', 'leadgen', 'lead gen',
  'outbound', 'promotions', 'promotional',
];

// Keywords that identify target businesses (NOT buyers)
const TARGET_KEYWORDS = [
  'medspa', 'med spa', 'medical spa', 'aesthetics', 'aesthetic',
  'health plan', 'healthcare', 'hospital', 'dental', 'clinic',
  'weightloss', 'weight loss', 'laser spa', 'wellness',
  'plumped', 'liftify',
];

function isLikelyAgency(name: string): boolean {
  const lower = name.toLowerCase();
  // Reject if it matches a target business pattern
  if (TARGET_KEYWORDS.some((kw) => lower.includes(kw))) return false;
  // Accept if it matches an agency pattern
  return AGENCY_KEYWORDS.some((kw) => lower.includes(kw));
}

function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  // Must match basic email pattern: local@domain.tld
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
  if (!emailRegex.test(trimmed)) return false;
  // Reject if local part starts with non-alpha (phone numbers concatenated)
  if (/^[^a-zA-Z]/.test(trimmed)) return false;
  // Reject corrupted TLDs: known TLD with junk appended (e.g., .comphone, .commy)
  const tld = trimmed.split('.').pop()?.toLowerCase() ?? '';
  const CORRUPTED_TLD = /^(com|net|org|io|co)[a-z]+$/i;
  if (CORRUPTED_TLD.test(tld) && tld.length > 3) return false;
  // Reject known placeholders
  if (trimmed.includes('filler@')) return false;
  return true;
}

async function main(): Promise<void> {
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
    take: LIMIT,
  });

  if (companies.length === 0) {
    console.log('No leads found matching criteria.');
    return;
  }

  console.log(`Fetched ${companies.length} leads. Filtering for agencies with valid emails...\n`);

  // Filter: only real agencies with valid emails
  const eligible = companies.filter((c) => {
    const email = c.contacts[0]?.workEmail ?? c.emails[0] ?? '';
    if (!isLikelyAgency(c.name)) {
      console.log(`  [SKIP-TARGET] ${c.name} — not an agency`);
      return false;
    }
    if (!isValidEmail(email)) {
      console.log(`  [SKIP-EMAIL] ${c.name} — invalid email: ${email}`);
      return false;
    }
    return true;
  });

  console.log(`\n${eligible.length} agencies passed filters (${companies.length - eligible.length} excluded). Generating...\n`);

  const drafts: FollowUpDraft[] = [];
  const subject = IS_DAY4
    ? "leads that aren't on apollo"
    : "re: whats your list bounce rate?";

  for (const company of eligible) {
    const contact = company.contacts[0];
    const contactName = contact?.fullName && contact.fullName !== 'Unknown'
      ? contact.fullName
      : '';
    const contactEmail = (contact?.workEmail ?? company.emails[0] ?? '').trim();
    const niche = company.scrapeJob?.query ?? 'marketing';

    const userPrompt = IS_DAY4
      ? `Lead data:
- Company: ${company.name}
- Website: ${company.website ?? 'N/A'}
- Contact Name: ${contactName || 'Unknown'}
- Contact Email: ${contactEmail}
- Niche/Query: ${niche}

Generate a "Hidden Market" angle email. Emphasize that ${niche} businesses are invisible on Apollo/ZoomInfo. Mention AI confidence scores (0-100) and live MX verification. Include the free 50-lead CSV offer. Under 75 words.`
      : `Lead data:
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

      let body = result.text
        .replace(/^Subject:\s*.+\n*/im, '')
        .replace(/^Body:\s*/im, '')
        .trim();

      // Quality gate: strip any raw brackets the LLM left behind
      const bracketPattern = /\[(?:First Name|Micro-Niche|Niche|Company Name|Agency Name|Your First Name|Nick|X,000)\]/gi;
      if (bracketPattern.test(body)) {
        const displayName = contactName || `Team at ${company.name}`;
        body = body
          .replace(/\[First Name\]/gi, displayName.split(' ')[0])
          .replace(/\[(?:Micro-Niche|Niche)\]/gi, niche)
          .replace(/\[(?:Company Name|Agency Name)\]/gi, company.name)
          .replace(/\[Your First Name\]/gi, 'Nick')
          .replace(/\[X,000\]/gi, '1,000');
        console.warn(`  [QG-FIX] ${company.name}: raw brackets replaced`);
      }

      // Truncate overly long company names for the Contact Name field
      // Split on " | ", " — ", " - " (with spaces), or ":"  but NOT bare hyphens inside words
      const shortName = company.name.split(/\s*[|—]\s*|\s+- \s*|:\s*/)[0].trim();
      drafts.push({
        companyName: shortName,
        contactName: contactName || `Team at ${shortName}`,
        contactEmail,
        subject,
        body,
      });

      console.log(`  [${drafts.length}/${eligible.length}] ${shortName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [SKIP] ${company.name}: ${msg}`);
    }
  }

  // Final quality gate: reject any row with remaining raw brackets
  const cleanDrafts = drafts.filter((d) => {
    const hasBrackets = /\[[A-Z]/.test(d.body);
    if (hasBrackets) {
      console.error(`  [QG-REJECT] ${d.companyName}: raw brackets in final output`);
    }
    return !hasBrackets;
  });

  const outputPath = path.join(rootDir, OUTPUT_FILE);

  if (IS_DAY4) {
    // CSV output for Day 4 switch-angle
    const escCsv = (s: string): string => {
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const csvLines: string[] = [
      'Company Name,Contact Name,Contact Email,Subject,Email Body',
    ];
    for (const d of cleanDrafts) {
      csvLines.push(
        [d.companyName, d.contactName, d.contactEmail, d.subject, d.body]
          .map(escCsv)
          .join(',')
      );
    }
    fs.writeFileSync(outputPath, csvLines.join('\n') + '\n', 'utf8');
  } else {
    // Markdown output for Day 3
    const lines: string[] = [
      `# Day 3 Follow-Up Emails (Bump)`,
      `> Generated: ${new Date().toISOString().slice(0, 10)} | Leads: ${cleanDrafts.length}`,
      `> Subject for all: \`${subject}\``,
      '',
    ];
    for (let i = 0; i < cleanDrafts.length; i++) {
      const d = cleanDrafts[i];
      lines.push(`---`);
      lines.push(`## ${i + 1}. ${d.companyName}`);
      lines.push(`**To:** ${d.contactName} <${d.contactEmail}>`);
      lines.push(`**Subject:** ${d.subject}`);
      lines.push('');
      lines.push(d.body);
      lines.push('');
    }
    fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
  }

  console.log(`\nSaved ${cleanDrafts.length} follow-ups → ${outputPath}`);
  if (cleanDrafts.length < drafts.length) {
    console.warn(`  ${drafts.length - cleanDrafts.length} leads rejected by quality gate`);
  }
}

main()
  .catch((err) => {
    console.error('Generation failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
