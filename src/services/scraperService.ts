import { GoogleMapsScraper } from '../scraper/googleMapsScraper.js';
import { prisma, createCompanyIfNotExists, updateCompanyEmails } from '../db/company.js';
import { hasCredits, deductCredit } from '../db/user.js';
import { scrapeEmailsFromWebsite } from '../scraper/websiteScraper.js';
import { StealthBrowser } from '../scraper/stealthBrowser.js';
import { verifyEmail } from './emailVerifier.js';
import { config } from '../config/index.js';
import { createAppLogger } from '../utils/logger.js';

// ARC-09: Use shared logger (removed stale duplicated winston config)
const logger = createAppLogger();

export async function processJob(jobId: string, headlessMode: boolean = true) {
    let scraper: GoogleMapsScraper | null = null;
    // ARC-02: Single shared StealthBrowser for both maps scraping + email crawl
    let sharedBrowser: StealthBrowser | null = null;
    
    try {
        const job = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
        if (!job) throw new Error(`Job ${jobId} not found`);

        const ownerId = job.userId || 'admin';
        logger.info(`🚀 Processing Job: ${job.query} (${jobId}) for User: ${ownerId}`);

        // 💳 CREDIT GATE: Check before starting the job
        const isRealUser = ownerId !== 'admin';
        if (isRealUser && !(await hasCredits(ownerId))) {
            logger.warn(`🚨 Job ${jobId} aborted: User ${ownerId} has insufficient credits.`);
            await prisma.scrapeJob.update({
                where: { id: jobId },
                data: { status: 'FAILED' }
            });
            return { success: false, error: 'Insufficient credits' };
        }
        
        await prisma.scrapeJob.update({
            where: { id: jobId },
            data: { status: 'PROCESSING' }
        });

        // ARC-02: Launch one shared StealthBrowser for the entire job
        sharedBrowser = new StealthBrowser();
        await sharedBrowser.launch();
        logger.info('🌐 Shared StealthBrowser initialized for job.');

        scraper = new GoogleMapsScraper();
        // Pass sharedBrowser so maps scraper reuses the same Chromium process
        await scraper.init(headlessMode, sharedBrowser);
        
        await scraper.search(job.query);
        const links = await scraper.collectResultLinks(job.maxResults || 20);
        
        await prisma.scrapeJob.update({
            where: { id: jobId },
            data: { resultsFound: links.length }
        });

        logger.info(`📋 Found ${links.length} leads. Extracting...`);

        let added = 0;
        let skipped = 0;

        for (const link of links) {
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
                        userId: ownerId
                    });

                    if (result.isDuplicate) {
                        skipped++;
                    } else {
                        added++;
                        logger.info(`✅ Added: ${details.name}`);

                        // 💳 Deduct 1 credit per new lead (not duplicates)
                        if (isRealUser) {
                            const updatedUser = await deductCredit(ownerId, 1);
                            logger.info(`💳 Credit deducted. Remaining for user ${ownerId}: ${updatedUser.credits}`);

                            // Stop mid-job if credits exhausted
                            if (updatedUser.credits <= 0) {
                                logger.warn(`🚨 User ${ownerId} ran out of credits. Stopping job ${jobId} early.`);
                                break;
                            }
                        }

                        // Email Extraction — reuses the same sharedBrowser
                        if (details.website && result.company) {
                            try {
                                logger.info(`🔍 Deep crawling: ${details.website}...`);
                                const emailResult = await scrapeEmailsFromWebsite(sharedBrowser, details.website, 2);
                                
                                if (emailResult.allEmails.length > 0) {
                                    // Verify emails in parallel
                                    const verifiedDetails = await Promise.all(
                                        (emailResult.details || []).map(async (d) => {
                                            const verification = await verifyEmail(d.email);
                                            return {
                                                email: d.email,
                                                confidence: d.confidence,
                                                source: d.source,
                                                type: d.type || 'generic',
                                                verificationStatus: verification.status,
                                                mxProvider: verification.mxProvider
                                            };
                                        })
                                    );

                                    await updateCompanyEmails(
                                        result.company.id, 
                                        emailResult.allEmails, 
                                        verifiedDetails,
                                        job.id
                                    );
                                    logger.info(`📧 Found ${emailResult.allEmails.length} emails for ${details.name}`);
                                }
                            } catch (emailErr) {
                                logger.warn(`⚠️ Email extraction failed for ${details.website}:`, emailErr);
                            }
                        }
                    }
                }
            } catch (err) {
                logger.error(`❌ extraction failed for ${link}`, err);
            }
        }

        await prisma.scrapeJob.update({
            where: { id: jobId },
            data: { 
                status: 'COMPLETED',
                completedAt: new Date()
            }
        });

        logger.info(`🏁 Job ${jobId} Completed. Added: ${added}, Skipped: ${skipped}`);
        return { success: true, added, skipped };

    } catch (error) {
        logger.error(`❌ Job ${jobId} Failed:`, error);
        await prisma.scrapeJob.update({
            where: { id: jobId },
            data: { status: 'FAILED' }
        });
        return { success: false, error };
    } finally {
        // ARC-02: scraper only closes its page, sharedBrowser owns the process
        if (scraper) await scraper.close();
        if (sharedBrowser) await sharedBrowser.close();
    }
}

// Re-export config for backwards compat with any existing callers
export { config };
