import { test, expect } from '@playwright/test';

/**
 * TST-02: Dashboard smoke tests.
 * 
 * These are structural UI tests — no DB mutations, no scraping.
 * They verify the application shell loads correctly.
 */

test.describe('Landing Page', () => {
  test('loads and contains the "Start Scraping" CTA', async ({ page }) => {
    await page.goto('/');

    // Page must return a successful response
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);

    // The primary CTA text is present
    await expect(page.getByText('Start Scraping for Free')).toBeVisible();

    // CTA links to /dashboard
    const ctaLink = page.getByRole('link', { name: /Start Scraping/i }).first();
    await expect(ctaLink).toHaveAttribute('href', '/dashboard');
  });

  test('has a non-empty page title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.trim().length).toBeGreaterThan(0);
  });

  test('contains a Login or Get Started link pointing to /dashboard', async ({ page }) => {
    await page.goto('/');

    // Both the "Login" and "Get Started" nav links point to /dashboard
    const dashboardLinks = page.getByRole('link', { name: /login|get started/i });
    const count = await dashboardLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Spot-check: first match points to /dashboard
    await expect(dashboardLinks.first()).toHaveAttribute('href', '/dashboard');
  });
});

test.describe('Dashboard Route', () => {
  test('navigating to /dashboard responds without a server error', async ({ page }) => {
    // The route may redirect to Clerk sign-in — that is expected.
    // We only assert no 5xx server error occurs.
    const response = await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status).toBeLessThan(500);
  });
});
