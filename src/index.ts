import { program } from 'commander';
import { config } from './config/index.js';
import * as winston from 'winston';
import { connectDB, disconnectDB, createCompanyIfNotExists } from './db/company.js';
import { GoogleMapsScraper } from './scraper/googleMapsScraper.js';

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

// Parse CLI arguments
program
    .name('swarm-lead-scraper')
    .description('Scrapes business leads from Google Maps and queues them for email extraction')
    .option('-q, --query <string>', 'Search query (e.g., "dentists in tbilisi")')
    .option('-m, --max <number>', 'Maximum results to scrape', '20')
    .option('--headless', 'Run browser in headless mode')
    .parse();

const options = program.opts();

async function main() {
    // Validate query is provided
    if (!options.query) {
        console.error('Error: --query is required.');
        process.exit(1);
    }

    const searchQuery = options.query as string;
    const maxResults = parseInt(options.max as string, 10);
    const headlessMode = options.headless || config.HEADLESS;

    logger.info('🚀 Launching Job Producer...');
    logger.info(`📝 Query: "${searchQuery}"`);
    logger.info(`🎯 Max Results: ${maxResults}`);

    let scraper: GoogleMapsScraper | null = null;

    try {
        await connectDB();
        logger.info('🔌 Connected to DB');

        scraper = new GoogleMapsScraper();
        await scraper.init(headlessMode);
        
        await scraper.search(searchQuery);
        
        // Collect links first
        const links = await scraper.collectResultLinks(maxResults);
        console.log(`\n📋 Found ${links.length} potential leads. Extracting details...\n`);

        let addedCount = 0;
        let skippedCount = 0;

        for (const link of links) {
            try {
                const details = await scraper.extractDetails(link);
                
                if (details.name !== 'Unknown Name') {
                    // Upsert Logic: Create or return existing
                    // Note: 'status' will be defaulted to 'PENDING' by Schema for new records.
                    // If it exists, we might want to reset it to PENDING if we want to re-scrape, 
                    // but the user requirement implies just adding new jobs.
                    // For now, we utilize the existing 'createCompanyIfNotExists' which handles deduplication.
                    // To strictly follow "Push to DB (Queue)" and "Set status to PENDING",
                    // we might need to update existing ones if we want to re-process them.
                    // However, avoiding duplicates is usually desired.
                    // Let's assume we want to add *new* unique leads to the queue.

                    const result = await createCompanyIfNotExists({
                        name: details.name,
                        phone: details.phone,
                        website: details.website,
                        address: details.address,
                        source: 'google_maps'
                    });

                    if (result.isDuplicate) {
                        skippedCount++;
                        logger.debug(`⚠️ Duplicate skipped: ${details.name}`);
                    } else {
                        addedCount++;
                        logger.info(`✅ Queued: ${details.name}`);
                        
                        // IMPORTANT: The default status is PENDING and emailScraped is false 
                        // as per Schema defaults.
                    }
                }
            } catch (err) {
                logger.error(`❌ Failed to process link ${link}:`, err);
            }
        }

        console.log('\n🏁 Job Production Complete!');
        console.log(`   🚀 Added to Queue: ${addedCount}`);
        console.log(`   ⚠️ Skipped (Duplicate): ${skippedCount}`);
        console.log(`\nRun 'npm run worker' to process the queue.`);

    } catch (error) {
        logger.error('❌ Fatal Error:', error);
        process.exit(1);
    } finally {
        if (scraper) {
            await scraper.close();
        }
        await disconnectDB();
        process.exit(0);
    }
}

main();
