import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'supabase/tests/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    // Each DB test file builds a fresh PGlite database (all migrations + full catalogue) in beforeAll.
    hookTimeout: 60_000,
  },
});
