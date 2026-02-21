'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
// DaaS mode: rate limiting and credit checks disabled

export async function createScrapeJob(formData: FormData) {
  // 
  const { userId } = await auth();
  const clerkUser = await currentUser();

  if (!userId || !clerkUser) {
    throw new Error("Unauthorized: You must be logged in to create a job.");
  }

  // DaaS mode: no rate limiting or credit checks
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
  await getOrCreateUser(userId, email);

  const query = formData.get('query') as string;
  const maxResults = Number(formData.get('maxResults')) || 20;

  if (!query || query.trim() === '') {
    throw new Error('Query is required');
  }

  // 2. ვქმნით ჯობს კონკრეტული userId-ით
  await prisma.scrapeJob.create({
    data: {
      query,
      maxResults,
      status: 'PENDING',
      userId: userId, // <--- 
    },
  });

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
