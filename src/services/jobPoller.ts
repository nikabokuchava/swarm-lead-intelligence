import { prisma } from '../db/company.js';
import { processJob } from './scraperService.js';
import { config } from '../config/index.js';

const POLLING_INTERVAL = 5000; // 5 seconds

export async function startPolling() {
    console.log('📡 Job Poller Started. Waiting for jobs...');
    
    // Check repeatedly
    setInterval(async () => {
        try {
            // Find one PENDING job (FIFO)
            const job = await prisma.scrapeJob.findFirst({
                where: { status: 'PENDING' },
                orderBy: { createdAt: 'asc' }
            });

            if (job) {
                console.log(`✨ Detected PENDING Job: ${job.id} - "${job.query}"`);
                await processJob(job.id, config.HEADLESS);
            }
        } catch (error) {
            console.error('⚠️ Poller Error:', error);
        }
    }, POLLING_INTERVAL);
}
