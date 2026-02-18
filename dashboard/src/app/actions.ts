'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateUser, hasCredits } from '@/lib/user';

export async function createScrapeJob(formData: FormData) {
  // 
  const { userId } = await auth();
  const clerkUser = await currentUser();

  if (!userId || !clerkUser) {
    throw new Error("Unauthorized: You must be logged in to create a job.");
  }

  // Ensure user exists in our DB (creates with 100 credits if new)
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
  await getOrCreateUser(userId, email);

  // Credit gate: block job creation if out of credits
  if (!(await hasCredits(userId))) {
    throw new Error('Insufficient credits. Please upgrade your plan.');
  }

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