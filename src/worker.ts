import 'dotenv/config';
import { getNextPendingLead, completeJob, failJobOrRetry, recoverStaleLocks, cancelOrphanedPendingRecords } from './db/queue.js';
import { updateCompanyEmails, connectDB, disconnectDB } from './db/company.js';
import { StealthBrowser } from './scraper/stealthBrowser.js';
import { scrapeEmailsFromWebsite } from './scraper/websiteScraper.js';
import { verifyEmail, getMxInfo } from './services/emailVerifier.js';
import { generateEmailPatterns } from './utils/emailGuesser.js';
import { prisma } from './db/company.js';
import * as crypto from 'crypto';
import { createAppLogger } from './utils/logger.js';
import * as http from 'http';

const logger = createAppLogger('worker.log');

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

        // Recover any stale locks from crashed processes before starting
        await recoverStaleLocks();
        // Cancel orphaned PENDING tasks/companies whose parent job already terminated
        await cancelOrphanedPendingRecords();

        // Lightweight health check endpoint for container orchestrators (K8s, Docker)
        const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || '8080', 10);
        const healthServer = http.createServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                workerId: WORKER_ID,
                uptime: process.uptime(),
            }));
        });
        healthServer.listen(healthPort, () => {
            logger.info(`🏥 Health check listening on port ${healthPort}`);
        });

        // Mutable browser — supports rotation and crash recovery
        let browser = await createBrowser();
        let jobCount = 0;
        const isPremiumCache = new Map<string, boolean>(); // HI2: Cache isPremium by jobId
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
                healthServer.close();
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
            // Proactive browser health check before processing
            if (!browser.isConnected()) {
                logger.warn('⚠️ Browser disconnected, rotating...');
                await rotateBrowser('browser disconnected');
            }

            // HI12: Pre-job heap check — rotate before OOM instead of after
            const preJobHeap = process.memoryUsage().heapUsed;
            if (preJobHeap > 400 * 1024 * 1024) {
                await rotateBrowser(`Pre-job high memory (${(preJobHeap / 1024 / 1024).toFixed(0)}MB)`);
                jobCount = 0;
            }

            try {
                // 1. Fetch Next Job — DB errors get dedicated reconnection handling
                let job;
                try {
                    job = await getNextPendingLead(WORKER_ID);
                } catch (dbError) {
                    logger.error('💥 Database error fetching job. Reconnecting...', dbError);
                    try {
                        await disconnectDB();
                        await connectDB();
                        logger.info('🔌 Database reconnected successfully.');
                    } catch (reconnectErr) {
                        logger.error('💀 Database reconnection failed. Will retry on next loop.', reconnectErr);
                    }
                    await new Promise(resolve => setTimeout(resolve, 30000));
                    continue;
                }

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

                // HI2: Resolve isPremium with cache to prevent N+1 queries
                let isPremium = false;
                if (job.jobId) {
                    if (isPremiumCache.has(job.jobId)) {
                        isPremium = isPremiumCache.get(job.jobId)!;
                    } else {
                        const parentJob = await prisma.scrapeJob.findUnique({
                            where: { id: job.jobId },
                            select: { isPremium: true }
                        });
                        isPremium = parentJob?.isPremium ?? false;
                        isPremiumCache.set(job.jobId, isPremium);
                    }
                }

                // 2. Execute Deep Crawl
                const result = await scrapeEmailsFromWebsite(browser, job.website, 3, isPremium);

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

                    // T1: Parallel email verification with MX cache pre-warming
                    const verifiedDetails: {
                        email: string;
                        confidence: number;
                        source: string;
                        type: string;
                        verificationStatus: string;
                        mxProvider: string | undefined;
                        isCLevel: boolean;
                        fullName?: string;
                        title?: string;
                    }[] = [];

                    const details = result.details || [];

                    // Pre-warm MX cache for all unique domains (single DNS lookup per domain)
                    const uniqueDomains = [...new Set(details.map(d => d.email.split('@')[1]).filter(Boolean))];
                    for (const domain of uniqueDomains) {
                        try { await getMxInfo(domain); } catch { /* cache miss is fine, verifyEmail handles it */ }
                    }

                    // Process in parallel chunks of 3 with jitter
                    const PARALLEL_CHUNK_SIZE = 3;
                    for (let i = 0; i < details.length; i += PARALLEL_CHUNK_SIZE) {
                        const chunk = details.slice(i, i + PARALLEL_CHUNK_SIZE);
                        const chunkResults = await Promise.all(
                            chunk.map(async (d) => {
                                // Small jitter to avoid simultaneous SMTP connections
                                await new Promise(r => setTimeout(r, Math.random() * 200));
                                const verification = await verifyEmail(d.email);
                                return {
                                    email: d.email,
                                    confidence: verification.confidence ?? d.confidence,
                                    source: d.source,
                                    type: d.type || 'generic',
                                    verificationStatus: verification.status,
                                    mxProvider: verification.mxProvider,
                                    isCLevel: false
                                };
                            })
                        );
                        verifiedDetails.push(...chunkResults);
                    }

                    // C-Level Inference: generate + verify email patterns for extracted people
                    if (isPremium && (!result.extractedPeople || result.extractedPeople.length === 0)) {
                        logger.warn(`⚠️ C-Level inference SKIPPED for ${job.name}: isPremium=true but extractedPeople is empty (LLM may have failed)`);
                    }
                    if (isPremium && result.extractedPeople && result.extractedPeople.length > 0) {
                        let domain: string | null = null;
                        try {
                            let normalizedUrl = job.website!;
                            if (!normalizedUrl.startsWith('http')) normalizedUrl = 'https://' + normalizedUrl;
                            domain = new URL(normalizedUrl).hostname.replace(/^www\./, '');
                        } catch { /* invalid URL, skip inference */ }

                        if (domain) {
                            for (const person of result.extractedPeople) {
                                const patterns = generateEmailPatterns(person.name, domain);
                                if (patterns.length === 0) continue;

                                logger.info(`🔍 C-Level inference for ${person.name} (${person.role}): ${patterns.length} patterns`);

                                // HI6: Chunked parallel inference (3 at a time) instead of sequential 1500ms
                                let found = false;
                                const CLEVEL_CHUNK = 3;
                                for (let i = 0; i < patterns.length && !found; i += CLEVEL_CHUNK) {
                                    const chunk = patterns.slice(i, i + CLEVEL_CHUNK);
                                    const results = await Promise.all(chunk.map(e => verifyEmail(e)));
                                    for (let j = 0; j < results.length; j++) {
                                        if (results[j].status === 'VALID') {
                                            verifiedDetails.push({
                                                email: chunk[j],
                                                confidence: 99,
                                                source: 'INFERENCE',
                                                type: 'personal',
                                                verificationStatus: results[j].status,
                                                mxProvider: results[j].mxProvider,
                                                isCLevel: true,
                                                fullName: person.name,
                                                title: person.role,
                                            });
                                            if (!result.allEmails.includes(chunk[j])) {
                                                result.allEmails.push(chunk[j]);
                                            }
                                            logger.info(`✅ C-Level VALID: ${chunk[j]} for ${person.name}`);
                                            found = true;
                                            break;
                                        }
                                    }
                                    if (!found && i + CLEVEL_CHUNK < patterns.length) {
                                        await new Promise(r => setTimeout(r, 1500));
                                    }
                                }
                                if (!found) {
                                    logger.info(`❌ No valid pattern found for ${person.name}`);
                                }
                            }
                        }
                    }

                    await updateCompanyEmails(job.id, result.allEmails, verifiedDetails, job.jobId ?? undefined);
                    await completeJob(job.id, true);
                }

                // 3. Track job count and rotate browser if threshold reached
                jobCount++;
                logger.info(`📊 Job ${jobCount}/${JOBS_PER_BROWSER_SESSION} processed.`);

                // Monitor Memory & Potential Page Leaks per concurrency audit
                const heapUsedBytes = process.memoryUsage().heapUsed;
                const heapUsedMb = (heapUsedBytes / 1024 / 1024).toFixed(2);
                logger.info(`💾 Heap Used: ${heapUsedMb} MB | Open Pages: ${browser.openPagesCount}`);

                // Proactive heap threshold — rotate before OOM
                if (heapUsedBytes > 400 * 1024 * 1024) {
                    await rotateBrowser('High memory threshold (400MB)');
                } else if (jobCount >= JOBS_PER_BROWSER_SESSION) {
                    await rotateBrowser(`${JOBS_PER_BROWSER_SESSION} jobs completed`);
                }

            } catch (loopError) {
                // Transient per-job error — rotate browser and continue to next job
                logger.error('💥 Error processing job — rotating browser:', loopError);
                try {
                    await rotateBrowser('crash recovery');
                } catch (restartErr) {
                    logger.error('💀 Failed to restart browser after crash:', restartErr);
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
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

