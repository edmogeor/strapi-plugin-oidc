import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./server/__tests__/e2e/setup.ts'],
    include: ['server/__tests__/e2e/**/*.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
    pool: 'forks',
    alias: {
      'lodash/fp': 'lodash/fp.js',
    },
    server: {
      deps: {
        inline: [/@strapi\/.*/],
      }
    }
  },
});