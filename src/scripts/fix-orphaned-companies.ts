/**
 * Migration script: Fix orphaned Company records by copying userId from parent ScrapeJob.
 * Run once: npx tsx src/scripts/fix-orphaned-companies.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixOrphanedCompanies() {
    console.log('\n🔧 Fixing orphaned Company records...\n');

    // Find all companies with 'admin' or 'legacy' userId that have a jobId
    const orphaned = await prisma.company.findMany({
        where: {
            OR: [
                { userId: 'admin' },
                { userId: 'legacy' },
            ],
            jobId: { not: null }
        },
        select: { id: true, name: true, userId: true, jobId: true }
    });

    console.log(`Found ${orphaned.length} orphaned companies with a jobId.\n`);

    if (orphaned.length === 0) {
        console.log('✅ Nothing to fix!');
        await prisma.$disconnect();
        return;
    }

    // Group by jobId to batch lookups
    const jobIds = [...new Set(orphaned.map(c => c.jobId!))];
    const jobs = await prisma.scrapeJob.findMany({
        where: { id: { in: jobIds } },
        select: { id: true, userId: true }
    });

    const jobUserMap = new Map(jobs.map(j => [j.id, j.userId]));

    let fixed = 0;
    let skipped = 0;

    for (const company of orphaned) {
        const realUserId = jobUserMap.get(company.jobId!);

        if (!realUserId || realUserId === 'admin') {
            console.log(`⏭️  Skipping "${company.name}" — parent job also has no real userId.`);
            skipped++;
            continue;
        }

        await prisma.company.update({
            where: { id: company.id },
            data: { userId: realUserId }
        });

        console.log(`✅ Fixed: "${company.name}" → userId: ${realUserId}`);
        fixed++;
    }

    console.log(`\n📊 Done: ${fixed} fixed, ${skipped} skipped.\n`);
    await prisma.$disconnect();
}

fixOrphanedCompanies().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
