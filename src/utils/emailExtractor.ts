/**
 * Email Extractor Utility
 * Extracts email addresses from HTML content
 */

// Email regex pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Common false positive patterns to filter out
const FALSE_POSITIVES = [
    /^\d+x\d+@/i,           // image dimensions like 2x@
    /^[^@]+@\d+x\./i,       // image@2x.png
    /example\.com$/i,        // example.com domains
    /test\.com$/i,           // test.com domains
    /placeholder/i,          // placeholder emails
    /your-?email/i,          // your-email@...
    /email@email/i,          // email@email.com
    /noreply/i,              // noreply addresses
    /no-reply/i,             // no-reply addresses
];

// Common valid business email patterns (boost confidence)
const VALID_PATTERNS = [
    /^(info|contact|hello|support|sales|admin)@/i,
    /^[a-z]+\.[a-z]+@/i,  // first.last@
];

interface ExtractedEmail {
    email: string;
    confidence: 'high' | 'medium' | 'low';
    source: 'mailto' | 'text' | 'href';
}

/**
 * Extract emails from HTML content
 */
export function extractEmailsFromHtml(html: string): ExtractedEmail[] {
    const emails: Map<string, ExtractedEmail> = new Map();

    // 1. Extract from mailto: links (highest confidence)
    const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    let match;
    while ((match = mailtoRegex.exec(html)) !== null) {
        const email = match[1].toLowerCase();
        if (isValidEmail(email)) {
            emails.set(email, { email, confidence: 'high', source: 'mailto' });
        }
    }

    // 2. Extract from href attributes
    const hrefRegex = /href=["'][^"']*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[^"']*?["']/gi;
    while ((match = hrefRegex.exec(html)) !== null) {
        const email = match[1].toLowerCase();
        if (isValidEmail(email) && !emails.has(email)) {
            emails.set(email, { email, confidence: 'medium', source: 'href' });
        }
    }

    // 3. Extract from plain text
    const textEmails = html.match(EMAIL_REGEX) || [];
    for (const rawEmail of textEmails) {
        const email = rawEmail.toLowerCase();
        if (isValidEmail(email) && !emails.has(email)) {
            const confidence = getConfidence(email);
            emails.set(email, { email, confidence, source: 'text' });
        }
    }

    return Array.from(emails.values());
}

/**
 * Check if email is valid and not a false positive
 */
function isValidEmail(email: string): boolean {
    // Basic format check
    if (!email.includes('@') || !email.includes('.')) {
        return false;
    }

    // Check against false positives
    for (const pattern of FALSE_POSITIVES) {
        if (pattern.test(email)) {
            return false;
        }
    }

    // Check TLD length (at least 2 chars)
    const tld = email.split('.').pop() || '';
    if (tld.length < 2 || tld.length > 10) {
        return false;
    }

    return true;
}

/**
 * Determine confidence level for an email
 */
function getConfidence(email: string): 'high' | 'medium' | 'low' {
    for (const pattern of VALID_PATTERNS) {
        if (pattern.test(email)) {
            return 'high';
        }
    }
    return 'medium';
}

/**
 * Extract best email from a list (highest confidence first)
 */
export function getBestEmail(emails: ExtractedEmail[]): string | null {
    if (emails.length === 0) return null;

    // Sort by confidence
    const sorted = [...emails].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.confidence] - order[b.confidence];
    });

    return sorted[0].email;
}

/**
 * Get all unique email addresses
 */
export function getAllEmails(emails: ExtractedEmail[]): string[] {
    return emails.map(e => e.email);
}
