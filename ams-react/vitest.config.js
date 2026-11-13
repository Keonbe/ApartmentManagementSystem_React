import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.js on purpose: the unit tests need none of the
// build plugins (React, Tailwind, deploy guard), which crash under Vitest.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
