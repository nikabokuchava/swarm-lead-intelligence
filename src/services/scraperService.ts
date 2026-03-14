import { GoogleMapsScraper } from '../scraper/googleMapsScraper.js';
import { prisma, createCompanyIfNotExists } from '../db/company.js';
// DaaS mode: credit system disabled
// import { hasCredits, deductCredit } from '../db/user.js';
import { StealthBrowser } from '../scraper/stealthBrowser.js';
import { config } from '../config/index.js';
import { createAppLogger } from '../utils/logger.js';

// ARC-09: Use shared logger (removed stale duplicated winston config)
const logger = createAppLogger();

export async function processJob(taskId: string, headlessMode: boolean = true) {
    let scraper: GoogleMapsScraper | null = null;
    // ARC-02: Single shared StealthBrowser for both maps scraping + email crawl
    let sharedBrowser: StealthBrowser | null = null;
    
    try {
        const task = await prisma.scrapeTask.findUnique({ 
            where: { id: taskId },
            include: { scrapeJob: true }
        });
        
        if (!task) throw new Error(`Task ${taskId} not found`);

        const job = task.scrapeJob;
        const ownerId = job.userId || 'admin';
        
        // Append zipCode to query if it exists
        const fullQuery = task.zipCode ? `${task.query} in ${task.zipCode}` : task.query;
        
        logger.info(`🚀 Processing Task: ${fullQuery} (${taskId}) for Job: ${job.id}`);

        // DaaS mode: credit gate disabled — unlimited processing
        
        await prisma.scrapeTask.update({
            where: { id: taskId },
            data: { status: 'PROCESSING' }
        });

        // ARC-02: Launch one shared StealthBrowser for the entire job
        sharedBrowser = new StealthBrowser();
        await sharedBrowser.launch();
        logger.info('🌐 Shared StealthBrowser initialized for job.');

        scraper = new GoogleMapsScraper();
        // Pass sharedBrowser so maps scraper reuses the same Chromium process
        await scraper.init(headlessMode, sharedBrowser);
        
        await scraper.search(fullQuery);
        // We still collect a batch, but we enforce the maxResults in the loop
        const links = await scraper.collectResultLinks(job.maxResults || 20);
        
        // Since we are running parallel tasks, we do not overwrite resultsFound with just this task's links.
        // It's better to increment resultsFound atomically or count by leads at the end.

        logger.info(`📋 Found ${links.length} leads. Extracting...`);

        let added = 0;
        let skipped = 0;

        for (const link of links) {
            // Check quota BEFORE processing each lead
            if (job.maxResults) {
                const currentCount = await prisma.company.count({
                    where: { jobId: job.id }
                });
                if (currentCount >= job.maxResults) {
                    logger.info(`🛑 Quota reached (${currentCount}/${job.maxResults}) for Job ${job.id}. Stopping task ${taskId}.`);
                    break;
                }
            }

            try {
                const details = await scraper.extractDetails(link);
                if (details.name !== 'Unknown Name') {
                    const result = await createCompanyIfNotExists({
                        name: details.name,
                        phone: details.phone,
                        website: details.website,
                        address: details.address,
                        source: 'google_maps',
                        jobId: job.id,
                        userId: ownerId,
                        rating: details.rating ? Number(details.rating) : null,
                        reviewCount: details.reviewCount ? parseInt(String(details.reviewCount).replace(/[^0-9]/g, ''), 10) : null
                    });

                    if (result.isDuplicate) {
                        skipped++;
                    } else {
                        added++;
                        logger.info(`✅ Added: ${details.name}`);
                        // Company remains PENDING — background worker handles email extraction
                    }
                }
            } catch (err) {
                logger.error(`❌ extraction failed for ${link}`, err);
            }
        }

        await prisma.scrapeTask.update({
            where: { id: taskId },
            data: { 
                status: 'COMPLETED'
            }
        });

        // Atomic finalization: count + conditional update in a single transaction
        await prisma.$transaction(async (tx) => {
            const pendingTasks = await tx.scrapeTask.count({
                where: {
                    jobId: job.id,
                    status: { in: ['PENDING', 'PROCESSING'] }
                }
            });

            if (pendingTasks === 0) {
                const finalCount = await tx.company.count({ where: { jobId: job.id } });
                await tx.scrapeJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'COMPLETED',
                        completedAt: new Date(),
                        resultsFound: finalCount
                    }
                });
                logger.info(`🏁 Job ${job.id} Fully Completed. Total Leads: ${finalCount}`);
            }
        });

        logger.info(`🏁 Task ${taskId} Completed. Added: ${added}, Skipped: ${skipped}`);
        return { success: true, added, skipped };

    } catch (error) {
        logger.error(`❌ Task ${taskId} Failed:`, error);
        const currentTask = await prisma.scrapeTask.findUnique({ where: { id: taskId } });
        if (currentTask && currentTask.retries < currentTask.maxRetries) {
            await prisma.scrapeTask.update({
                where: { id: taskId },
                data: { retries: { increment: 1 }, status: 'PENDING' }
            });
            logger.info(`🔄 Task ${taskId} retry ${currentTask.retries + 1}/${currentTask.maxRetries}`);
        } else {
            await prisma.scrapeTask.update({
                where: { id: taskId },
                data: { status: 'FAILED' }
            });
        }
        return { success: false, error };
    } finally {
        // ARC-02: scraper only closes its page, sharedBrowser owns the process
        if (scraper) await scraper.close();
        if (sharedBrowser) await sharedBrowser.close();
    }
}

// Re-export config for backwards compat with any existing callers
export { config };
