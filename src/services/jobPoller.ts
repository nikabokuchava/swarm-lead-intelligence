import { prisma } from '../db/company.js';
import { processJob } from './scraperService.js';
import { config } from '../config/index.js';

const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_COOLDOWN_MS = 30_000; // 30s cooldown after repeated failures

export async function startPolling() {
    console.log('📡 Job Poller Started. Waiting for jobs...');
    
    let consecutiveFailures = 0;
    let isProcessing = false; // Prevent overlapping job execution

    setInterval(async () => {
        // Guard: skip tick if already processing a job
        if (isProcessing) return;

        // Guard: cooldown after repeated failures
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.warn(`🛑 Circuit breaker active. ${consecutiveFailures} consecutive failures. Cooling down ${FAILURE_COOLDOWN_MS / 1000}s...`);
            consecutiveFailures = 0; // Reset after announcing
            await new Promise(r => setTimeout(r, FAILURE_COOLDOWN_MS));
            return;
        }

        try {
            const job = await prisma.scrapeJob.findFirst({
                where: { status: 'PENDING' },
                orderBy: { createdAt: 'asc' },
                // Explicitly select fields to ensure userId is present (though findFirst selects all by default)
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
                isProcessing = true;
                console.log(`✨ Detected PENDING Job: ${job.id} - "${job.query}" (User: ${job.userId})`);
                
                const result = await processJob(job.id, config.HEADLESS);
                
                if (result.success) {
                    consecutiveFailures = 0; // Reset on success
                } else {
                    consecutiveFailures++;
                    console.warn(`⚠️ Job ${job.id} failed. Consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}`);
                }
                
                isProcessing = false;
            }
        } catch (error) {
            isProcessing = false;
            consecutiveFailures++;
            console.error(`⚠️ Poller Error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error);
        }
    }, POLLING_INTERVAL);
}
