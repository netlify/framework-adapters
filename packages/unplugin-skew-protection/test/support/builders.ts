import { copyFile, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import { build as viteBuild } from 'vite'
import { rolldown } from 'rolldown'
import { rollup } from 'rollup'
import rollupHtmlPluginModule from '@rollup/plugin-html'

import vitePlugin from '../../src/vite.js'
import rollupPlugin from '../../src/rollup.js'
import rolldownPlugin from '../../src/rolldown.js'
import webpackPlugin from '../../src/webpack.js'

// `@rollup/plugin-html` ships CJS-flavoured types for its ESM build, so under NodeNext the
// default import is typed as the module namespace rather than the plugin factory.
const rollupHtmlPlugin = rollupHtmlPluginModule as unknown as typeof rollupHtmlPluginModule.default

export const TOKEN = 'e2e-token-123'

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

export interface BundlerCase {
  /**
   * Asset paths that are expected to be served *without* the skew protection parameter.
   *
   * Only Vite and webpack expose an HTML hook to this plugin, so only they can pin the
   * initial `<script>`. Plain Rollup and Rolldown emit no HTML, so the entry tag in a
   * hand-authored page stays unpinned and only the dynamic import is stamped.
   */
  expectedUnstamped: string[]
  build: (root: string, outDir: string) => Promise<void>
  name: string
}

export async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'skew-protection-e2e-'))
  // The fixture is a flat directory, so copying file by file avoids `fs.cp`, which is still
  // experimental below Node 22.3 and this package supports Node 20.
  const entries = await readdir(FIXTURE_DIR)
  await Promise.all(entries.map((entry) => copyFile(join(FIXTURE_DIR, entry), join(root, entry))))
  return root
}

export const BUNDLERS: BundlerCase[] = [
  {
    name: 'vite',
    expectedUnstamped: [],
    build: async (root, outDir) => {
      await viteBuild({
        root,
        logLevel: 'silent',
        plugins: [vitePlugin({ baseDir: root, token: TOKEN })],
        build: { outDir, emptyOutDir: true },
      })
    },
  },
  {
    name: 'rollup',
    expectedUnstamped: [],
    build: async (root, outDir) => {
      const bundle = await rollup({
        input: join(root, 'entry.js'),
        plugins: [rollupHtmlPlugin(), rollupPlugin({ baseDir: root, token: TOKEN })],
      })
      await bundle.write({ dir: outDir, format: 'es', entryFileNames: 'entry.js', chunkFileNames: '[name].js' })
      await bundle.close()
    },
  },
  {
    name: 'rolldown',
    expectedUnstamped: [],
    build: async (root, outDir) => {
      const bundle = await rolldown({
        input: join(root, 'entry.js'),
        plugins: [rollupHtmlPlugin(), rolldownPlugin({ baseDir: root, token: TOKEN })],
      })
      await bundle.write({ dir: outDir, format: 'es', entryFileNames: 'entry.js', chunkFileNames: '[name].js' })
      await bundle.close()
    },
  },
  {
    name: 'webpack',
    expectedUnstamped: [],
    build: async (root, outDir) => {
      // html-webpack-plugin injects its own tag for the entry, so the template must not carry
      // the fixture's `<script src="./entry.js">` as well.
      const template = join(root, 'template.html')
      const html = await readFile(join(root, 'index.html'), 'utf8')
      await writeFile(template, html.replace(/\s*<script\b[^>]*><\/script>/i, ''))

      await new Promise<void>((resolve, reject) => {
        webpack(
          {
            context: root,
            entry: join(root, 'entry.js'),
            mode: 'production',
            optimization: { minimize: false },
            output: { chunkFilename: '[name].chunk.js', filename: 'main.js', path: outDir },
            plugins: [new HtmlWebpackPlugin({ template }), webpackPlugin({ baseDir: root, token: TOKEN })],
          },
          (err, stats) => {
            if (err) {
              reject(err)
              return
            }

            if (stats?.hasErrors()) {
              reject(new Error(stats.toString({ errorDetails: true })))
              return
            }

            resolve()
          },
        )
      })
    },
  },
]
