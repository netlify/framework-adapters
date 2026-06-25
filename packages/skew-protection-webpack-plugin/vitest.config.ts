import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Each test runs a real webpack compile, which can be slow on CI/Windows.
    testTimeout: 30_000,
  },
})
