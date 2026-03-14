import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkWorkerState() {
  try {
    // 1. Most recent ScrapeJobs (last 5)
    const recentJobs = await prisma.scrapeJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        query: true,
        status: true,
        maxResults: true,
        resultsFound: true,
        createdAt: true,
        completedAt: true,
        isPremium: true,
        _count: { select: { companies: true, tasks: true } },
      },
    });

    console.log('\n═══════════════════════════════════════════');
    console.log('  RECENT SCRAPE JOBS (last 5)');
    console.log('═══════════════════════════════════════════');
    for (const job of recentJobs) {
      console.log(`\n  Job: ${job.id.slice(0, 8)}...`);
      console.log(`  Query: ${job.query}`);
      console.log(`  Status: ${job.status} | Premium: ${job.isPremium}`);
      console.log(`  MaxResults: ${job.maxResults ?? 'unlimited'} | ResultsFound: ${job.resultsFound}`);
      console.log(`  Companies: ${job._count.companies} | Tasks: ${job._count.tasks}`);
      console.log(`  Created: ${job.createdAt.toISOString()}`);
      console.log(`  Completed: ${job.completedAt?.toISOString() ?? 'NOT COMPLETED'}`);
    }

    // 2. Task status breakdown for all jobs created today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tasksByStatus = await prisma.scrapeTask.groupBy({
      by: ['status'],
      where: { createdAt: { gte: todayStart } },
      _count: true,
    });

    console.log('\n═══════════════════════════════════════════');
    console.log('  TASK STATUS BREAKDOWN (today)');
    console.log('═══════════════════════════════════════════');
    let totalTasks = 0;
    for (const group of tasksByStatus) {
      console.log(`  ${group.status}: ${group._count}`);
      totalTasks += group._count;
    }
    console.log(`  TOTAL: ${totalTasks}`);

    // 3. Stuck PROCESSING tasks
    const stuckTasks = await prisma.scrapeTask.findMany({
      where: { status: 'PROCESSING' },
      select: {
        id: true,
        query: true,
        zipCode: true,
        workerId: true,
        lockedAt: true,
        createdAt: true,
      },
    });

    console.log('\n═══════════════════════════════════════════');
    console.log(`  STUCK PROCESSING TASKS: ${stuckTasks.length}`);
    console.log('═══════════════════════════════════════════');
    for (const task of stuckTasks) {
      console.log(`  Task: ${task.id.slice(0, 8)}... | Query: ${task.query}`);
      console.log(`  ZipCode: ${task.zipCode ?? 'none'} | Worker: ${task.workerId ?? 'none'}`);
      console.log(`  Locked: ${task.lockedAt?.toISOString() ?? 'N/A'}`);
    }

    // 4. Companies created in last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const recentCompanyCount = await prisma.company.count({
      where: { createdAt: { gte: sixHoursAgo } },
    });

    const recentCompanyByStatus = await prisma.company.groupBy({
      by: ['status'],
      where: { createdAt: { gte: sixHoursAgo } },
      _count: true,
    });

    console.log('\n═══════════════════════════════════════════');
    console.log('  COMPANIES CREATED (last 6 hours)');
    console.log('═══════════════════════════════════════════');
    console.log(`  Total: ${recentCompanyCount}`);
    for (const group of recentCompanyByStatus) {
      console.log(`  ${group.status}: ${group._count}`);
    }

    // 5. Companies with pending email scraping
    const pendingEmailCompanies = await prisma.company.count({
      where: { status: 'PENDING', createdAt: { gte: todayStart } },
    });
    const processingEmailCompanies = await prisma.company.count({
      where: { status: 'PROCESSING' },
    });

    console.log('\n═══════════════════════════════════════════');
    console.log('  COMPANY EMAIL QUEUE');
    console.log('═══════════════════════════════════════════');
    console.log(`  PENDING (today): ${pendingEmailCompanies}`);
    console.log(`  PROCESSING (stuck?): ${processingEmailCompanies}`);

    // 6. Contact counts (last 6 hours)
    const recentContacts = await prisma.contact.count({
      where: { createdAt: { gte: sixHoursAgo } },
    });

    const contactsByVerification = await prisma.contact.groupBy({
      by: ['verificationStatus'],
      where: { createdAt: { gte: sixHoursAgo } },
      _count: true,
    });

    console.log('\n═══════════════════════════════════════════');
    console.log('  CONTACTS CREATED (last 6 hours)');
    console.log('═══════════════════════════════════════════');
    console.log(`  Total: ${recentContacts}`);
    for (const group of contactsByVerification) {
      console.log(`  ${group.verificationStatus}: ${group._count}`);
    }

    // 7. Overall totals
    const totalCompanies = await prisma.company.count();
    const totalContacts = await prisma.contact.count();
    const totalJobs = await prisma.scrapeJob.count();

    console.log('\n═══════════════════════════════════════════');
    console.log('  OVERALL DATABASE TOTALS');
    console.log('═══════════════════════════════════════════');
    console.log(`  Companies: ${totalCompanies}`);
    console.log(`  Contacts: ${totalContacts}`);
    console.log(`  ScrapeJobs: ${totalJobs}`);

    // 8. PENDING jobs that haven't started
    const pendingJobs = await prisma.scrapeJob.count({
      where: { status: 'PENDING' },
    });
    const processingJobs = await prisma.scrapeJob.count({
      where: { status: 'PROCESSING' },
    });

    console.log(`\n  Jobs PENDING: ${pendingJobs}`);
    console.log(`  Jobs PROCESSING: ${processingJobs}`);

    console.log('\n═══════════════════════════════════════════');
    console.log('  DIAGNOSTIC COMPLETE');
    console.log('═══════════════════════════════════════════\n');

  } finally {
    await prisma.$disconnect();
  }
}

checkWorkerState();
