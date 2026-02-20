import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run tests in the project-root tests/ directory.
    // dashboard/tests/e2e/ is Playwright territory — exclude from Vitest.
    include: ['tests/**/*.{test,spec}.{ts,js}'],
    exclude: ['**/node_modules/**', 'dashboard/**'],
  },
});
