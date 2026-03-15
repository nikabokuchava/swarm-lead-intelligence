import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db/company.js';

/**
 * Full Reset: Reset a COMPLETED/FAILED job back to PENDING for re-processing.
 * Deletes contacts, resets companies and tasks, resets job status.
 */
async function fullResetJob() {
    const jobId = process.argv[2];
    if (!jobId) {
        console.error('Usage: npx tsx src/scripts/full_reset_job.ts <jobId>');
        process.exit(1);
    }

    await connectDB();

    // 1. Delete contacts linked to companies in this job
    const contacts = await prisma.contact.deleteMany({
        where: { company: { jobId } }
    });

    // 2. Reset companies
    const companies = await prisma.company.updateMany({
        where: { jobId },
        data: {
            status: 'PENDING',
            workerId: null,
            lockedAt: null,
            emails: [],
            emailScraped: false,
            emailScrapedAt: null,
            retries: 0
        }
    });

    // 3. Reset scrape tasks
    const tasks = await prisma.scrapeTask.updateMany({
        where: { jobId },
        data: {
            status: 'PENDING',
            workerId: null,
            lockedAt: null,
            retries: 0
        }
    });

    // 4. Reset job status
    await prisma.scrapeJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING', resultsFound: 0, completedAt: null }
    });

    console.log(`🔄 Full Reset for Job ${jobId}:`);
    console.log(`   Contacts deleted: ${contacts.count}`);
    console.log(`   Companies reset:  ${companies.count}`);
    console.log(`   Tasks reset:      ${tasks.count}`);

    await disconnectDB();
}

fullResetJob().catch((err) => {
    console.error('Full reset failed:', err);
    process.exit(1);
});
