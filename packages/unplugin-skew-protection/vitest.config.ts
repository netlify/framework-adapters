import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      NO_COLOR: 'true',
    },
    // The e2e suite builds the fixture with four bundlers and drives a real browser.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
})
