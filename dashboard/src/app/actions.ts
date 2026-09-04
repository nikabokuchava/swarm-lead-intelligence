'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { checkRateLimit } from '@/lib/rateLimit';
import { reserveCreditsForJob, refundUnusedCredits } from '../../../src/services/creditService';

// Server-side hardening caps — auditable, not reliant on UI input limits.
const MAX_RESULTS = 500;      // hard cap on leads per job (UI max is advisory only)
const MAX_TASKS = 100;        // cap on zip-code task fan-out per job
const MAX_JOBS_PER_MIN = 20;  // job-creation rate limit per user

export async function createScrapeJob(formData: FormData) {
  //
  const { userId } = await auth();
  const clerkUser = await currentUser();

  if (!userId || !clerkUser) {
    throw new Error("Unauthorized: You must be logged in to create a job.");
  }

  // Abuse/cost guard: rate-limit job creation per user before any DB work.
  if (!checkRateLimit(`job-create:${userId}`, MAX_JOBS_PER_MIN).allowed) {
    throw new Error("RATE_LIMITED: Too many jobs created. Please wait a minute before launching another.");
  }

  // Always provision a local User row for the authenticated Clerk user (idempotent).
  const primaryEmail = clerkUser.emailAddresses[0]?.emailAddress ?? null;
  await getOrCreateUser(userId, primaryEmail);

  // Parse and validate raw form data
  const rawQuery = (formData.get('query') as string) || '';
  const rawMaxResults = parseInt((formData.get('maxResults') as string) || '50', 10);
  const zipCodesRaw = (formData.get('zipCodes') as string) || '';

  const query = rawQuery.trim();
  if (!query) {
    throw new Error("Validation Error: Search query is required.");
  }

  // Hard caps on user-controlled numerical inputs.
  // Never trust the client UI slider to enforce billing / task caps.
  const maxResults = Math.min(
    Math.max(1, isNaN(rawMaxResults) ? 50 : rawMaxResults),
    MAX_RESULTS
  );

  const zipCodes = zipCodesRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, MAX_TASKS); // cap fan-out to prevent worker queue flooding

  const jobId = crypto.randomUUID();

  // Atomically reserve credits for maxResults leads before creating the job.
  // Throws INSUFFICIENT_CREDITS if user balance is insufficient.
  await reserveCreditsForJob(userId, maxResults, jobId);

  // 2. ვქმნით ჯობს კონკრეტული userId-ით
  try {
    console.log(`[ACTION] Attempting to create scrape job for query: "${query}", maxResults: ${maxResults}, userId: ${userId}`);
    const job = await prisma.scrapeJob.create({
      data: {
        id: jobId,
        query,
        maxResults,
        // Entitlement is NOT trusted from the client. No server-side entitlement
        // source exists yet, so default to the safe/free path (no paid C-Level enrichment).
        isPremium: false,
        status: 'PROCESSING', // Parent immediately PROCESSING
        userId: userId, // <---
        tasks: {
          create: zipCodes.length > 0 
            ? zipCodes.map(zipCode => ({
                zipCode,
                query,
                status: 'PENDING'
              }))
            : [{ query, status: 'PENDING' }] // Null fallback for general queries
        }
      },
    });
    console.log(`[ACTION] Successfully created job ${job.id} with ${zipCodes.length || 1} tasks for user ${userId}`);
  } catch (err) {
    console.error(`[ACTION] Error creating scrape job:`, err);
    try {
      await refundUnusedCredits(userId, jobId, maxResults, 0);
    } catch (refundErr) {
      console.error(`[ACTION] Failed to refund reserved credits after job creation failure:`, refundErr);
    }
    throw err;
  }

  revalidatePath('/dashboard/jobs');
  revalidatePath('/dashboard');
}

export async function deleteCompany(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  if (!id) throw new Error('ID is required');

  try {
    // 
    await prisma.company.deleteMany({
      where: { 
        id,
        userId: userId // <--- 
      },
    });

    revalidatePath('/dashboard/leads');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete company:', error);
    return { success: false, error: 'Failed to delete company' };
  }
}

export async function cancelScrapeJob(jobId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  if (!jobId) throw new Error('Job ID is required');

  try {
    // 1. Mark Job as FAILED
    await prisma.scrapeJob.updateMany({
      where: {
        id: jobId,
        userId: userId, // Ensure user owns the job
      },
      data: {
        status: 'FAILED',
      },
    });

    // 2. Mark pending companies as FAILED so worker stops picking them up
    await prisma.company.updateMany({
      where: {
        jobId: jobId,
        userId: userId,
        status: 'PENDING',
      },
      data: {
        status: 'FAILED',
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/jobs');
  } catch (error) {
    console.error('Failed to cancel job:', error);
    throw new Error('Failed to cancel job');
  }
}
