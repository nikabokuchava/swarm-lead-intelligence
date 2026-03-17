import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db/company.js';

/**
 * Hard Reset: Force-reset ALL PROCESSING ScrapeTasks and Companies back to PENDING.
 * Unlike recoverStaleLocks (10-min threshold), this resets regardless of lock age.
 */
async function hardReset() {
    await connectDB();

    const [taskResult, companyResult] = await Promise.all([
        prisma.scrapeTask.updateMany({
            where: { status: 'PROCESSING' },
            data: {
                status: 'PENDING',
                workerId: null,
                lockedAt: null
            }
        }),
        prisma.company.updateMany({
            where: { status: 'PROCESSING' },
            data: {
                status: 'PENDING',
                workerId: null,
                lockedAt: null
            }
        })
    ]);

    console.log(`🔓 Hard Reset Complete:`);
    console.log(`   Tasks reset:     ${taskResult.count}`);
    console.log(`   Companies reset: ${companyResult.count}`);

    await disconnectDB();
}

hardReset().catch((err) => {
    console.error('Hard reset failed:', err);
    process.exit(1);
});
