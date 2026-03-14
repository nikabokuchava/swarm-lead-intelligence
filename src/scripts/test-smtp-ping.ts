import { resolveMx } from 'node:dns/promises';
import { performance } from 'node:perf_hooks';
import { probeSmtp, verifyEmail } from '../services/emailVerifier.js';
import type { SmtpProbeResult, EmailVerificationResult } from '../services/emailVerifier.js';

const DELAY_MS = 2000;

const TEST_EMAILS = [
    'postmaster@gmail.com',                       // should exist
    'thismailboxdoesnotexist_zzzz@gmail.com',     // should not exist
    'test@nonexistent-domain-12345.com',           // domain doesn't exist
    'info@microsoft.com',                          // large provider
];

async function testProbeSmtp(email: string): Promise<void> {
    const domain = email.split('@')[1];
    console.log(`\n--- probeSmtp: ${email} ---`);

    try {
        const mxRecords = await resolveMx(domain);
        if (!mxRecords || mxRecords.length === 0) {
            console.log('  No MX records. Skipping SMTP probe.');
            return;
        }

        const primaryMx = mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange;
        console.log(`  MX: ${primaryMx}`);

        const t0 = performance.now();
        const result: SmtpProbeResult = await probeSmtp(email, primaryMx);
        const elapsed = Math.round(performance.now() - t0);

        console.log(`  Code   : ${result.code ?? 'N/A'}`);
        console.log(`  Status : ${result.status}`);
        console.log(`  Banner : ${result.banner ?? 'N/A'}`);
        if (result.error) console.log(`  Error  : ${result.error}`);
        console.log(`  Time   : ${elapsed}ms`);
    } catch (err) {
        console.error(`  DNS Error: ${err}`);
    }
}

async function testFullFlow(email: string): Promise<void> {
    console.log(`\n--- verifyEmail: ${email} ---`);
    const t0 = performance.now();
    const result: EmailVerificationResult = await verifyEmail(email);
    const elapsed = Math.round(performance.now() - t0);

    console.log(`  Status     : ${result.status}`);
    console.log(`  Confidence : ${result.confidence}`);
    console.log(`  Provider   : ${result.mxProvider ?? 'N/A'}`);
    if (result.error) console.log(`  Error      : ${result.error}`);
    console.log(`  Time       : ${elapsed}ms`);
}

async function main(): Promise<void> {
    console.log('=== SMTP RCPT TO Probe Test ===');

    for (const email of TEST_EMAILS.slice(0, 2)) {
        await testProbeSmtp(email);
        await new Promise<void>(r => setTimeout(r, DELAY_MS));
    }

    console.log('\n\n=== Full verifyEmail Flow ===');

    for (const email of TEST_EMAILS) {
        await testFullFlow(email);
        await new Promise<void>(r => setTimeout(r, DELAY_MS));
    }

    console.log('\n=== Done ===');
}

main().catch((err: unknown) => {
    console.error('Fatal:', err);
    process.exit(1);
});
