import { argv } from 'node:process'

import { defineConfig } from 'tsup'

export default defineConfig([
  {
    bundle: true,
    clean: true,
    dts: true,
    entry: ['src/rolldown.ts', 'src/rollup.ts', 'src/vite.ts', 'src/webpack.ts'],
    external: ['html-webpack-plugin', 'rolldown', 'rollup', 'vite', 'webpack'],
    format: ['esm'],
    platform: 'node',
    outDir: 'dist',
    splitting: false,
    watch: argv.includes('--watch'),
  },
])
