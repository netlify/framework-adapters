import { argv } from 'node:process'

import { defineConfig } from 'tsup'

export default defineConfig([
  {
    clean: true,
    entry: ['src/main.ts'],
    outDir: 'dist',
    // Dual CJS+ESM: the primary consumer (a webpack config) may itself load as
    // either module system, so we ship both.
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    watch: argv.includes('--watch'),
    platform: 'node',
    bundle: true,
    external: ['webpack', 'html-webpack-plugin'],
  },
])
