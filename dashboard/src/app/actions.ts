'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function createScrapeJob(formData: FormData) {
  const query = formData.get('query') as string;
  const maxResults = Number(formData.get('maxResults')) || 20;

  if (!query || query.trim() === '') {
    throw new Error('Query is required');
  }

  await prisma.scrapeJob.create({
    data: {
      query,
      maxResults,
      status: 'PENDING',
    },
  });

  revalidatePath('/jobs');
}
