'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { checkRateLimit } from '@/lib/rateLimit';

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
    throw new Error('Too many jobs created. Please wait a minute and try again.');
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
  await getOrCreateUser(userId, email);

  const query = formData.get('query') as string;
  // Clamp maxResults to a safe server-side range (negative/0/NaN -> default 20).
  const rawMaxResults = Number(formData.get('maxResults'));
  const maxResults = Number.isFinite(rawMaxResults) && rawMaxResults > 0
    ? Math.min(Math.floor(rawMaxResults), MAX_RESULTS)
    : 20;
  const zipCodesRaw = formData.get('zipCodes') as string | null;

  if (!query || query.trim() === '') {
    throw new Error('Query is required');
  }

  // Parse zip codes from comma separated list, then cap task fan-out.
  const zipCodes = (zipCodesRaw
    ? zipCodesRaw.split(',').map(z => z.trim()).filter(Boolean)
    : []
  ).slice(0, MAX_TASKS);

  // 2. ვქმნით ჯობს კონკრეტული userId-ით
  try {
    console.log(`[ACTION] Attempting to create scrape job for query: "${query}", maxResults: ${maxResults}, userId: ${userId}`);
    const job = await prisma.scrapeJob.create({
      data: {
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
