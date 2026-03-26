import { prisma } from '../db/company.js';
import { recoverStaleLocks } from '../db/queue.js';
import { processJob } from './scraperService.js';
import { config } from '../config/index.js';
import { StealthBrowser } from '../scraper/stealthBrowser.js';
import * as crypto from 'crypto';
import { createAppLogger } from '../utils/logger.js';

const logger = createAppLogger();

const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_COOLDOWN_MS = 30_000; // 30s cooldown after repeated failures

/** Rotate browser every N jobs to prevent Chromium memory leaks */
const JOBS_PER_BROWSER_SESSION = 50;

const POLLER_ID = `poller-${crypto.randomUUID().substring(0, 8)}`;

async function createBrowser(): Promise<StealthBrowser> {
    const b = new StealthBrowser();
    await b.launch();
    return b;
}

/**
 * Claim the next PENDING ScrapeTask using FOR UPDATE SKIP LOCKED.
 * Returns the task ID or null if no tasks are available.
 */
async function claimNextTask(): Promise<string | null> {
    const result = await prisma.$queryRaw<{ id: string }[]>`
        UPDATE "scrape_tasks"
        SET status = 'PROCESSING',
            "worker_id" = ${POLLER_ID},
            "locked_at" = NOW()
        WHERE id = (
            SELECT id
            FROM "scrape_tasks"
            WHERE status = 'PENDING'
            ORDER BY "created_at" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id;
    `;

    const rows = result as unknown as { id: string }[];
    return (rows && rows.length > 0) ? rows[0].id : null;
}

/**
 * ARC-03 Fix: Sequential polling loop using while + await sleep.
 * Prevents overlapping ticks that setInterval could cause.
 *
 * M1: Reuses a single StealthBrowser across tasks, rotating every 50 jobs.
 * D5: Uses FOR UPDATE SKIP LOCKED for safe horizontal scaling.
 */
export async function startPolling() {
    logger.info(`📡 Job Poller Started (${POLLER_ID}). Waiting for jobs...`);

    // Recover any stale locks from crashed processes before polling
    await recoverStaleLocks();

    let consecutiveFailures = 0;
    let isShuttingDown = false;

    // M1: Create shared browser once, reuse across tasks
    let browser = await createBrowser();
    let jobCount = 0;
    logger.info('🌐 Poller StealthBrowser initialized.');

    /** Gracefully close and re-launch the browser */
    const rotateBrowser = async (reason: string) => {
        logger.info(`♻️  Rotating poller browser (${reason})...`);
        try {
            await browser.close();
        } catch (closeErr) {
            logger.warn('⚠️  Error closing poller browser during rotation (ignoring):', closeErr);
        }
        browser = await createBrowser();
        jobCount = 0;
        logger.info('🌐 Fresh poller browser session started.');
    };

    // Graceful shutdown support
    const shutdown = async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        logger.info('🛑 Poller received shutdown signal...');
        try {
            await browser.close();
        } catch { /* best-effort */ }
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    while (!isShuttingDown) {
        try {
            // Cooldown after repeated failures
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                logger.warn(`🛑 Circuit breaker active. ${consecutiveFailures} consecutive failures. Cooling down ${FAILURE_COOLDOWN_MS / 1000}s...`);
                consecutiveFailures = 0;
                await sleep(FAILURE_COOLDOWN_MS);
                continue;
            }

            // Proactive browser health check
            if (!browser.isConnected()) {
                logger.warn('⚠️ Poller browser disconnected, rotating...');
                await rotateBrowser('browser disconnected');
            }

            try {
                // D5: Atomic claim with FOR UPDATE SKIP LOCKED
                const taskId = await claimNextTask();

                if (taskId) {
                    // Re-fetch with relations for quota check
                    const task = await prisma.scrapeTask.findUnique({
                        where: { id: taskId },
                        include: {
                            scrapeJob: {
                                select: {
                                    id: true,
                                    maxResults: true,
                                    resultsFound: true
                                }
                            }
                        }
                    });

                    if (!task) {
                        logger.warn(`⚠️ Task ${taskId} claimed but not found on re-fetch.`);
                        await sleep(POLLING_INTERVAL);
                        continue;
                    }

                    logger.info(`✨ Claimed Task: ${task.id} - "${task.query}" (Zip: ${task.zipCode || 'NONE'})`);

                    // Check quota via atomic counter (no expensive COUNT query)
                    if (task.scrapeJob?.maxResults && task.scrapeJob.resultsFound >= task.scrapeJob.maxResults) {
                        logger.info(`🛑 Quota reached for Job ${task.jobId} (${task.scrapeJob.resultsFound}/${task.scrapeJob.maxResults}). Cancelling remaining tasks.`);
                        await prisma.scrapeTask.updateMany({
                            where: {
                                jobId: task.jobId,
                                status: 'PENDING'
                            },
                            data: { status: 'FAILED' }
                        });
                        // Also mark this already-claimed task
                        await prisma.scrapeTask.update({
                            where: { id: taskId },
                            data: { status: 'FAILED' }
                        });
                        continue;
                    }

                    // M1: Pass shared browser to processJob
                    const result = await processJob(task.id, config.HEADLESS, browser);

                    if (result.success) {
                        consecutiveFailures = 0;
                        jobCount++;
                        logger.info(`📊 Poller job ${jobCount}/${JOBS_PER_BROWSER_SESSION} processed.`);

                        // Rotate browser if threshold reached
                        if (jobCount >= JOBS_PER_BROWSER_SESSION) {
                            await rotateBrowser(`${JOBS_PER_BROWSER_SESSION} jobs completed`);
                        }

                        // CPU breather: let GC run between back-to-back tasks
                        await sleep(2000);
                    } else {
                        consecutiveFailures++;
                        logger.warn(`⚠️ Task ${task.id} failed. Consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}`);
                    }
                }
            } catch (error) {
                consecutiveFailures++;
                logger.error(`⚠️ Poller Error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error);
                // Force browser restart on critical errors
                try {
                    await rotateBrowser('crash recovery');
                } catch (restartErr) {
                    logger.error('💀 Failed to restart poller browser after crash:', restartErr);
                }
            }
        } catch (catastrophicError) {
            logger.error(`💥 Catastrophic error in jobPoller. Sleeping for 30s.`, catastrophicError);
            await sleep(30000);
        }

        // Wait before next poll (sequential — no overlap possible)
        await sleep(POLLING_INTERVAL);
    }

    logger.info('👋 Poller stopped cleanly.');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
