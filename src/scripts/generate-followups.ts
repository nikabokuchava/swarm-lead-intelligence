import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const prisma = new PrismaClient();
const google = createGoogleGenerativeAI({});
const LIMIT = 60;

// CLI flags
const IS_DAY4 = process.argv.includes('--day4');
const IS_DAY7 = process.argv.includes('--day7');
const IS_POST_SAMPLE = process.argv.includes('--post-sample');

type SequenceMode = 'day3' | 'day4' | 'day7' | 'post-sample';
const MODE: SequenceMode = IS_POST_SAMPLE ? 'post-sample' : IS_DAY7 ? 'day7' : IS_DAY4 ? 'day4' : 'day3';

const OUTPUT_FILE_MAP: Record<SequenceMode, string> = {
  'day3': 'day3-followups-ready.md',
  'day4': 'day4-switch-angle-ready.csv',
  'day7': 'day7-switch-angle-cold.csv',
  'post-sample': 'day5-agency-pitch-fixed.csv',
};
const OUTPUT_FILE = OUTPUT_FILE_MAP[MODE];

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

const DAY7_SYSTEM_PROMPT = `You are a cold email copywriter for TrueBase, an AI-verified contact data platform for agencies.
You are writing a "Decision-Maker Access" angle email — a fresh cold pitch for a prospect who has not engaged with previous outreach. This email pivots to the DECISION-MAKER angle: agencies struggle to reach business owners and decision-makers because generic databases only list info@ and generic roles.

STRICT RULES:
- Output ONLY the email body. No commentary, no labels, no "Body:" prefix.
- The email must be under 75 words (excluding sign-off).
- Do NOT include a subject line — the subject is provided separately.
- The core message: most [Niche] lead lists give you info@ addresses and office managers. TrueBase uses AI to find the actual decision-makers — owners, founders, directors — with a confidence score (0-100) and live MX verification on every email.
- End with the free 50-lead CSV offer: "Want me to send 50 [Niche] leads as a free sample?"
- Sign off as: — Nick Bokuchava, Founder, TrueBase
- If the contact name is "Unknown" or empty, address to "Team at [Company Name]".
- Do NOT mention previous emails, "following up", or "hope the sample was useful". This is a standalone cold pitch.

TEMPLATE (Decision-Maker Access Angle):

Hi [First Name],

Most [Niche] lead lists give you info@ addresses and office managers. We use AI to find the actual decision-makers — owners, founders, directors — with a confidence score (0-100) and live MX verification on every email.

Want me to send 50 [Niche] leads as a free sample? Just say the word.

— Nick Bokuchava, Founder, TrueBase

Personalize lightly using the lead data provided. Replace [Niche] with the agency's focus area inferred from their name/website. Keep the tone casual and direct.`;

const SYSTEM_PROMPT_MAP: Record<SequenceMode, string> = {
  'day3': DAY3_SYSTEM_PROMPT,
  'day4': DAY4_SYSTEM_PROMPT,
  'day7': DAY7_SYSTEM_PROMPT,
  'post-sample': DAY3_SYSTEM_PROMPT, // unused for post-sample (deterministic)
};
const SYSTEM_PROMPT = SYSTEM_PROMPT_MAP[MODE];

// Map agency search query → target client niche (what the agency's CLIENTS are)
const QUERY_TO_TARGET_NICHE: Array<[RegExp, string]> = [
  [/medspa\s+marketing/i, 'MedSpas'],
  [/healthcare\s+marketing/i, 'healthcare practices'],
  [/dental\s+marketing/i, 'dental clinics'],
  [/hvac\s+marketing/i, 'HVAC contractors'],
  [/real\s*estate\s+marketing/i, 'real estate agencies'],
  [/legal\s+marketing|law\s+firm\s+marketing/i, 'law firms'],
  [/fitness\s+marketing|gym\s+marketing/i, 'fitness studios'],
  [/restaurant\s+marketing/i, 'restaurants'],
  [/roofing\s+marketing/i, 'roofing contractors'],
  [/plumbing\s+marketing/i, 'plumbing companies'],
  [/auto\s+marketing|automotive\s+marketing/i, 'auto dealerships'],
  [/insurance\s+marketing/i, 'insurance agencies'],
  [/home\s+services?\s+marketing/i, 'home service businesses'],
];

// CLI override: --target-niche "MedSpas"
const TARGET_NICHE_OVERRIDE = (() => {
  const idx = process.argv.indexOf('--target-niche');
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
})();

function extractTargetNiche(query: string): string {
  if (TARGET_NICHE_OVERRIDE) return TARGET_NICHE_OVERRIDE;

  for (const [pattern, niche] of QUERY_TO_TARGET_NICHE) {
    if (pattern.test(query)) return niche;
  }
  // Generic agencies — offer a broadly useful vertical
  return 'local businesses';
}

function extractCity(query: string): string | null {
  const match = query.match(/\bin\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Post-Sample Close Sequence: Day 5 Agency Pack pitch (deterministic, no LLM)
function buildDay5AgencyPackBody(firstName: string, targetNiche: string, city: string | null): string {
  const nicheWithCity = city ? `${targetNiche} in ${city}` : targetNiche;
  return `Hi ${firstName},\n\nHope the sample was useful. If the quality works for you — Agency Pack = 5,000 leads + weekly refresh + decision-maker emails for $197. Want one for ${nicheWithCity}?\n\n— Nick Bokuchava, Founder, TrueBase`;
}

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
        take: 3,
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
  const subjectMap: Record<SequenceMode, string> = {
    'day3': "re: whats your list bounce rate?",
    'day4': "leads that aren't on apollo",
    'day7': "finding decision-makers your competitors miss",
    'post-sample': "re: your sample leads",
  };
  const subject = subjectMap[MODE];

  for (const company of eligible) {
    // Prefer: named contact with personal email > named contact > any contact
    const namedPersonal = company.contacts.find(
      (c) => c.fullName && c.fullName !== 'Unknown' && c.emailType === 'personal' && c.workEmail
    );
    const namedAny = company.contacts.find(
      (c) => c.fullName && c.fullName !== 'Unknown' && c.workEmail
    );
    const contact = namedPersonal ?? namedAny ?? company.contacts[0];
    const contactName = contact?.fullName && contact.fullName !== 'Unknown'
      ? contact.fullName
      : '';
    const contactEmail = (contact?.workEmail ?? company.emails[0] ?? '').trim();
    const rawQuery = company.scrapeJob?.query ?? 'marketing';
    const targetNiche = extractTargetNiche(rawQuery);
    const city = extractCity(rawQuery);

    // Truncate overly long company names for the Contact Name field
    // Split on " | ", " — ", " - " (with spaces), or ":"  but NOT bare hyphens inside words
    const shortName = company.name.split(/\s*[|—]\s*|\s+- \s*|:\s*/)[0].trim();

    if (MODE === 'post-sample') {
      // Deterministic Day 5 Agency Pack pitch — no LLM call
      const displayName = contactName || `Team at ${shortName}`;
      const firstName = displayName.split(' ')[0];
      const body = buildDay5AgencyPackBody(firstName, targetNiche, city);

      drafts.push({
        companyName: shortName,
        contactName: contactName || `Team at ${shortName}`,
        contactEmail,
        subject,
        body,
      });

      console.log(`  [${drafts.length}/${eligible.length}] ${shortName}`);
      continue;
    }

    const leadData = `Lead data:
- Company: ${company.name}
- Website: ${company.website ?? 'N/A'}
- Contact Name: ${contactName || 'Unknown'}
- Contact Email: ${contactEmail}
- Niche/Query: ${targetNiche}`;

    const userPrompt = MODE === 'day7'
      ? `${leadData}

Generate a "Decision-Maker Access" angle email. Emphasize that most ${targetNiche} lead lists only give info@ addresses — TrueBase finds actual owners and directors. Mention AI confidence scores (0-100) and live MX verification. End with the free 50-lead CSV offer. Under 75 words.`
      : MODE === 'day4'
      ? `${leadData}

Generate a "Hidden Market" angle email. Emphasize that ${targetNiche} businesses are invisible on Apollo/ZoomInfo. Mention AI confidence scores (0-100) and live MX verification. Include the free 50-lead CSV offer. Under 75 words.`
      : `${leadData}

Generate a personalized follow-up bump email. Keep it under 50 words.`;

    try {
      const result = await generateText({
        model: google('gemini-2.5-flash'),
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
          .replace(/\[(?:Micro-Niche|Niche)\]/gi, targetNiche)
          .replace(/\[(?:Company Name|Agency Name)\]/gi, company.name)
          .replace(/\[Your First Name\]/gi, 'Nick')
          .replace(/\[X,000\]/gi, '1,000');
        console.warn(`  [QG-FIX] ${company.name}: raw brackets replaced`);
      }

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

  if (MODE === 'day4' || MODE === 'day7' || MODE === 'post-sample') {
    // CSV output for Day 4 switch-angle and Post-Sample Day 5
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
