import { resetStalledJobs } from '../db/queue.js';
import { connectDB, disconnectDB } from '../db/company.js';

async function main() {
    await connectDB();
    console.log('🔄 Resetting stalled jobs...');
    
    // Reset jobs stuck for more than 0 minutes (i.e., all currently processing ones)
    // capable of being picked up again immediately
    const count = await resetStalledJobs(0);
    
    console.log(`✅ Reset ${count} stalled jobs to PENDING.`);
    
    await disconnectDB();
}

main().catch(console.error);
