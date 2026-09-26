import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  dts: true,
  // Derive `.js`/`.d.ts` from the package's `type` instead of tsdown's fixed `.mjs`/`.d.mts`, to
  // match the paths in `exports`.
  fixedExtension: false,
})
