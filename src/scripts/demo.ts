/**
 * Swarm Lead Intelligence — One-Command Live Showcase Demo
 *
 * Demonstrates:
 * 1. Headless stealth browser navigation
 * 2. Hybrid regex + LLM extraction
 * 3. C-Level pattern inference
 * 4. DNS/MX and SMTP email verification
 *
 * Run via: npm run demo
 */
import { StealthBrowser } from '../scraper/stealthBrowser.js';
import { scrapeEmailsFromWebsite } from '../scraper/websiteScraper.js';
import { generateEmailPatterns } from '../utils/emailGuesser.js';
import { verifyEmail } from '../services/emailVerifier.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TARGET_URL = process.env.DEMO_URL || 'https://busyseed.com';

/**
 * Format lead into ASCII table row
 */
export function formatLead(name: string, email: string, confidence: number): string {
    return `| ${name.padEnd(20)} | ${email.padEnd(25)} | ${String(confidence).padStart(3)}% |`;
}

export async function runDemo(): Promise<void> {
    console.log('\n======================================================');
    console.log('   SWARM LEAD INTELLIGENCE — LIVE PIPELINE DEMO');
    console.log('======================================================\n');
    console.log(`🎯 Target Website: ${TARGET_URL}`);
    console.log(`🤖 Mode: Live Headless Crawl + LLM Extraction\n`);

    const browser = new StealthBrowser();
    try {
        console.log('⏳ Launching Stealth Browser...');
        await browser.launch();
        console.log('✅ Browser ready.\n');

        console.log(`⏳ Crawling ${TARGET_URL} for contact info & executives...`);
        const result = await scrapeEmailsFromWebsite(browser, TARGET_URL, 2, true);

        console.log(`\n📊 Crawl Results:`);
        console.log(`   - Pages Crawled: ${result.pagesScraped.length}`);
        console.log(`   - Emails Extracted: ${result.allEmails.length}`);
        console.log(`   - Primary Email: ${result.primaryEmail ?? 'none'}`);

        if (result.extractedPeople && result.extractedPeople.length > 0) {
            console.log(`\n👔 Extracted Leadership (LLM Hybrid Parser):`);
            result.extractedPeople.forEach((p, idx) => {
                console.log(`   ${idx + 1}. ${p.name} — ${p.role}`);
            });

            // Demonstrate pattern generation on primary executive
            const topExec = result.extractedPeople[0];
            const domain = new URL(TARGET_URL.startsWith('http') ? TARGET_URL : `https://${TARGET_URL}`).hostname.replace(/^www\./, '');
            const patterns = generateEmailPatterns(topExec.name, domain);

            console.log(`\n🔍 Generated ${patterns.length} Candidate Patterns for ${topExec.name}:`);
            patterns.slice(0, 4).forEach((p) => console.log(`   └─ ${p}`));

            if (patterns.length > 0) {
                console.log(`\n✉️ Running DNS/MX Verification on top pattern: ${patterns[0]}`);
                const verification = await verifyEmail(patterns[0]);
                console.log(`   └─ Status: ${verification.status}`);
                console.log(`   └─ Provider: ${verification.mxProvider || 'Unknown'}`);
                console.log(`   └─ Confidence: ${verification.confidence || 0}%\n`);

                console.log('📋 Formatted Lead:');
                console.log(formatLead(topExec.name, patterns[0], verification.confidence || 0));
            }
        }

        console.log('\n======================================================');
        console.log('   ✅ DEMO COMPLETE — PIPELINE RUN SUCCESSFUL');
        console.log('======================================================\n');
    } catch (err) {
        console.error('❌ Demo error:', err);
    } finally {
        await browser.close();
        if (isDirectExecution) {
            process.exit(0);
        }
    }
}

const isDirectExecution = Boolean(
    process.argv[1] && (
        process.argv[1].endsWith('demo.ts') ||
        process.argv[1].endsWith('demo.js') ||
        fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
    )
);

if (isDirectExecution) {
    runDemo();
}
