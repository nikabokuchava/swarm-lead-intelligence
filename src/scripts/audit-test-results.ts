import 'dotenv/config';
import { prisma } from '../db/prisma.js';

async function audit() {
  // Find the most recent job — any status (PROCESSING jobs show partial results)
  const job = await prisma.scrapeJob.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!job) {
    console.log('[audit] No jobs found in database.');
    await prisma.$disconnect();
    return;
  }

  if (job.status !== 'COMPLETED') {
    console.log(`[audit] Latest job is ${job.status} (not COMPLETED). Showing partial results.`);
  }

  const companies = await prisma.company.findMany({
    where: { jobId: job.id },
    include: { contacts: true },
  });

  const totalLeads = companies.length;

  if (totalLeads === 0) {
    console.log(`[audit] Job ${job.id} (${job.query}) has 0 leads.`);
    console.log(`[audit] Job status: ${job.status} | Created: ${job.createdAt.toISOString()}`);
    const taskCounts = await prisma.scrapeTask.groupBy({
      by: ['status'],
      where: { jobId: job.id },
      _count: true,
    });
    console.log('[audit] Task breakdown:', taskCounts.map(t => `${t.status}=${t._count}`).join(', '));
    await prisma.$disconnect();
    return;
  }

  // --- Email Coverage ---
  const leadsWithEmail = companies.filter(
    (c) => c.contacts.length > 0 && c.contacts.some((ct) => ct.workEmail)
  ).length;
  const emailCoverage = totalLeads > 0 ? ((leadsWithEmail / totalLeads) * 100).toFixed(1) : '0.0';

  // --- Flatten contacts ---
  const allContacts = companies.flatMap((c) => c.contacts);
  const contactsWithEmail = allContacts.filter((ct) => ct.workEmail);

  // --- Verification Breakdown ---
  const verifCounts: Record<string, number> = {};
  for (const ct of contactsWithEmail) {
    const status = ct.verificationStatus || 'UNKNOWN';
    verifCounts[status] = (verifCounts[status] ?? 0) + 1;
  }

  // --- Demo Mode Check ---
  const demoMode = process.env.LOCAL_DEMO_MODE === 'true';
  const hasDemoProvider = contactsWithEmail.some((ct) => ct.mxProvider?.includes('Demo'));
  const allSameStatus = new Set(contactsWithEmail.map(ct => ct.verificationStatus)).size === 1;
  const likelyDemo = demoMode || hasDemoProvider || (allSameStatus && contactsWithEmail.length > 10 && verifCounts['VALID'] === contactsWithEmail.length);

  // --- Confidence Scores ---
  const scores = contactsWithEmail
    .map((ct) => ct.confidenceScore)
    .filter((s): s is number => s !== null && s !== undefined);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

  // --- Premium / C-Level ---
  const cLevelContacts = allContacts.filter((ct) => ct.isCLevel);
  const inferenceContacts = contactsWithEmail.filter((ct) => ct.emailSource === 'INFERENCE');
  const cLevelInference = cLevelContacts.filter((ct) => ct.emailSource === 'INFERENCE');

  // --- MX Provider Stats ---
  const providerCounts: Record<string, number> = {};
  for (const ct of contactsWithEmail) {
    const provider = ct.mxProvider || 'Unknown';
    providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;
  }
  const sortedProviders = Object.entries(providerCounts).sort((a, b) => b[1] - a[1]);

  // --- Email Source Stats ---
  const sourceCounts: Record<string, number> = {};
  for (const ct of contactsWithEmail) {
    const src = ct.emailSource || 'Unknown';
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
  }

  // --- Email Type Stats ---
  const typeCounts: Record<string, number> = {};
  for (const ct of contactsWithEmail) {
    const t = ct.emailType || 'Unknown';
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  // --- Quality Score Calculation ---
  const coverageScore = Math.min(100, parseFloat(emailCoverage));
  const validRate = contactsWithEmail.length > 0 ? ((verifCounts['VALID'] ?? 0) / contactsWithEmail.length) * 100 : 0;
  const inferenceRate = totalLeads > 0 ? (cLevelInference.length / totalLeads) * 100 : 0;
  // Weighted: 40% coverage, 35% valid rate, 25% inference success
  const qualityScore = (coverageScore * 0.4) + (validRate * 0.35) + (Math.min(100, inferenceRate * 5) * 0.25);

  // --- Output ---
  console.log('');
  console.log('='.repeat(64));
  console.log(`  DATA QUALITY AUDIT — ${job.query}`);
  console.log('='.repeat(64));
  console.log(`  Job ID:        ${job.id}`);
  console.log(`  Query:         ${job.query}`);
  console.log(`  Status:        ${job.status}`);
  console.log(`  Premium:       ${job.isPremium}`);
  console.log(`  Created:       ${job.createdAt.toISOString()}`);
  console.log(`  Demo Mode:     ${likelyDemo ? 'DETECTED (results may be synthetic)' : 'OFF (real MX/DNS)'}`);
  console.log('-'.repeat(64));

  console.log('');
  console.log('  LEAD COVERAGE');
  console.log('-'.repeat(64));
  console.log(`  Total Leads:          ${totalLeads}`);
  console.log(`  Leads with Email:     ${leadsWithEmail}  (${emailCoverage}%)`);
  console.log(`  Leads without Email:  ${totalLeads - leadsWithEmail}`);
  console.log(`  Total Contacts:       ${allContacts.length}`);
  console.log(`  Contacts with Email:  ${contactsWithEmail.length}`);

  console.log('');
  console.log('  VERIFICATION INTEGRITY');
  console.log('-'.repeat(64));
  for (const [status, count] of Object.entries(verifCounts).sort((a, b) => b[1] - a[1])) {
    const pct = contactsWithEmail.length > 0 ? ((count / contactsWithEmail.length) * 100).toFixed(1) : '0.0';
    const bar = '█'.repeat(Math.round(parseFloat(pct) / 5));
    console.log(`  ${status.padEnd(14)} ${String(count).padStart(4)}  (${pct.padStart(5)}%)  ${bar}`);
  }

  console.log('');
  console.log('  CONFIDENCE SCORES');
  console.log('-'.repeat(64));
  console.log(`  Avg:  ${avgScore.toFixed(1)}`);
  console.log(`  Min:  ${minScore.toFixed(1)}`);
  console.log(`  Max:  ${maxScore.toFixed(1)}`);
  console.log(`  N:    ${scores.length}`);

  console.log('');
  console.log('  PREMIUM ROI — C-LEVEL INFERENCE ENGINE');
  console.log('-'.repeat(64));
  console.log(`  C-Level Contacts:        ${cLevelContacts.length}`);
  console.log(`  Inference Emails:        ${inferenceContacts.length}`);
  console.log(`  C-Level + Inference:     ${cLevelInference.length}`);
  console.log(`  Inference Hit Rate:      ${totalLeads > 0 ? ((cLevelInference.length / totalLeads) * 100).toFixed(1) : '0.0'}%`);
  if (cLevelInference.length > 0) {
    console.log('');
    console.log('  Top C-Level Contacts:');
    for (const ct of cLevelInference.slice(0, 10)) {
      console.log(`    ${(ct.fullName || 'Unknown').padEnd(25)} ${(ct.title || '').padEnd(20)} ${ct.workEmail}`);
    }
  }

  console.log('');
  console.log('  MX PROVIDER DIVERSITY');
  console.log('-'.repeat(64));
  for (const [provider, count] of sortedProviders) {
    const pct = contactsWithEmail.length > 0 ? ((count / contactsWithEmail.length) * 100).toFixed(1) : '0.0';
    const bar = '█'.repeat(Math.round(parseFloat(pct) / 5));
    console.log(`  ${provider.padEnd(22)} ${String(count).padStart(4)}  (${pct.padStart(5)}%)  ${bar}`);
  }

  console.log('');
  console.log('  EMAIL SOURCE BREAKDOWN');
  console.log('-'.repeat(64));
  for (const [src, count] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
    const pct = contactsWithEmail.length > 0 ? ((count / contactsWithEmail.length) * 100).toFixed(1) : '0.0';
    console.log(`  ${src.padEnd(14)} ${String(count).padStart(4)}  (${pct.padStart(5)}%)`);
  }

  console.log('');
  console.log('  EMAIL TYPE');
  console.log('-'.repeat(64));
  for (const [t, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const pct = contactsWithEmail.length > 0 ? ((count / contactsWithEmail.length) * 100).toFixed(1) : '0.0';
    console.log(`  ${t.padEnd(14)} ${String(count).padStart(4)}  (${pct.padStart(5)}%)`);
  }

  console.log('');
  console.log('='.repeat(64));
  console.log(`  QUALITY SCORE:  ${qualityScore.toFixed(1)} / 100`);
  console.log(`    Coverage (40%):    ${coverageScore.toFixed(1)}`);
  console.log(`    Valid Rate (35%):  ${validRate.toFixed(1)}%`);
  console.log(`    Inference (25%):   ${inferenceRate.toFixed(1)}% hit rate`);
  console.log('='.repeat(64));
  console.log('');

  await prisma.$disconnect();
}

audit().catch(async (e) => {
  console.error('[audit] Fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
