import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/proof/p2Schedule/kill.ts'],
    includeTaskLocation: true,
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
