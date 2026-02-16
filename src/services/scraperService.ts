import { GoogleMapsScraper } from '../scraper/googleMapsScraper.js';
import { prisma, createCompanyIfNotExists, updateCompanyEmails } from '../db/company.js';
import { scrapeEmailsFromWebsite } from '../scraper/websiteScraper.js';
import { StealthBrowser } from '../scraper/stealthBrowser.js';
import { config } from '../config/index.js';
import winston from 'winston';

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

export async function processJob(jobId: string, headlessMode: boolean = true) {
    let scraper: GoogleMapsScraper | null = null;
    let emailBrowser: StealthBrowser | null = null;
    
    try {
        const job = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
        if (!job) throw new Error(`Job ${jobId} not found`);

        logger.info(`🚀 Processing Job: ${job.query} (${jobId})`);
        
        await prisma.scrapeJob.update({
            where: { id: jobId },
            data: { status: 'RUNNING' }
        });

        scraper = new GoogleMapsScraper();
        await scraper.init(headlessMode);
        
        await scraper.search(job.query);
        const links = await scraper.collectResultLinks(job.maxResults || 20);
        
        await prisma.scrapeJob.update({
            where: { id: jobId },
            data: { resultsFound: links.length }
        });

        logger.info(`📋 Found ${links.length} leads. Extracting...`);

        // Initialize StealthBrowser for email scraping
        emailBrowser = new StealthBrowser();
        // pre-launch to save time, or it will launch on first use
        await emailBrowser.launch();

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
                        jobId: job.id
                    });

                    if (result.isDuplicate) {
                        skipped++;
                    } else {
                        added++;
                        logger.info(`✅ Added: ${details.name}`);

                        // Email Extraction Logic
                        if (details.website && result.company) {
                            try {
                                logger.info(`🔍 Deep crawling: ${details.website}...`);
                                const emailResult = await scrapeEmailsFromWebsite(emailBrowser, details.website, 2);
                                
                                if (emailResult.allEmails.length > 0) {
                                    await updateCompanyEmails(
                                        result.company.id, 
                                        emailResult.allEmails, 
                                        emailResult.details?.map(d => ({
                                            email: d.email,
                                            confidence: d.confidence,
                                            source: d.source,
                                            type: d.type || 'generic'
                                        })) || [],
                                        job.id
                                    );
                                    logger.info(`📧 Found ${emailResult.allEmails.length} emails for ${details.name}`);
                                } else {
                                    // logger.info(`No emails found for ${details.name}`);
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
        if (scraper) await scraper.close();
        if (emailBrowser) await emailBrowser.close();
    }
}
