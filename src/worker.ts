import 'dotenv/config';
import { config } from './config/index.js';
import { getNextPendingLead, completeJob, failJobOrRetry } from './db/queue.js';
import { updateCompanyEmails, connectDB, disconnectDB } from './db/company.js';
import { StealthBrowser } from './scraper/stealthBrowser.js';
import { scrapeEmailsFromWebsite } from './scraper/websiteScraper.js';
import * as crypto from 'crypto';
import * as winston from 'winston';

// Configure Worker Logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message }) => {
                    return `[${timestamp}] ${level}: ${message}`;
                })
            )
        }),
        new winston.transports.File({ filename: 'worker.log' })
    ]
});

const WORKER_ID = `worker-${crypto.randomUUID().substring(0, 8)}`;
const POLLING_INTERVAL_MS = 5000;

/** Rotate browser every N jobs to prevent Chromium memory leaks */
const JOBS_PER_BROWSER_SESSION = 50;

async function createBrowser(): Promise<StealthBrowser> {
    const b = new StealthBrowser();
    await b.launch();
    return b;
}

async function runWorker() {
    logger.info(`🚀 Starting Worker: ${WORKER_ID}`);

    try {
        await connectDB();
        logger.info('🔌 Connected to Database');

        // Mutable browser — supports rotation and crash recovery
        let browser = await createBrowser();
        let jobCount = 0;
        logger.info('🌐 Stealth Browser initialized (Headless)');

        /** Gracefully close and re-launch the browser */
        const rotateBrowser = async (reason: string) => {
            logger.info(`♻️  Rotating browser session (${reason})...`);
            try {
                await browser.close();
            } catch (closeErr) {
                logger.warn('⚠️  Error closing browser during rotation (ignoring):', closeErr);
            }
            browser = await createBrowser();
            jobCount = 0;
            logger.info('🌐 Fresh browser session started.');
        };

        // Graceful shutdown handler
        let isShuttingDown = false;
        const shutdown = async () => {
            if (isShuttingDown) return;
            isShuttingDown = true;
            logger.info('🛑 Shutting down worker...');
            try {
                await browser.close();
                await disconnectDB();
                logger.info('👋 Worker cleanup complete');
                process.exit(0);
            } catch (err) {
                console.error('Error during shutdown:', err);
                process.exit(1);
            }
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Infinite Processing Loop
        while (!isShuttingDown) {
            try {
                // 1. Fetch Next Job
                const job = await getNextPendingLead(WORKER_ID);

                if (!job) {
                    // Poll wait
                    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
                    continue;
                }

                logger.info(`👷 Processing: ${job.name} (ID: ${job.id}) - URL: ${job.website}`);

                if (!job.website) {
                    logger.warn(`⚠️  No website for ${job.name}, marking FAILED.`);
                    await completeJob(job.id, false, 'Missing website URL');
                    continue;
                }

                // 2. Execute Deep Crawl
                const result = await scrapeEmailsFromWebsite(browser, job.website);

                if (result.error) {
                    logger.warn(`❌ Scrape error for ${job.website}: ${result.error}`);
                    await failJobOrRetry(job.id, job.retries, result.error);
                } else {
                    const emailCount = result.allEmails.length;

                    if (emailCount > 0) {
                        logger.info(`✅ Found ${emailCount} emails for ${job.name}: ${result.allEmails.join(', ')}`);
                    } else {
                        logger.info(`🤷 No emails found for ${job.name}`);
                    }

                    await updateCompanyEmails(job.id, result.allEmails, result.details);
                    await completeJob(job.id, true);
                }

                // 3. Track job count and rotate browser if threshold reached
                jobCount++;
                logger.info(`📊 Job ${jobCount}/${JOBS_PER_BROWSER_SESSION} processed.`);

                if (jobCount >= JOBS_PER_BROWSER_SESSION) {
                    await rotateBrowser(`${JOBS_PER_BROWSER_SESSION} jobs completed`);
                }

            } catch (loopError) {
                logger.error('💥 Critical error in worker loop — forcing browser restart:', loopError);
                // Force browser restart to recover from potential Chromium crash
                try {
                    await rotateBrowser('crash recovery');
                } catch (restartErr) {
                    logger.error('💀 Failed to restart browser after crash:', restartErr);
                }
                // Sleep briefly to avoid tight loops on DB failures
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

    } catch (startupError) {
        logger.error('💀 Fatal worker startup error:', startupError);
        process.exit(1);
    }
}

// Check if run directly (ESM pattern)
// Simplified: Just run it. We don't import this file as a module elsewhere.
runWorker();

export { runWorker }; // Export for testing

