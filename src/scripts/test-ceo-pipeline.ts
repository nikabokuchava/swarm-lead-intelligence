/**
 * End-to-End CEO Extraction Pipeline Test
 *
 * Navigates to a live website with StealthBrowser, extracts key people
 * via LLM (HybridParser), generates email patterns, and verifies each
 * sequentially via SMTP.
 *
 * Usage:  npx tsx src/scripts/test-ceo-pipeline.ts
 */

import { StealthBrowser } from '../scraper/stealthBrowser.js';
import { scrapeEmailsFromWebsite } from '../scraper/websiteScraper.js';
import { generateEmailPatterns } from '../utils/emailGuesser.js';
import { verifyEmail, type EmailVerificationResult } from '../services/emailVerifier.js';
import { performance } from 'node:perf_hooks';

const TARGET_URL = 'https://busyseed.com';
const MAX_PAGES = 2;
const ANTI_BAN_DELAY_MS = 1500;
const C_LEVEL_ROLES = ['ceo', 'founder', 'owner', 'co-founder', 'managing director', 'president'];

async function main(): Promise<void> {
    const browser = new StealthBrowser();

    try {
        // ── Step 1: Launch browser & extract website data ────────────────
        console.log(`\n=== CEO Extraction Pipeline ===`);
        console.log(`Target : ${TARGET_URL}`);
        console.log(`Max pages : ${MAX_PAGES}`);
        console.log(`Premium LLM : enabled\n`);

        await browser.launch();
        console.log('Browser launched.\n');

        const t0 = performance.now();
        const result = await scrapeEmailsFromWebsite(browser, TARGET_URL, MAX_PAGES, true);
        const scrapeMs = Math.round(performance.now() - t0);

        console.log(`Scrape completed in ${scrapeMs} ms`);
        console.log(`Pages scraped : ${result.pagesScraped.length}`);
        console.log(`Emails found  : ${result.allEmails.length}`);
        console.log(`Primary email : ${result.primaryEmail ?? 'none'}`);

        if (result.error) {
            console.log(`Scrape error  : ${result.error}`);
        }

        // ── Step 2: Inspect extracted people ─────────────────────────────
        const people = result.extractedPeople ?? [];
        console.log(`\nExtracted people (${people.length}):`);

        if (people.length === 0) {
            console.log('  No people extracted by LLM. Pipeline ends here.');
            return;
        }

        people.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} — ${p.role}`));

        // ── Step 3: Pick the best C-Level candidate ──────────────────────
        const cLevel = people.find((p) =>
            C_LEVEL_ROLES.some((r) => p.role.toLowerCase().includes(r)),
        );
        const target = cLevel ?? people[0];

        console.log(`\nSelected target: ${target.name} (${target.role})`);

        // ── Step 4: Extract domain & generate patterns ───────────────────
        const domain = new URL(TARGET_URL).hostname.replace(/^www\./, '');
        const patterns = generateEmailPatterns(target.name, domain);

        if (patterns.length === 0) {
            console.log('No email patterns generated. Check name/domain.');
            return;
        }

        console.log(`\nGenerated ${patterns.length} pattern(s) for "${target.name}" @ ${domain}:`);
        patterns.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
        console.log('');

        // ── Step 5: Sequential SMTP verification ─────────────────────────
        let matchFound = false;

        for (const email of patterns) {
            console.log(`Verifying: ${email}`);

            const vt0 = performance.now();
            const res: EmailVerificationResult = await verifyEmail(email);
            const elapsed = Math.round(performance.now() - vt0);

            console.log(`  Status   : ${res.status}`);
            console.log(`  Provider : ${res.mxProvider ?? 'N/A'}`);
            console.log(`  Duration : ${elapsed} ms`);

            if (res.status === 'VALID') {
                console.log(`\n  >>> MATCH FOUND: ${email} <<<\n`);
                matchFound = true;
                break;
            }

            console.log(`  Waiting ${ANTI_BAN_DELAY_MS} ms (anti-ban delay)...`);
            await new Promise<void>((r) => setTimeout(r, ANTI_BAN_DELAY_MS));
            console.log('');
        }

        if (!matchFound) {
            console.log('No valid email found across all patterns.');
        }

        console.log('=== Pipeline Complete ===\n');
    } catch (err: unknown) {
        console.error('Pipeline error:', err);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

main().catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
