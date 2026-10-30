import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'playtest/**/*.test.ts'],
    environment: 'node',
    // Shared machine, RAM is tight: never more than two workers.
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
