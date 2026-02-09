import { program } from 'commander';
import { config } from './config/index.js';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as winston from 'winston';
import cliProgress from 'cli-progress';
import { connectDB, disconnectDB, createCompanyIfNotExists, getCompaniesWithoutEmails, updateCompanyEmails } from './db/company.js';
import { createScrapeJob, completeJob, failJob, listScrapeJobs } from './db/scrapeJob.js';
import { exportToCSV } from './utils/exportCSV.js';
import { scrapeEmailsFromWebsite, createEmailScraperPage } from './scraper/websiteScraper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const puppeteer = puppeteerExtra as any;

const stealth = StealthPlugin();
puppeteer.use(stealth);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: config.LOG_FILE })
    ]
});

// Parse CLI arguments
program
    .name('swarm-lead-scraper')
    .description('Scrapes business leads from Google Maps')
    .option('-q, --query <string>', 'Search query (e.g., "dentists in tbilisi")')
    .option('-m, --max <number>', 'Maximum results to scrape', '20')
    .option('--headless', 'Run browser in headless mode')
    .option('-o, --output <path>', 'Custom CSV output path')
    .option('--list-jobs', 'List recent scrape jobs')
    .option('--with-emails', 'Extract emails from company websites after scraping')
    .option('--email-only', 'Extract emails for existing companies without emails')
    .parse();

const options = program.opts();

// Handle --list-jobs command
async function handleListJobs() {
    await connectDB();
    const jobs = await listScrapeJobs(10);
    
    console.log('\n📋 Recent Scrape Jobs:\n');
    
    if (jobs.length === 0) {
        console.log('   No jobs found.');
    } else {
        console.log('┌──────────────────────────────────────┬────────────────────────────┬────────────┬─────────┐');
        console.log('│ ID                                   │ Query                      │ Status     │ Results │');
        console.log('├──────────────────────────────────────┼────────────────────────────┼────────────┼─────────┤');
        
        for (const job of jobs) {
            const statusIcon = job.status === 'completed' ? '✅' : job.status === 'failed' ? '❌' : '🔄';
            const idShort = job.id.substring(0, 36);
            const queryShort = job.query.substring(0, 24).padEnd(24);
            const statusPad = `${statusIcon} ${job.status}`.padEnd(10);
            const results = String(job.resultsFound).padStart(7);
            console.log(`│ ${idShort} │ ${queryShort} │ ${statusPad} │${results} │`);
        }
        
        console.log('└──────────────────────────────────────┴────────────────────────────┴────────────┴─────────┘');
    }
    
    await disconnectDB();
    process.exit(0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function collectResultLinks(page: any): Promise<string[]> {
    logger.info('📜 Starting to collect result links...');
    const resultSelector = 'a.hfpxzc';
    
    try {
        await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
        // Initial wait for some results
        await page.waitForSelector(resultSelector, { timeout: 10000 });
    } catch {
        logger.warn('⚠️ Feed or results container not found immediately.');
        return [];
    }

    let previousCount = 0;
    let noChangeCount = 0;
    const maxAttempts = 30; // Safety cap

    for (let i = 0; i < maxAttempts; i++) {
        // Scroll down in the feed using arrow function
        await page.evaluate(() => {
            const feed = document.querySelector('div[role="feed"]');
            if (feed) {
                feed.scrollTop = feed.scrollHeight;
            }
        });

        // Wait for potential load
        await new Promise(r => setTimeout(r, config.SCROLL_DELAY_MS));

        // Check count
        const currentLinks = await page.evaluate((sel: string) => {
            return document.querySelectorAll(sel).length;
        }, resultSelector);

        logger.info(`🔄 Scroll attempt ${i + 1}: Found ${currentLinks} links (prev: ${previousCount})`);

        if (currentLinks === previousCount) {
            noChangeCount++;
        } else {
            noChangeCount = 0;
        }

        previousCount = currentLinks;

        if (noChangeCount >= 3) {
            logger.info('🛑 No new results after 3 scrolls. Stopping collection.');
            break;
        }
    }

    // Extract all unique hrefs
     
    const hrefs = await page.evaluate((sel: string) => {
        const elements = Array.from(document.querySelectorAll(sel)) as HTMLAnchorElement[];
        return elements.map(el => el.href).filter(href => href && href.length > 0);
    }, resultSelector);

    // Filter duplicates
    const uniqueHrefs = [...new Set(hrefs as string[])];
    logger.info(`✅ Collected ${uniqueHrefs.length} unique links.`);
    return uniqueHrefs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function openResultAndExtract(page: any, href: string) {
    logger.info(`👉 Processing: ${href}`);
    
    // Navigate directly
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the name header to confirm detail view
    try {
        await page.waitForSelector('h1.DUwDvf', { timeout: 8000 });
    } catch {
       // Try fallback h1
       try {
         await page.waitForSelector('h1', { timeout: 3000 });
       } catch {
         logger.warn('⚠️ Header not found, extraction might be partial.');
       }
    }
    
    // Extraction logic
    const data = await page.evaluate(() => {
        const getText = (sel: string) => {
            const el = document.querySelector(sel) as HTMLElement | null;
            return el?.innerText?.trim() ?? '';
        };

        const name = getText('h1.DUwDvf') || getText('h1') || 'Unknown Name';

        const ariaElements = Array.from(document.querySelectorAll('[aria-label]'));

        const phoneEl = ariaElements.find(el => el.getAttribute('aria-label')?.includes('Phone:'));
        const phone = phoneEl ? phoneEl.getAttribute('aria-label')!.replace('Phone:', '').trim() : null;

        const addrEl = ariaElements.find(el => el.getAttribute('aria-label')?.includes('Address:'));
        const address = addrEl ? addrEl.getAttribute('aria-label')!.replace('Address:', '').trim() : 'Tbilisi, Georgia';

        const webEl = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement | null;
        const website = webEl?.href ?? null;

        return { name, phone, website, address };
    });

    return data;
}

async function main() {
    // Handle list-jobs command first
    if (options.listJobs) {
        await handleListJobs();
        return;
    }

    // Validate query is provided for scraping
    if (!options.query) {
        console.error('Error: --query is required for scraping. Use --list-jobs to view job history.');
        process.exit(1);
    }

    const searchQuery = options.query as string;
    const maxResults = parseInt(options.max as string, 10);
    const headlessMode = options.headless || config.HEADLESS;
    
    logger.info('🚀 Launching Multi-Result Scraper...');
    logger.info(`📝 Query: "${searchQuery}"`);
    logger.info(`🎯 Max Results: ${maxResults}`);
    logger.info(`👁️  Headless: ${headlessMode}`);

    let currentJob: { id: string } | null = null;

    try {
        await connectDB();
        logger.info('🔌 Connected to DB via Prisma');

        // Create scrape job record
        currentJob = await createScrapeJob({
            query: searchQuery,
            maxResults: maxResults
        });
        console.log(`📋 Job started: ${currentJob.id}`);
        logger.info(`Job created: ${currentJob.id}`);

        const browser = await puppeteer.launch({
            headless: headlessMode,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US']
        });
        const page = await browser.newPage();

        // Fix for: ReferenceError: __name is not defined
        await page.evaluateOnNewDocument(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).__name = (fn: any) => fn;
        });

        // 1. Search
        const url = `https://www.google.com/maps/search/${searchQuery.replace(/ /g, '+')}?hl=en`;
        logger.info(`🔍 Searching: ${url}`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // 2. Collect Links
        const allLinks = await collectResultLinks(page);
        
        // 3. Process Links
        const linksToProcess = allLinks.slice(0, maxResults);
        logger.info(`📋 Processing first ${linksToProcess.length} of ${allLinks.length} links...`);

        const scrapedCompanies = [];
        let duplicateCount = 0;
        let failedCount = 0;

        // Create progress bar
        const progressBar = new cliProgress.SingleBar({
            format: '📊 Progress |{bar}| {percentage}% | {value}/{total} | {status}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            hideCursor: true
        }, cliProgress.Presets.shades_classic);
        
        progressBar.start(linksToProcess.length, 0, { status: 'Starting...' });

        for (let i = 0; i < linksToProcess.length; i++) {
            const link = linksToProcess[i];
            
            try {
                const data = await openResultAndExtract(page, link);
                progressBar.update(i + 1, { status: `Extracted: ${data.name.substring(0, 30)}...` });

                // Save to DB with deduplication
                if (data.name !== 'Unknown Name') {
                    const result = await createCompanyIfNotExists({
                        name: data.name,
                        phone: data.phone,
                        website: data.website,
                        address: data.address,
                        source: 'google_maps'
                    });
                    
                    if (result.isDuplicate) {
                        duplicateCount++;
                        logger.debug(`⚠️ Duplicate skipped: ${data.name}`);
                    } else if (result.company) {
                        scrapedCompanies.push(result.company);
                    }
                }

            } catch (err: unknown) {
                failedCount++;
                logger.error(`❌ Failed to process item ${i}:`, err);
            }

            // Small delay between items
            await new Promise(r => setTimeout(r, 1000));
        }
        
        progressBar.stop();
        
        // Summary
        console.log('\n🏁 Batch processing complete!');
        console.log(`   ✅ Saved: ${scrapedCompanies.length}`);
        console.log(`   ⚠️  Duplicates skipped: ${duplicateCount}`);
        console.log(`   ❌ Failed: ${failedCount}`);
        
        logger.info(`Summary: saved=${scrapedCompanies.length}, duplicates=${duplicateCount}, failed=${failedCount}`);
        
        // Export to CSV
        if (scrapedCompanies.length > 0) {
            const csvPath = exportToCSV(scrapedCompanies, options.output);
            console.log(`   💾 CSV: ${csvPath}`);
            logger.info(`CSV exported to: ${csvPath}`);
        } else {
            console.log('   💾 CSV: Skipped (no new companies)');
        }

        // Mark job as completed
        if (currentJob) {
            await completeJob(currentJob.id, scrapedCompanies.length);
            console.log(`   📋 Job completed: ${currentJob.id}`);
        }
        
        await browser.close();
        await disconnectDB();

    } catch (error) {
        logger.error('❌ Fatal Error:', error);
        
        // Mark job as failed
        if (currentJob) {
            await failJob(currentJob.id, 0);
            console.log(`   📋 Job failed: ${currentJob.id}`);
        }
        
        await disconnectDB();
    }
}

main();
