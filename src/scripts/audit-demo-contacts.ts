/**
 * READ-ONLY audit: count contacts whose verification result was fabricated by
 * LOCAL_DEMO_MODE. Demo mode returned VALID/99 for every address without any
 * DNS/MX/SMTP work, tagging them mxProvider = 'Google Workspace (Demo)'.
 *
 * Reports only — this script performs no writes and no migration.
 *
 * Usage: npx tsx src/scripts/audit-demo-contacts.ts
 */
import { prisma } from '../db/prisma.js';

const DEMO_MARKER = 'Google Workspace (Demo)';

async function main() {
    const total = await prisma.contact.count();
    const demoContacts = await prisma.contact.findMany({
        where: { mxProvider: DEMO_MARKER },
        select: {
            jobId: true,
            verificationStatus: true,
            confidenceScore: true,
            isCLevel: true,
            createdAt: true,
        },
    });

    console.log('=== LOCAL_DEMO_MODE contact audit (read-only) ===');
    console.log(`Marker            : mxProvider = "${DEMO_MARKER}"`);
    console.log(`Contacts total    : ${total}`);
    console.log(`Fabricated        : ${demoContacts.length}`);

    if (demoContacts.length === 0) {
        console.log('\nNo fabricated contacts found.');
        return;
    }

    const dates = demoContacts.map(c => c.createdAt.getTime());
    console.log(`Date range        : ${new Date(Math.min(...dates)).toISOString()} → ${new Date(Math.max(...dates)).toISOString()}`);
    console.log(`C-Level among them: ${demoContacts.filter(c => c.isCLevel).length}`);

    const byStatus = new Map<string, number>();
    for (const c of demoContacts) {
        byStatus.set(c.verificationStatus, (byStatus.get(c.verificationStatus) ?? 0) + 1);
    }
    console.log('\nBy verificationStatus:');
    for (const [status, count] of [...byStatus].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${status.padEnd(10)} ${count}`);
    }

    const byJob = new Map<string, number>();
    for (const c of demoContacts) {
        const key = c.jobId ?? '(no jobId)';
        byJob.set(key, (byJob.get(key) ?? 0) + 1);
    }

    const jobIds = [...byJob.keys()].filter(k => k !== '(no jobId)');
    const jobs = jobIds.length
        ? await prisma.scrapeJob.findMany({
            where: { id: { in: jobIds } },
            select: { id: true, query: true, status: true, createdAt: true },
        })
        : [];
    const jobById = new Map(jobs.map(j => [j.id, j]));

    console.log('\nBy job:');
    for (const [jobId, count] of [...byJob].sort((a, b) => b[1] - a[1])) {
        const job = jobById.get(jobId);
        const label = job ? `"${job.query}" [${job.status}] ${job.createdAt.toISOString().slice(0, 10)}` : '(job record not found)';
        console.log(`  ${String(count).padStart(6)}  ${jobId}  ${label}`);
    }

    console.log('\nNo changes were made. Decide remediation separately.');
}

main()
    .catch((err) => {
        console.error('Audit failed:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
