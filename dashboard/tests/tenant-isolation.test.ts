import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { requireUserId } from '@/lib/tenant';

describe('requireUserId Tenant Guard (Fail-Closed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /sign-in when auth() returns null userId', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);

    await expect(requireUserId()).rejects.toThrow('NEXT_REDIRECT:/sign-in');
    expect(redirect).toHaveBeenCalledWith('/sign-in');
  });

  it('redirects to /sign-in when auth() returns undefined session', async () => {
    vi.mocked(auth).mockResolvedValue({} as any);

    await expect(requireUserId()).rejects.toThrow('NEXT_REDIRECT:/sign-in');
    expect(redirect).toHaveBeenCalledWith('/sign-in');
  });

  it('returns valid userId when authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user_clerk_987' } as any);

    const userId = await requireUserId();
    expect(userId).toBe('user_clerk_987');
    expect(redirect).not.toHaveBeenCalled();
  });
});
