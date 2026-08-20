import { join } from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, test } from 'vitest'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack, { type Compiler, type Configuration, type Stats } from 'webpack'

import { applySkewProtectionWebpackPlugin } from './webpack.js'
import { assertDefined } from './test-utils.js'
import { resolveOptions } from './options.js'

function compile(config: Configuration): Promise<Stats> {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        reject(err)
        return
      }

      if (!stats) {
        reject(new Error('webpack compiled without stats'))
        return
      }

      if (stats.hasErrors()) {
        reject(
          new Error(
            stats.toString({
              errorDetails: true,
            }),
          ),
        )

        return
      }

      resolve(stats)
    })
  })
}

// Executes a compiled webpack runtime in a minimal DOM shim and returns URLs
// requested for lazy chunks, letting tests verify actual chunk-loading behavior
// instead of searching bundle source text.

async function captureRequestedUrls(mainBundle: string): Promise<string[]> {
  const capturedUrls: string[] = []

  const context: {
    [key: string]: unknown
    self: unknown
  } = {
    // Webpack's chunk-load runtime schedules a real timeout before `appendChild` and only clears
    // it from the script's `onload`/`onerror` handlers, which this shim never invokes — using the
    // real timers here would leave a live ~120s timer referenced after every call.
    clearTimeout: () => undefined,
    console,
    document: {
      createElement: () => ({}),
      getElementsByTagName: () => [],
      head: {
        appendChild(element: { src?: string }) {
          return capturedUrls.push(element.src ?? '')
        },
      },
    },
    module: {
      exports: {},
    },
    self: undefined,
    setTimeout: () => 0,
  }

  context.self = context
  const vm = await import('node:vm')
  vm.createContext(context)
  vm.runInContext(mainBundle, context, {
    filename: 'main.js',
  })

  await new Promise((resolve) => setTimeout(resolve, 50))
  return capturedUrls
}

describe('applySkewProtectionWebpackPlugin', () => {
  const dirsToClean: string[] = []

  afterEach(async () => {
    await Promise.all(
      dirsToClean.splice(0).map((dir) =>
        rm(dir, {
          force: true,
          recursive: true,
        }),
      ),
    )
  })

  const setupFixture = async () => {
    const root = await mkdtemp(join(tmpdir(), 'skew-protection-webpack-'))
    dirsToClean.push(root)
    await writeFile(join(root, 'index.js'), `import('./lazy.js').then((m) => console.log(m.default))`)
    await writeFile(join(root, 'lazy.js'), `module.exports = 'lazy chunk'`)
    return root
  }

  test('wraps the chunk-loading runtime so lazily loaded chunks are requested with the query parameter', async () => {
    const root = await setupFixture()

    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const stats = await compile({
      context: root,
      entry: join(root, 'index.js'),
      mode: 'production',
      optimization: {
        minimize: false,
      },
      output: {
        filename: 'main.js',
        path: join(root, 'dist'),
        publicPath: '/assets/',
      },
      plugins: [
        {
          apply(compiler: Compiler) {
            applySkewProtectionWebpackPlugin(compiler, resolved)
          },
        },
      ],
    })

    const { chunks } = stats.toJson({
      chunks: true,
    })

    const lazyChunk = assertDefined(assertDefined(chunks).find((chunk) => !chunk.names.includes('main')))
    const lazyChunkFile = assertDefined(lazyChunk.files)[0]

    const mainBundle = await readFile(join(root, 'dist', 'main.js'), 'utf8')
    expect(mainBundle).toContain('?nfdpl=abc123')

    const capturedUrls = await captureRequestedUrls(mainBundle)
    expect(capturedUrls).toEqual([`/assets/${lazyChunkFile}?nfdpl=abc123`])
  })

  test('matches each chunk against the configured patterns individually, not by a fixed asset-type probe', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skew-protection-webpack-'))
    dirsToClean.push(root)

    await writeFile(
      join(root, 'index.js'),
      [
        `import(/* webpackChunkName: "included" */ './included.js').then((m) => console.log(m.default))`,
        `import(/* webpackChunkName: "excluded" */ './excluded.js').then((m) => console.log(m.default))`,
      ].join('\n'),
    )
    await writeFile(join(root, 'included.js'), `module.exports = 'included chunk'`)
    await writeFile(join(root, 'excluded.js'), `module.exports = 'excluded chunk'`)

    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        // Matches only the "included" chunk's generated filename — not "excluded.js" or
        // "main.js" — a shape the old fixed `__netlify_probe__.js`/`.css` classification
        // couldn't honor, since it stamped (or skipped) an entire asset type at once.
        patterns: ['^included\\.js$'],
        token: 'abc123',
      }),
    )

    await compile({
      context: root,
      entry: join(root, 'index.js'),
      mode: 'production',
      optimization: {
        minimize: false,
      },
      output: {
        chunkFilename: '[name].js',
        filename: 'main.js',
        path: join(root, 'dist'),
        publicPath: '/assets/',
      },
      plugins: [
        {
          apply(compiler: Compiler) {
            applySkewProtectionWebpackPlugin(compiler, resolved)
          },
        },
      ],
    })

    const mainBundle = await readFile(join(root, 'dist', 'main.js'), 'utf8')
    const capturedUrls = await captureRequestedUrls(mainBundle)

    expect(capturedUrls).toContainEqual('/assets/included.js?nfdpl=abc123')
    expect(capturedUrls).toContainEqual('/assets/excluded.js')
  })

  test('is a no-op when patterns do not match JS/CSS assets', async () => {
    const root = await setupFixture()

    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        patterns: ['.*\\.wasm$'],
        token: 'abc123',
      }),
    )

    const stats = await compile({
      context: root,
      entry: join(root, 'index.js'),
      mode: 'production',
      optimization: {
        minimize: false,
      },
      output: {
        filename: 'main.js',
        path: join(root, 'dist'),
        publicPath: '/assets/',
      },
      plugins: [
        {
          apply(compiler: Compiler) {
            applySkewProtectionWebpackPlugin(compiler, resolved)
          },
        },
      ],
    })

    const { chunks } = stats.toJson({
      chunks: true,
    })

    const lazyChunk = assertDefined(assertDefined(chunks).find((chunk) => !chunk.names.includes('main')))
    const lazyChunkFile = assertDefined(lazyChunk.files)[0]

    const mainBundle = await readFile(join(root, 'dist', 'main.js'), 'utf8')
    const capturedUrls = await captureRequestedUrls(mainBundle)

    expect(capturedUrls).toEqual([`/assets/${lazyChunkFile}`])
  })

  test('decorates initial script/link tags emitted by html-webpack-plugin', async () => {
    const root = await setupFixture()
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    await compile({
      context: root,
      entry: join(root, 'index.js'),
      mode: 'production',
      optimization: {
        minimize: false,
      },
      output: {
        filename: 'main.js',
        path: join(root, 'dist'),
        publicPath: '/assets/',
      },
      plugins: [
        new HtmlWebpackPlugin(),
        {
          apply(compiler: Compiler) {
            applySkewProtectionWebpackPlugin(compiler, resolved)
          },
        },
      ],
    })

    const html = await readFile(join(root, 'dist', 'index.html'), 'utf8')
    expect(html).toContain('nfdpl=abc123')
  })
})
