import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

/**
 * Fail-closed tenant guard for server components and route handlers.
 * Returns the authenticated Clerk userId, or redirects to /sign-in when absent.
 * Never fall back to an unscoped ({}) Prisma filter — that reads every tenant's rows.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.userId;
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    redirect('/sign-in');
  }
  return userId;
}
