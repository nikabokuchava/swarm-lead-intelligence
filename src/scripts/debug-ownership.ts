import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugOwnership() {
    console.log('\n🔍 DEBUG: Checking Company Ownership (last 10 records)\n');
    console.log('='.repeat(60));

    const companies = await prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
            id: true,
            name: true,
            userId: true,
            jobId: true,
            createdAt: true,
        }
    });

    if (companies.length === 0) {
        console.log('⚠️  No companies found in database.');
        await prisma.$disconnect();
        return;
    }

    let failCount = 0;
    let passCount = 0;

    for (const c of companies) {
        const isOrphaned = !c.userId || c.userId === 'admin' || c.userId === 'legacy';
        const status = isOrphaned ? '❌ FAIL (orphaned)' : '✅ SUCCESS';
        if (isOrphaned) failCount++; else passCount++;

        console.log(`\n${status}`);
        console.log(`  Name:    ${c.name}`);
        console.log(`  userId:  ${c.userId ?? 'NULL'}`);
        console.log(`  jobId:   ${c.jobId ?? 'NULL'}`);
        console.log(`  Created: ${c.createdAt.toISOString()}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Summary: ${passCount} ✅ owned | ${failCount} ❌ orphaned\n`);

    if (failCount > 0) {
        console.log('⚠️  ACTION REQUIRED: Orphaned records exist.');
        console.log('   These will NOT appear in the Dashboard for any user.');
        console.log('   Run the worker AFTER rebuilding: npm run build && npm start -- --serve\n');
    } else {
        console.log('🎉 All records have valid user ownership!\n');
    }

    // Also check ScrapeJobs
    console.log('🔍 DEBUG: Checking ScrapeJob Ownership (last 5 records)\n');
    console.log('='.repeat(60));

    const jobs = await prisma.scrapeJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
            id: true,
            query: true,
            userId: true,
            status: true,
            createdAt: true,
        }
    });

    for (const j of jobs) {
        const isOrphaned = !j.userId || j.userId === 'admin';
        const status = isOrphaned ? '❌ ORPHANED JOB' : '✅ OWNED JOB';
        console.log(`\n${status}`);
        console.log(`  Query:   ${j.query}`);
        console.log(`  userId:  ${j.userId ?? 'NULL'}`);
        console.log(`  Status:  ${j.status}`);
        console.log(`  Created: ${j.createdAt.toISOString()}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    await prisma.$disconnect();
}

debugOwnership().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
