import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['server/**/*.test.ts', 'admin/**/*.test.ts', 'admin/**/*.test.tsx'],
    exclude: ['server/__tests__/e2e/**', '**/node_modules/**'],
  },
});
