import { resolveMx, setServers } from 'node:dns/promises';

// Use public DNS resolvers for reliability
setServers(['8.8.8.8', '1.1.1.1']);

export interface EmailVerificationResult {
  status: 'VALID' | 'INVALID' | 'UNKNOWN';
  mxProvider?: string;
  error?: string;
}

const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

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
 * Verify an email address by checking its domain MX records.
 * Uses ONLY Node's native dns.promises — NO child_process.exec.
 */
export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
    const domain = email.split('@')[1];

    if (!domain) {
        return { status: 'INVALID', error: 'Invalid email format' };
    }

    // Validate domain against strict regex to reject malformed input
    if (!DOMAIN_REGEX.test(domain)) {
        return { status: 'INVALID', error: 'Invalid domain format' };
    }

    try {
        const mxRecords = await resolveMx(domain);

        if (!mxRecords || mxRecords.length === 0) {
            return { status: 'INVALID', error: 'No MX records found' };
        }

        const primaryMx = mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange;
        return { status: 'VALID', mxProvider: getProvider(primaryMx) };
    } catch (error: any) {
        if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
            return { status: 'INVALID', error: 'Domain not found' };
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEOUT' || error.code === 'EAI_AGAIN') {
            return { status: 'UNKNOWN', error: `DNS resolution failed: ${error.code}` };
        }
        return { status: 'UNKNOWN', error: error.message };
    }
}
