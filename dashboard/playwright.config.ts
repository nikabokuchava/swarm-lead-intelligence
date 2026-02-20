import { defineConfig, devices } from '@playwright/test';

/**
 * TST-02: Playwright configuration for dashboard E2E tests.
 * - Targets the local Next.js dev server at localhost:3000
 * - Reuses existing server in dev (avoids spinning up duplicate)
 * - Single Chromium project for smoke tests
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Fail fast on CI; retry once locally
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
