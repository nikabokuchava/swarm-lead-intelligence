import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Minimal unit-test harness for the dashboard (the root Vitest config excludes dashboard/**).
// Scoped to dashboard/tests/** so it does not collide with Playwright E2E.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
  },
});
