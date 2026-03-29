import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db/company.js';

function pad(str: string, len: number, align: 'left' | 'right' = 'left'): string {
    if (align === 'right') return str.padStart(len);
    return str.padEnd(len);
}

function divider(len: number): string {
    return '─'.repeat(len);
}

async function audit() {
    await connectDB();

    // ── ScrapeJobs by query + status ──
    const jobs = await prisma.scrapeJob.groupBy({
        by: ['query', 'status'],
        _count: { id: true },
        _sum: { resultsFound: true },
        orderBy: { query: 'asc' }
    });

    const totalJobs = await prisma.scrapeJob.count();

    // ── ScrapeTasks by status ──
    const tasks = await prisma.scrapeTask.groupBy({
        by: ['status'],
        _count: { id: true }
    });
    const totalTasks = tasks.reduce((s, t) => s + t._count.id, 0);

    // ── Companies by status ──
    const companies = await prisma.company.groupBy({
        by: ['status'],
        _count: { id: true }
    });
    const totalCompanies = companies.reduce((s, c) => s + c._count.id, 0);

    const emailScrapedCount = await prisma.company.count({ where: { emailScraped: true } });

    // ── Contacts ──
    const totalContacts = await prisma.contact.count();

    const contactsByVerification = await prisma.contact.groupBy({
        by: ['verificationStatus'],
        _count: { id: true }
    });

    const cLevelCount = await prisma.contact.count({ where: { isCLevel: true } });

    const contactsBySource = await prisma.contact.groupBy({
        by: ['emailSource'],
        _count: { id: true }
    });

    // ── Print ──
    console.log();
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              GLOBAL INVENTORY AUDIT                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Jobs
    console.log();
    console.log(`  SCRAPE JOBS  (total: ${totalJobs})`);
    console.log(`  ${divider(58)}`);
    console.log(`  ${pad('Query', 30)} ${pad('Status', 12)} ${pad('Count', 6, 'right')} ${pad('Results', 8, 'right')}`);
    console.log(`  ${divider(58)}`);
    if (jobs.length === 0) {
        console.log('  (none)');
    } else {
        for (const j of jobs) {
            console.log(`  ${pad(j.query.substring(0, 29), 30)} ${pad(j.status, 12)} ${pad(String(j._count.id), 6, 'right')} ${pad(String(j._sum.resultsFound ?? 0), 8, 'right')}`);
        }
    }

    // Tasks
    console.log();
    console.log(`  SCRAPE TASKS  (total: ${totalTasks})`);
    console.log(`  ${divider(30)}`);
    console.log(`  ${pad('Status', 16)} ${pad('Count', 8, 'right')}`);
    console.log(`  ${divider(30)}`);
    for (const s of ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']) {
        const found = tasks.find(t => t.status === s);
        console.log(`  ${pad(s, 16)} ${pad(String(found?._count.id ?? 0), 8, 'right')}`);
    }

    // Companies
    console.log();
    console.log(`  COMPANIES  (total: ${totalCompanies})`);
    console.log(`  ${divider(30)}`);
    console.log(`  ${pad('Status', 16)} ${pad('Count', 8, 'right')}`);
    console.log(`  ${divider(30)}`);
    for (const s of ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']) {
        const found = companies.find(c => c.status === s);
        console.log(`  ${pad(s, 16)} ${pad(String(found?._count.id ?? 0), 8, 'right')}`);
    }
    console.log(`  ${divider(30)}`);
    console.log(`  ${pad('Email Scraped', 16)} ${pad(String(emailScrapedCount), 8, 'right')}`);

    // Contacts
    console.log();
    console.log(`  CONTACTS  (total: ${totalContacts})`);
    console.log(`  ${divider(30)}`);
    console.log(`  ${pad('Verification', 16)} ${pad('Count', 8, 'right')}`);
    console.log(`  ${divider(30)}`);
    for (const s of ['VALID', 'INVALID', 'CATCH_ALL', 'UNKNOWN']) {
        const found = contactsByVerification.find(c => c.verificationStatus === s);
        console.log(`  ${pad(s, 16)} ${pad(String(found?._count.id ?? 0), 8, 'right')}`);
    }
    // Any other statuses
    for (const c of contactsByVerification) {
        if (!['VALID', 'INVALID', 'CATCH_ALL', 'UNKNOWN'].includes(c.verificationStatus)) {
            console.log(`  ${pad(c.verificationStatus, 16)} ${pad(String(c._count.id), 8, 'right')}`);
        }
    }
    console.log(`  ${divider(30)}`);
    console.log(`  ${pad('C-Level', 16)} ${pad(String(cLevelCount), 8, 'right')}`);

    // Source breakdown
    console.log();
    console.log(`  CONTACT SOURCES`);
    console.log(`  ${divider(30)}`);
    console.log(`  ${pad('Source', 16)} ${pad('Count', 8, 'right')}`);
    console.log(`  ${divider(30)}`);
    if (contactsBySource.length === 0) {
        console.log('  (none)');
    } else {
        for (const c of contactsBySource) {
            console.log(`  ${pad(c.emailSource ?? '(null)', 16)} ${pad(String(c._count.id), 8, 'right')}`);
        }
    }

    console.log();
    console.log(`  ${divider(58)}`);
    console.log();

    await disconnectDB();
}

audit().catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
});
