import { prisma } from '../db/company.js';
import { processJob } from './scraperService.js';
import { config } from '../config/index.js';

const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_COOLDOWN_MS = 30_000; // 30s cooldown after repeated failures

/**
 * ARC-03 Fix: Sequential polling loop using while + await sleep.
 * Prevents overlapping ticks that setInterval could cause.
 */
export async function startPolling() {
    console.log('📡 Job Poller Started. Waiting for jobs...');

    let consecutiveFailures = 0;
    let isShuttingDown = false;

    // Graceful shutdown support
    const shutdown = () => {
        console.log('🛑 Poller received shutdown signal...');
        isShuttingDown = true;
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    while (!isShuttingDown) {
        try {
            // Cooldown after repeated failures
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.warn(`🛑 Circuit breaker active. ${consecutiveFailures} consecutive failures. Cooling down ${FAILURE_COOLDOWN_MS / 1000}s...`);
                consecutiveFailures = 0;
                await sleep(FAILURE_COOLDOWN_MS);
                continue;
            }

            try {
                const job = await prisma.scrapeJob.findFirst({
                    where: { status: 'PENDING' },
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        query: true,
                        userId: true,
                        maxResults: true,
                        status: true,
                        createdAt: true
                    }
                });

                if (job) {
                    console.log(`✨ Detected PENDING Job: ${job.id} - "${job.query}" (User: ${job.userId})`);

                    const result = await processJob(job.id, config.HEADLESS);

                    if (result.success) {
                        consecutiveFailures = 0;
                    } else {
                        consecutiveFailures++;
                        console.warn(`⚠️ Job ${job.id} failed. Consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}`);
                    }
                }
            } catch (error) {
                consecutiveFailures++;
                console.error(`⚠️ Poller Error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error);
            }
        } catch (catastrophicError) {
            console.error(`💥 Catastrophic error in jobPoller. Sleeping for 30s.`, catastrophicError);
            await sleep(30000);
        }

        // Wait before next poll (sequential — no overlap possible)
        await sleep(POLLING_INTERVAL);
    }

    console.log('👋 Poller stopped cleanly.');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
