import { prisma, connectDB, disconnectDB } from '../db/company.js';

async function seed() {
    await connectDB();
    console.log('🌱 Seeding job queue...');

    const url = 'https://www.w3.org/';
    
    // Create a pending job
    const job = await prisma.company.create({
        data: {
            name: 'W3C Test Lead',
            website: url,
            source: 'SEED_SCRIPT',
            status: 'PENDING'
        }
    });

    console.log(`✅ Created Pending Job: ${job.id} - ${job.website}`);
    
    await disconnectDB();
}

seed().catch(e => {
    console.error(e);
    process.exit(1);
});
