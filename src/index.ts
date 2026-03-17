import { program } from 'commander';
import { config } from './config/index.js';
import { createAppLogger } from './utils/logger.js';
import { connectDB, disconnectDB, prisma } from './db/company.js';
import { startPolling } from './services/jobPoller.js';
import { processJob } from './services/scraperService.js';

const logger = createAppLogger();

// Parse CLI arguments
program
    .name('swarm-lead-scraper')
    .description('Scrapes business leads from Google Maps and queues them for email extraction')
    .option('-q, --query <string>', 'Search query (e.g., "dentists in tbilisi")')
    .option('-m, --max <number>', 'Maximum results to scrape', '20')
    .option('--headless', 'Run browser in headless mode')
    .option('--serve', 'Run as a background service (Job Poller)')
    .parse();

const options = program.opts();

async function main() {
    try {
        await connectDB();
        logger.info('🔌 Connected to DB');

        // MODE 1: Background Service (Poller)
        if (options.serve) {
            logger.info('🚀 Starting in Service Mode (--serve)...');
            await startPolling();
            // Keep process alive
            return; 
        }

        // MODE 2: CLI Command (Immediate Execution)
        if (!options.query) {
            console.error('Error: --query is required (or use --serve).');
            process.exit(1);
        }

        const searchQuery = options.query as string;
        const maxResults = parseInt(options.max as string, 10);
        const headlessMode = options.headless || config.HEADLESS;

        logger.info(`🚀 Launching CLI Job: "${searchQuery}"`);

        // Create Job + Task for CLI mode
        const job = await prisma.scrapeJob.create({
            data: {
                query: searchQuery,
                status: 'PENDING',
                maxResults: maxResults
            }
        });

        const task = await prisma.scrapeTask.create({
            data: {
                jobId: job.id,
                query: searchQuery,
                status: 'PENDING'
            }
        });

        // Process immediately (blocking) — processJob expects a taskId
        await processJob(task.id, headlessMode);

    } catch (error) {
        logger.error('❌ Fatal Error:', error);
        process.exit(1);
    } finally {
        if (!options.serve) {
            await disconnectDB();
        }
    }
}

main();
