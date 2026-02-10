import sanitizeHtml from 'sanitize-html';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai'; 

// Schema for structured output
const EmailExtractionSchema = z.object({
  email: z.string().email(),
  confidence: z.number().min(0).max(100),
  source: z.enum(['REGEX', 'LLM', 'HYBRID']),
  type: z.enum(['personal', 'generic', 'unknown']).optional(),
});

type EmailExtractionResult = z.infer<typeof EmailExtractionSchema>;

export class HybridParser {
  private openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY, // Ensure this is set
  });

  /**
   * Main entry point: Extract emails from raw HTML.
   * Pipeline: Mailto Scan -> Sanitize -> Regex (Standard + Obfuscated) -> Filter -> (Optional) LLM
   */
  async extract(rawHtml: string, useLlmInfo: boolean = false): Promise<EmailExtractionResult[]> {
    const findings: EmailExtractionResult[] = [];

    // Step 0: Extract mailto links (before sanitization strips attributes)
    const mailtoMatches = rawHtml.match(/href=["']mailto:([^"']+)["']/gi);
    if (mailtoMatches) {
        mailtoMatches.forEach(match => {
            const email = match.replace(/href=["']mailto:/i, '').replace(/["']$/, '');
            if (this.isValidEmail(email)) {
                findings.push({
                    email: email.toLowerCase(),
                    confidence: 100,
                    source: 'REGEX',
                    type: 'unknown'
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
    let uniqueFindings = this.deduplicateAndFilter(findings);

    if (uniqueFindings.length > 0) {
        return uniqueFindings;
    }

    // Step 3: LLM Fallback (only if requested and regex failed)
    if (useLlmInfo && process.env.OPENAI_API_KEY) {
        const llmResults = await this.extractWithLlm(cleanText);
        return this.deduplicateAndFilter([...uniqueFindings, ...llmResults]);
    }

    return [];
  }

  private sanitize(html: string): string {
    // Strip everything except text. No scripts, no iframes, no comments.
    return sanitizeHtml(html, {
      allowedTags: [], // No tags allowed, just text content
      allowedAttributes: {},
    });
  }

  private extractWithRegex(text: string): EmailExtractionResult[] {
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
    const matches = text.match(emailRegex);
    
    if (!matches) return [];

    return matches.map(email => ({
        email: email.toLowerCase(),
        confidence: 80, 
        source: 'REGEX',
        type: 'unknown'
    }));
  }

  private extractObfuscated(text: string): EmailExtractionResult[] {
    // Matches: user [at] domain [dot] com (and variations)
    const obfRegex = /([a-zA-Z0-9._-]+)\s*\[at\]\s*([a-zA-Z0-9._-]+)\s*\[dot\]\s*([a-zA-Z0-9._-]+)/gi;
    const matches = [...text.matchAll(obfRegex)];
    
    return matches.map(m => {
        const email = `${m[1]}@${m[2]}.${m[3]}`.toLowerCase();
        return {
            email: email,
            confidence: 60, // Lower confidence for obfuscated
            source: 'REGEX',
            type: 'unknown'
        };
    });
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private deduplicateAndFilter(results: EmailExtractionResult[]): EmailExtractionResult[] {
      const seen = new Set<string>();
      return results.filter(r => {
          const email = r.email.toLowerCase();
          
          // Deduplicate
          if (seen.has(email)) return false;
          seen.add(email);

          // Filter placeholders
          if (email.includes('example.com') || email.includes('email.com') || email.includes('domain.com')) return false;
          
          return true;
      });
  }

  private async extractWithLlm(text: string): Promise<EmailExtractionResult[]> {
     try {
        const model = this.openai('gpt-4-turbo'); // Or gpt-3.5-turbo based on budget
        
        // Truncate text if too long to save tokens
        const truncatedText = text.slice(0, 15000); 

        const { object } = await generateObject({
            model: model,
            schema: z.object({ emails: z.array(EmailExtractionSchema) }),
            prompt: `
              Analyze the following text from a company website and extract valid email addresses.
              Focus on contact emails (info@, sales@) or specific people.
              Ignore placeholder examples like 'email@example.com'.
              
              Text content:
              ${truncatedText}
            `,
        });

        // Map results to ensure source is set correctly if LLM doesn't redundant it,
        // though Zod should enforce it. We force it here to be safe and match our internal type.
        return object.emails.map(e => ({
            ...e,
            source: 'LLM' as const
        }));
     } catch (error) {
         console.warn("LLM extraction failed:", error);
         return [];
     }
  }
}
