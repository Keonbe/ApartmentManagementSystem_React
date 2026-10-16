import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['*.test.js'],
    globalSetup: './setup/global.js',
    setupFiles: ['./setup/reset.js'],
    // One shared scratch DB: files run one at a time, each from a fresh reload.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
