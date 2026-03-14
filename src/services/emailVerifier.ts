import { resolveMx, setServers } from 'node:dns/promises';
import { Socket } from 'node:net';
import crypto from 'node:crypto';

// Use public DNS resolvers for reliability
setServers(['8.8.8.8', '1.1.1.1']);

export interface EmailVerificationResult {
  status: 'VALID' | 'INVALID' | 'UNKNOWN' | 'CATCH_ALL';
  mxProvider?: string;
  confidence?: number;
  error?: string;
}

export interface SmtpProbeResult {
  /** Raw SMTP response code (250, 550, etc.) or null on connection failure */
  code: number | null;
  status: 'VALID' | 'INVALID' | 'UNKNOWN';
  banner?: string;
  error?: string;
}

const SMTP_TIMEOUT_MS = 5000;
const HELO_DOMAIN = 'truebase.cc';
const PROBE_FROM = `ping@${HELO_DOMAIN}`;

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
 * Perform an SMTP RCPT TO probe against a mail server to verify a specific mailbox.
 *
 * Connects to mxExchange:25 via plain TCP, drives the SMTP handshake
 * (HELO → MAIL FROM → RCPT TO → QUIT), and returns the server's verdict.
 *
 * NEVER sends the DATA command — this is a pure address probe.
 */
export function probeSmtp(email: string, mxExchange: string): Promise<SmtpProbeResult> {
    return new Promise((resolve) => {
        const socket = new Socket();
        let buffer = '';
        let step = 0; // 0=greeting, 1=HELO sent, 2=MAIL FROM sent, 3=RCPT TO sent
        let resolved = false;
        let banner = '';

        const finish = (result: SmtpProbeResult) => {
            if (resolved) return;
            resolved = true;
            try { socket.write('QUIT\r\n'); } catch { /* best-effort */ }
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(SMTP_TIMEOUT_MS);

        socket.on('timeout', () => {
            finish({ code: null, status: 'UNKNOWN', banner, error: 'Socket timeout' });
        });

        socket.on('error', (err: NodeJS.ErrnoException) => {
            finish({ code: null, status: 'UNKNOWN', banner, error: `Socket error: ${err.code ?? err.message}` });
        });

        socket.on('close', () => {
            finish({ code: null, status: 'UNKNOWN', banner, error: 'Connection closed unexpectedly' });
        });

        socket.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\r\n');
            buffer = lines.pop() ?? ''; // keep incomplete trailing data

            for (const line of lines) {
                if (!line) continue;
                // Match SMTP response: 3-digit code followed by space (final) or hyphen (continuation)
                const codeMatch = line.match(/^(\d{3})([ -])/);
                if (!codeMatch) continue;

                const code = parseInt(codeMatch[1], 10);
                const isFinal = codeMatch[2] === ' ';

                if (!isFinal) continue; // wait for final line of multi-line response

                if (step === 0) {
                    // 220 greeting
                    banner = line;
                    if (code !== 220) {
                        finish({ code, status: 'UNKNOWN', banner, error: `Unexpected greeting: ${code}` });
                        return;
                    }
                    socket.write(`HELO ${HELO_DOMAIN}\r\n`);
                    step = 1;
                } else if (step === 1) {
                    // HELO response
                    if (code !== 250) {
                        finish({ code, status: 'UNKNOWN', banner, error: `HELO rejected: ${code}` });
                        return;
                    }
                    socket.write(`MAIL FROM:<${PROBE_FROM}>\r\n`);
                    step = 2;
                } else if (step === 2) {
                    // MAIL FROM response
                    if (code !== 250) {
                        finish({ code, status: 'UNKNOWN', banner, error: `MAIL FROM rejected: ${code}` });
                        return;
                    }
                    socket.write(`RCPT TO:<${email}>\r\n`);
                    step = 3;
                } else if (step === 3) {
                    // RCPT TO — the definitive verdict
                    if (code === 250) {
                        finish({ code, status: 'VALID', banner });
                    } else if (code >= 550 && code <= 559) {
                        finish({ code, status: 'INVALID', banner });
                    } else {
                        finish({ code, status: 'UNKNOWN', banner, error: `RCPT TO response: ${code}` });
                    }
                    return;
                }
            }
        });

        socket.connect(25, mxExchange);
    });
}

/**
 * Probe a domain for catch-all behavior via SMTP RCPT TO with a garbage address.
 *
 * If the mail server accepts a random nonexistent local part (250), the domain
 * is a catch-all and individual RCPT TO probes cannot distinguish real from fake
 * mailboxes. If the server rejects it (550), individual probes are meaningful.
 *
 * On SMTP failure (timeout, connection refused), returns false so the caller
 * falls through to the real probe — which will also return UNKNOWN, correctly
 * reflecting our inability to verify.
 */
async function isCatchAllDomain(domain: string, mxExchange: string): Promise<boolean> {
    const garbageEmail = `${generateGarbageLocal()}@${domain}`;
    try {
        const result = await probeSmtp(garbageEmail, mxExchange);
        // Server accepted garbage → catch-all
        return result.status === 'VALID';
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

        // SMTP-level catch-all detection: probe with garbage address
        const catchAll = await isCatchAllDomain(domain, primaryMx);
        if (catchAll) {
            return { status: 'CATCH_ALL', mxProvider: provider, confidence: 40 };
        }

        // SMTP RCPT TO probe for the real mailbox
        const smtpResult = await probeSmtp(email, primaryMx);

        if (smtpResult.status === 'VALID') {
            return { status: 'VALID', mxProvider: provider, confidence: 95 };
        }
        if (smtpResult.status === 'INVALID') {
            return { status: 'INVALID', mxProvider: provider, confidence: 95, error: `SMTP RCPT TO rejected (${smtpResult.code})` };
        }

        // SMTP unreachable — honest about reduced certainty
        return { status: 'UNKNOWN', mxProvider: provider, confidence: 30, error: smtpResult.error };
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
