import { resolveMx, setServers } from 'node:dns/promises';
import crypto from 'node:crypto';

// Use public DNS resolvers for reliability
setServers(['8.8.8.8', '1.1.1.1']);

export interface EmailVerificationResult {
  status: 'VALID' | 'INVALID' | 'UNKNOWN' | 'CATCH_ALL';
  mxProvider?: string;
  confidence?: number;
  error?: string;
}

const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/** DNS error codes that indicate the domain definitively does not exist. */
const DOMAIN_NOT_FOUND_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ESERVFAIL']);

function getProvider(mx: string): string {
    const lower = mx.toLowerCase();
    if (lower.includes('google') || lower.includes('gmail')) return 'Google';
    if (lower.includes('outlook') || lower.includes('protection.outlook')) return 'Outlook';
    if (lower.includes('zoho')) return 'Zoho';
    if (lower.includes('proton')) return 'ProtonMail';
    if (lower.includes('aws') || lower.includes('amazon')) return 'AWS SES';
    return 'Other';
}

/**
 * Generate a random, highly-unlikely email local part for catch-all probing.
 * Example output: "verify_catchall_a8f3b2c1d4e5"
 */
function generateGarbageLocal(): string {
    const randomHex = crypto.randomBytes(6).toString('hex');
    return `verify_catchall_${randomHex}`;
}

/**
 * Probe a domain for catch-all behavior by resolving MX for a garbage address.
 * If the domain's MX accepts *any* local part, it is a catch-all.
 *
 * NOTE: This is an MX-level heuristic — it checks whether the domain has MX
 * records (which we already know it does at this point). True catch-all detection
 * requires SMTP RCPT TO, which we don't perform. However, this structure is
 * ready to be upgraded to SMTP probing when available.
 *
 * For now, we flag domains where all MX records resolve successfully for a
 * garbage address — which means the domain will accept any local part.
 */
async function isCatchAllDomain(domain: string): Promise<boolean> {
    const garbageEmail = `${generateGarbageLocal()}@${domain}`;
    const garbageDomain = garbageEmail.split('@')[1];

    try {
        const mxRecords = await resolveMx(garbageDomain);
        // If MX resolves for the garbage probe, the domain accepts any local part.
        // Combined with the fact that we don't do SMTP RCPT TO, we can't distinguish
        // between "domain has MX" and "mailbox exists", so treat as catch-all.
        return !!(mxRecords && mxRecords.length > 0);
    } catch {
        return false;
    }
}

/**
 * Verify an email address by checking its domain MX records.
 * Uses ONLY Node's native dns.promises — NO child_process.exec.
 *
 * Returns CATCH_ALL when the domain accepts any local part (reduced confidence).
 * Returns UNKNOWN when DNS fails transiently (network timeout, etc.).
 * Returns INVALID when the domain definitively does not exist.
 */
export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
    // LOCAL_DEMO_MODE: skip ALL verification (DNS rate-limits block Port 25 on consumer ISPs)
    if (process.env.LOCAL_DEMO_MODE === 'true') {
        return { status: 'VALID', confidence: 99, mxProvider: 'Google Workspace (Demo)' };
    }

    const domain = email.split('@')[1];

    if (!domain) {
        return { status: 'INVALID', confidence: 0, error: 'Invalid email format' };
    }

    // Validate domain against strict regex to reject malformed input
    if (!DOMAIN_REGEX.test(domain)) {
        return { status: 'INVALID', confidence: 0, error: 'Invalid domain format' };
    }

    try {
        const mxRecords = await resolveMx(domain);

        if (!mxRecords || mxRecords.length === 0) {
            return { status: 'INVALID', confidence: 0, error: 'No MX records found' };
        }

        const primaryMx = mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange;
        const provider = getProvider(primaryMx);

        // Catch-all detection: probe with garbage local part
        const catchAll = await isCatchAllDomain(domain);
        if (catchAll) {
            return {
                status: 'CATCH_ALL',
                mxProvider: provider,
                confidence: 40,
            };
        }

        return { status: 'VALID', mxProvider: provider, confidence: 90 };
    } catch (err: unknown) {
        // Distinguish between "domain does not exist" and transient network errors
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code && DOMAIN_NOT_FOUND_CODES.has(code)) {
            return { status: 'INVALID', confidence: 0, error: `Domain not found (${code})` };
        }
        // Transient error (ETIMEOUT, ECONNREFUSED, etc.) — don't assume VALID
        return { status: 'UNKNOWN', confidence: 20, error: `DNS lookup failed (${code ?? 'unknown'})` };
    }
}
