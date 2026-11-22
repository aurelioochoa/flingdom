import { defineConfig } from 'vitest/config';

// src/sim/ imports no DOM, so the tests run headless in Node, in the real engine (design §B).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 300_000,
  },
});
