import sanitizeHtml from 'sanitize-html';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai'; 

// Schema for structured output — strict-mode compatible (no Zod refinements)
const EmailExtractionSchema = z.object({
  email: z.string(),
  confidence: z.number(),
  source: z.enum(['REGEX', 'LLM', 'HYBRID']),
  type: z.enum(['personal', 'generic', 'unknown']),
});

type EmailExtractionResult = z.infer<typeof EmailExtractionSchema>;

export interface KeyPerson {
  name: string;
  role: string;
}

export interface HybridParserResult {
  emails: EmailExtractionResult[];
  keyPeople: KeyPerson[];
}

// Deterministic email classification — 0ms, 0 tokens, no hallucination
const GENERIC_PREFIXES = new Set([
  'info', 'contact', 'support', 'sales', 'admin', 'hello', 'office',
  'press', 'media', 'marketing', 'careers', 'help', 'team', 'hr',
  'billing', 'legal', 'feedback', 'enquiry', 'enquiries', 'service',
  'noreply', 'no-reply', 'webmaster', 'postmaster', 'abuse',
]);

// gTLDs that signal double-TLD concatenation when found as penultimate domain segment
const SUSPICIOUS_PENULT_TLDS = new Set([
    'com', 'net', 'org', 'edu', 'gov', 'io', 'co', 'info', 'biz', 'dev', 'app',
]);

// Known TLDs for detecting concatenated TLD segments (e.g., "huinfo" = "hu"+"info")
const KNOWN_TLDS = new Set([
    'com', 'net', 'org', 'edu', 'gov', 'io', 'co', 'info', 'biz', 'dev', 'app',
    'hu', 'de', 'fr', 'uk', 'nl', 'at', 'ch', 'it', 'es', 'pt', 'pl', 'cz',
    'se', 'no', 'fi', 'dk', 'be', 'ie', 'ru', 'jp', 'cn', 'kr', 'au', 'nz',
    'ca', 'mx', 'br', 'ar', 'in', 'us', 'za', 'tr', 'il', 'sg', 'hk', 'tw',
    'id', 'pk', 'ng', 'my', 'eg', 'pro',
]);

// Legitimate country-code double TLD pairs (e.g., co.uk, com.au)
const LEGIT_CCTLD_PAIRS = new Set([
    'co.uk', 'com.au', 'co.jp', 'co.kr', 'co.nz', 'co.za', 'co.in',
    'com.br', 'com.mx', 'com.ar', 'com.tr', 'co.il', 'com.sg', 'com.hk',
    'org.uk', 'net.au', 'ac.uk', 'gov.uk', 'edu.au', 'com.cn', 'co.id',
    'com.tw', 'or.jp', 'ne.jp', 'com.pk', 'com.ng', 'com.my',
]);


export class HybridParser {
  private openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
  });

  private classifyEmail(email: string): { type: 'generic' | 'personal', confidence: number } {
    const localPart = email.split('@')[0].toLowerCase();
    if (GENERIC_PREFIXES.has(localPart)) {
      return { type: 'generic', confidence: 70 };
    }
    return { type: 'personal', confidence: 95 };
  }

  /**
   * Main entry point: Extract emails from raw HTML.
   * Pipeline: Mailto Scan -> Sanitize -> Regex (Standard + Obfuscated) -> Filter -> (Optional) LLM
   */
  async extract(rawHtml: string, useLlmInfo: boolean = false): Promise<HybridParserResult> {
    const findings: EmailExtractionResult[] = [];

    // Step 0: Extract mailto links (before sanitization strips attributes)
    const mailtoMatches = rawHtml.match(/href=["']mailto:([^"']+)["']/gi);
    if (mailtoMatches) {
        mailtoMatches.forEach(match => {
            const email = match.replace(/href=["']mailto:/i, '').replace(/["']$/, '');
            if (this.isValidEmail(email)) {
                const classification = this.classifyEmail(email);
                findings.push({
                    email: email.toLowerCase(),
                    confidence: 100, // mailto links are highest confidence source
                    source: 'REGEX',
                    type: classification.type
                });
            }
        });
    }

    // SECURITY: Step 1 - Sanitize HTML strictly
    const cleanText = this.sanitize(rawHtml);

    // Step 2: Fast Regex Scan (Standard)
    const standardMatches = this.extractWithRegex(cleanText);
    findings.push(...standardMatches);

    // Step 2.5: Obfuscated Email Scan (e.g., user [at] domain [dot] com)
    const obfuscatedMatches = this.extractObfuscated(cleanText);
    findings.push(...obfuscatedMatches);

    // Filter duplicates and placeholders
    const uniqueFindings = this.deduplicateAndFilter(findings);

    // Step 3: LLM — always run when requested (extracts people + email fallback)
    if (useLlmInfo && process.env.OPENAI_API_KEY) {
        const llmResult = await this.extractWithLlm(cleanText);
        return {
            emails: this.deduplicateAndFilter([...uniqueFindings, ...llmResult.emails]),
            keyPeople: llmResult.keyPeople,
        };
    }

    return { emails: uniqueFindings, keyPeople: [] };
  }

  private sanitize(html: string): string {
    // Strip everything except text. No scripts, no iframes, no comments.
    return sanitizeHtml(html, {
      allowedTags: [], // No tags allowed, just text content
      allowedAttributes: {},
    });
  }

  private extractWithRegex(text: string): EmailExtractionResult[] {
    // Standard robust email regex: allows +/% in local part, alpha-only TLD (min 2 chars)
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}\b/gi;
    const matches = text.match(emailRegex);

    if (!matches) return [];

    return matches
        .map(email => this.cleanExtractedEmail(email))
        .filter(email => this.isValidEmail(email))
        .map(email => {
            const classification = this.classifyEmail(email);
            return {
                email: email.toLowerCase(),
                confidence: classification.confidence,
                source: 'REGEX' as const,
                type: classification.type
            };
        });
  }

  private cleanExtractedEmail(raw: string): string {
    const atIdx = raw.indexOf('@');
    if (atIdx === -1) return raw;

    let local = raw.substring(0, atIdx);
    let domain = raw.substring(atIdx + 1);

    // Strip leading digits concatenated with alpha (e.g., "6473reservation" → "reservation")
    const stripped = local.replace(/^\d{3,}(?=[a-zA-Z])/, '');
    if (stripped.length > 0) local = stripped;

    // Strip trailing double-TLD from domain (e.g., "clinic.com.can" → "clinic.com")
    const segments = domain.split('.');
    if (segments.length >= 3) {
        const penult = segments[segments.length - 2].toLowerCase();
        const last = segments[segments.length - 1].toLowerCase();
        if (SUSPICIOUS_PENULT_TLDS.has(penult) && !LEGIT_CCTLD_PAIRS.has(`${penult}.${last}`)) {
            segments.pop();
            domain = segments.join('.');
        }
    }

    return `${local}@${domain}`;
  }

  private extractObfuscated(text: string): EmailExtractionResult[] {
    // Matches: user [at] domain [dot] com (and variations)
    const obfRegex = /([a-zA-Z0-9._-]+)\s*\[at\]\s*([a-zA-Z0-9._-]+)\s*\[dot\]\s*([a-zA-Z0-9._-]+)/gi;
    const matches = [...text.matchAll(obfRegex)];

    return matches
        .map(m => {
            const email = `${m[1]}@${m[2]}.${m[3]}`.toLowerCase();
            const classification = this.classifyEmail(email);
            return {
                email: email,
                confidence: Math.min(60, classification.confidence), // Cap at 60 for obfuscated
                source: 'REGEX' as const,
                type: classification.type
            };
        })
        .filter(r => this.isValidEmail(r.email));
  }

  private isValidEmail(email: string): boolean {
    if (!email.includes('@') || !email.includes('.')) return false;

    const domain = email.split('@')[1] || '';
    const tld = domain.split('.').pop() || '';

    // 1. Strict TLD validation (rejects .huinfo, .com-ra)
    if (tld.length > 6 || !/^[a-zA-Z]+$/.test(tld)) return false;

    // 2. Reject emails starting with suspicious concatenated numbers (e.g., 6473reservation)
    if (/^\d{4,}[a-zA-Z]/i.test(email)) return false;

    // 3. Reject emails merged with URLs (e.g., pmwww.domain.cominfo@...)
    if (/^(pm)?www\./i.test(email) || email.includes('http')) return false;

    // 4. Reject TLD that looks like two TLDs concatenated (e.g., "huinfo" = "hu" + "info")
    if (tld.length >= 4) {
        const lowerTld = tld.toLowerCase();
        for (let i = 2; i < lowerTld.length; i++) {
            if (KNOWN_TLDS.has(lowerTld.substring(0, i)) && KNOWN_TLDS.has(lowerTld.substring(i))) {
                return false;
            }
        }
    }

    // 5. Reject known garbage/URL fragment patterns
    if (/follofollo|javascript:|void\(|undefined/i.test(email)) return false;

    // 6. Reject local parts containing embedded domain names (e.g., "gmail.cominfo@...")
    const localPart = email.split('@')[0];
    if (/\.(com|net|org|edu|gov|io|co)\w/i.test(localPart)) return false;

    // 7. Reject local parts that look like phone numbers (e.g., "297-4254florida@...")
    if (/^\d[\d-]{5,}\w/i.test(localPart)) return false;

    return true;
  }

  private deduplicateAndFilter(results: EmailExtractionResult[]): EmailExtractionResult[] {
      const best = new Map<string, EmailExtractionResult>();

      for (const r of results) {
          const email = r.email.toLowerCase();

          // Filter placeholders
          if (email.includes('example.com') || email.includes('email.com') || email.includes('domain.com')) continue;

          // Keep the entry with the highest confidence
          const existing = best.get(email);
          if (!existing || r.confidence > existing.confidence) {
              best.set(email, r);
          }
      }

      const all = Array.from(best.values());

      // Sort: personal emails first, then generic; within each group by confidence desc.
      // Generic emails are always kept — they serve as fallback when no personal email exists.
      return all.sort((a, b) => {
          if (a.type === 'personal' && b.type !== 'personal') return -1;
          if (a.type !== 'personal' && b.type === 'personal') return 1;
          return b.confidence - a.confidence;
      });
  }

  private async extractWithLlm(text: string): Promise<{ emails: EmailExtractionResult[]; keyPeople: KeyPerson[] }> {
     try {
        const model = this.openai(process.env.EMAIL_LLM_MODEL || 'gpt-4o-mini');

        // Truncate text if too long to save tokens
        const truncatedText = text.slice(0, 15000);

        const { object } = await generateObject({
            model: model,
            schema: z.object({
                emails: z.array(EmailExtractionSchema),
                keyPeople: z.array(z.object({
                    name: z.string(),
                    role: z.string(),
                })),
            }),
            prompt: `
              Analyze the following text from a company website and extract:
              1. Valid email addresses. Focus on contact emails (info@, sales@) or specific people.
                 Ignore placeholder examples like 'email@example.com'.
              2. Also extract the names of any Founders, CEOs, or Owners mentioned in the text.

              Text content:
              ${truncatedText}
            `,
        });

        return {
            emails: object.emails.map(e => ({
                ...e,
                confidence: Math.min(100, Math.max(0, e.confidence)),
                source: 'LLM' as const
            })),
            keyPeople: object.keyPeople,
        };
     } catch (error) {
         console.error("❌ LLM extraction FAILED (C-Level inference will not trigger):", error instanceof Error ? error.message : error);
         return { emails: [], keyPeople: [] };
     }
  }
}
