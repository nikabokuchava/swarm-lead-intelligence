import { generateEmailPatterns } from '../utils/emailGuesser.js';
import { verifyEmail, type EmailVerificationResult } from '../services/emailVerifier.js';
import { performance } from 'node:perf_hooks';

const ANTI_BAN_DELAY_MS = 1500;

async function main(): Promise<void> {
    const name = 'Omar Jenblat';
    const domain = 'busyseed.com';

    console.log(`\n--- Premium Email Test ---`);
    console.log(`Target : ${name}`);
    console.log(`Domain : ${domain}\n`);

    const patterns: string[] = generateEmailPatterns(name, domain);

    if (patterns.length === 0) {
        console.log('No patterns generated. Check name/domain input.');
        return;
    }

    console.log(`Generated ${patterns.length} pattern(s):`);
    patterns.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    console.log('');

    for (const email of patterns) {
        console.log(`Testing: ${email}`);

        const t0: number = performance.now();
        const result: EmailVerificationResult = await verifyEmail(email);
        const elapsed: number = Math.round(performance.now() - t0);

        console.log(`  Status   : ${result.status}`);
        console.log(`  Provider : ${result.mxProvider ?? 'N/A'}`);
        console.log(`  Duration : ${elapsed} ms`);

        if (result.status === 'VALID') {
            console.log(`\n  >>> MATCH FOUND: ${email} <<<\n`);
            break;
        }

        console.log(`  Waiting ${ANTI_BAN_DELAY_MS} ms (anti-ban delay)...`);
        await new Promise<void>((r) => setTimeout(r, ANTI_BAN_DELAY_MS));
        console.log('');
    }

    console.log('--- Test Complete ---\n');
}

main().catch((err: unknown) => {
    console.error('Unhandled error during premium test:', err);
    process.exit(1);
});
