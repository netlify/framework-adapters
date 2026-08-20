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

    // Execute the compiled runtime in a minimal DOM shim and confirm the script
    // element created for the lazily loaded chunk carries the query parameter.
    const capturedUrls: string[] = []

    const context: {
      [key: string]: unknown
      self: unknown
    } = {
      clearTimeout,
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
      setTimeout,
    }

    context.self = context
    const vm = await import('node:vm')
    vm.createContext(context)
    vm.runInContext(mainBundle, context, {
      filename: 'main.js',
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(capturedUrls).toEqual([`/assets/${lazyChunkFile}?nfdpl=abc123`])
  })

  test('only wraps the JS chunk-filename function when patterns match JS but not CSS', async () => {
    const root = await setupFixture()

    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        patterns: ['.*\\.(js|mjs|cjs)$'],
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
        {
          apply(compiler: Compiler) {
            applySkewProtectionWebpackPlugin(compiler, resolved)
          },
        },
      ],
    })

    const mainBundle = await readFile(join(root, 'dist', 'main.js'), 'utf8')
    expect(mainBundle).toContain('__netlifyOrigChunkScriptFilename__')
    expect(mainBundle).not.toContain('__netlifyOrigChunkCssFilename__')
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
        {
          apply(compiler: Compiler) {
            applySkewProtectionWebpackPlugin(compiler, resolved)
          },
        },
      ],
    })

    const mainBundle = await readFile(join(root, 'dist', 'main.js'), 'utf8')
    // Asserts against the suffix this exact config would produce, rather than a bare
    // paramName substring — so the check can't coincidentally pass if the default paramName
    // ever changes to something that no longer happens to match the literal here.
    expect(mainBundle).not.toContain(`?${resolved.paramName}=${resolved.token}`)
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
