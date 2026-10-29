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

export interface FixturePage {
  /** Base name shared by the page's HTML document and its entry module. */
  name: string
  /** Path to request from the static server. */
  path: string
  /** `#app` text content once the page's dynamically imported chunk has evaluated. */
  text: string
}

/**
 * The fixture ships two pages whose entries import a common module, so every build under test has
 * to emit two HTML documents, two entry chunks, and one chunk shared between them — the shared
 * chunk being the case a single-page fixture cannot reach at all.
 *
 * `text` is what `test/fixtures/shared-static.js` leaves in `#app` once the page has settled, so
 * matching it proves both shared chunks -- the statically imported one and the dynamically imported
 * one -- evaluated in the browser.
 */
export const PAGES: FixturePage[] = [
  {
    name: 'index',
    path: '/',
    text: 'index: shared static chunk loaded, shared dynamic chunk loaded',
  },
  {
    name: 'second',
    path: '/second.html',
    text: 'second: shared static chunk loaded, shared dynamic chunk loaded',
  },
]

export interface BundlerCase {
  /**
   * Asset paths that are expected to be served *without* the skew protection parameter, deduped
   * and sorted across every page in `PAGES`.
   *
   * Every bundler here reaches HTML through this plugin — Vite via `transformIndexHtml`, webpack
   * via html-webpack-plugin's tag hook, Rollup and Rolldown via the HTML that
   * `@rollup/plugin-html` emits — so a build with nothing left unpinned is the expectation, and
   * anything listed is a gap the plugin has yet to close.
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

/**
 * Reads a fixture page and strips the hand-authored `<script>` tag that points at its entry
 * module, leaving markup a bundler can inject its own hashed tag into. Reusing the fixture page
 * rather than generating markup from scratch keeps every build serving the same document — the
 * `#app` mount point included — so the browser assertions do not have to know which bundler
 * produced the page.
 */
async function readPageTemplate(root: string, page: FixturePage): Promise<string> {
  const html = await readFile(join(root, `${page.name}.html`), 'utf8')
  return html.replace(/\s*<script\b[^>]*><\/script>/i, '')
}

function injectScripts(template: string, tags: string[]): string {
  return template.replace('</body>', `  ${tags.join('\n    ')}\n  </body>`)
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
        build: {
          outDir,
          emptyOutDir: true,
          // Vite treats only `index.html` as an entry implicitly, so every other page has to be
          // declared for it to be crawled and emitted at all.
          rollupOptions: { input: PAGES.map((page) => join(root, `${page.name}.html`)) },
        },
      })
    },
  },
  {
    name: 'rollup',
    expectedUnstamped: [],
    build: async (root, outDir) => {
      const bundle = await rollup({
        input: fixtureInput(root),
        plugins: [...(await pageHtmlPlugins(root)), rollupPlugin({ baseDir: root, token: TOKEN })],
      })
      await bundle.write({ dir: outDir, format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name].js' })
      await bundle.close()
    },
  },
  {
    name: 'rolldown',
    expectedUnstamped: [],
    build: async (root, outDir) => {
      const bundle = await rolldown({
        input: fixtureInput(root),
        plugins: [...(await pageHtmlPlugins(root)), rolldownPlugin({ baseDir: root, token: TOKEN })],
      })
      await bundle.write({ dir: outDir, format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name].js' })
      await bundle.close()
    },
  },
  {
    name: 'webpack',
    expectedUnstamped: [],
    build: async (root, outDir) => {
      // html-webpack-plugin renders from a template file, so each page's stripped markup has to be
      // written back out before the compiler starts.
      const templates = await Promise.all(
        PAGES.map(async (page) => {
          const template = join(root, `template-${page.name}.html`)
          await writeFile(template, await readPageTemplate(root, page))
          return { page, template }
        }),
      )

      await new Promise<void>((resolve, reject) => {
        webpack(
          {
            context: root,
            entry: fixtureInput(root),
            mode: 'production',
            optimization: {
              minimize: false,
              // Production webpack splits only async chunks by default, and its 20 kB `minSize`
              // floor would keep this fixture's tiny shared module duplicated into both entry
              // bundles. Both are relaxed so the shared chunk lands in a file of its own, which is
              // the whole point of the two-page fixture.
              splitChunks: { chunks: 'all', minSize: 0 },
            },
            output: { chunkFilename: '[name].chunk.js', filename: '[name].js', path: outDir },
            plugins: [
              ...templates.map(
                ({ page, template }) =>
                  new HtmlWebpackPlugin({ chunks: [page.name], filename: `${page.name}.html`, template }),
              ),
              webpackPlugin({ baseDir: root, token: TOKEN }),
            ],
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

/**
 * Named inputs, so the chunk each page has to load back is identifiable by name in both the
 * Rollup/Rolldown HTML template and webpack's `chunks` filter.
 */
function fixtureInput(root: string): Record<string, string> {
  return Object.fromEntries(PAGES.map((page) => [page.name, join(root, `${page.name}.js`)]))
}

async function pageHtmlPlugins(root: string) {
  return Promise.all(
    PAGES.map(async (page) => {
      const template = await readPageTemplate(root, page)

      return rollupHtmlPlugin({
        fileName: `${page.name}.html`,
        // The default template lists every entry chunk on a single page, so each instance filters
        // the bundle down to the chunk built from its own entry.
        template: ({ files }) =>
          injectScripts(
            template,
            files.js
              .filter((file) => file.type === 'chunk' && file.isEntry && file.name === page.name)
              .map((file) => `<script type="module" src="./${file.fileName}"></script>`),
          ),
      })
    }),
  )
}
