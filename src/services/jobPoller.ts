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
                const task = await prisma.scrapeTask.findFirst({
                    where: { status: 'PENDING' },
                    orderBy: { createdAt: 'asc' },
                    include: {
                        scrapeJob: {
                            select: {
                                userId: true,
                                maxResults: true
                            }
                        }
                    }
                });

                if (task) {
                    console.log(`✨ Detected PENDING Task: ${task.id} - "${task.query}" (Zip: ${task.zipCode || 'NONE'})`);

                    // Ensure quota is not exhausted right before processing
                    const leadCount = await prisma.company.count({
                        where: { jobId: task.jobId }
                    });

                    if (task?.scrapeJob?.maxResults && leadCount >= task.scrapeJob.maxResults) {
                        console.log(`🛑 Quota reached for Job ${task.jobId} (${leadCount}/${task.scrapeJob.maxResults}). Cancelling running task ${task.id}.`);
                        await prisma.scrapeTask.updateMany({
                            where: {
                                jobId: task.jobId,
                                status: 'PENDING'
                            },
                            data: { status: 'FAILED' }
                        });
                        continue;
                    }

                    // For now pass the task ID, but scraperService needs update too
                    const result = await processJob(task.id, config.HEADLESS);

                    if (result.success) {
                        consecutiveFailures = 0;
                    } else {
                        consecutiveFailures++;
                        console.warn(`⚠️ Task ${task.id} failed. Consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}`);
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
