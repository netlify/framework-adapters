import { describe, expect, test } from 'vitest'
import * as rollupHtmlPlugin from '@rollup/plugin-html'
import { rolldown } from 'rolldown'
import { rollup, type OutputAsset, type OutputChunk, type Plugin } from 'rollup'

import { assertDefined } from './test-utils.js'
import { createRolldownRollupHooks } from './rollup.js'
import { resolveOptions } from './options.js'

function isEntryChunk(chunk: { isEntry?: boolean; type: string }): chunk is OutputChunk {
  return chunk.type === 'chunk' && Boolean(chunk.isEntry)
}

function isAsset(file: { type: string }): file is OutputAsset {
  return file.type === 'asset'
}

// @rollup/plugin-html's package.json has a single, non-conditional `types` entry, which
// TypeScript's NodeNext resolution can't correctly unwrap as a default export, typing `.default`
// as the (uncallable) namespace itself rather than the actual function it holds at runtime.
const html = rollupHtmlPlugin.default as unknown as (options?: Record<string, unknown>) => Plugin

describe('createRolldownRollupHooks', () => {
  test('appends the query parameter to rendered dynamic import() calls', async () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const virtualFiles: Record<string, string> = {
      'entry.js': `import('lazy.js').then((m) => console.log(m.default))`,
      'lazy.js': `export default 'lazy chunk'`,
    }

    const virtualPlugin = {
      load(id: string) {
        return virtualFiles[id]
      },
      name: 'virtual',
      resolveId(id: string) {
        const key = id.replace(/^\.\//, '')
        return key in virtualFiles ? key : null
      },
    }

    const bundle = await rollup({
      input: 'entry.js',
      plugins: [
        virtualPlugin,
        {
          name: 'skew-protection',
          ...createRolldownRollupHooks(resolved),
        },
      ],
    })

    const { output } = await bundle.generate({
      format: 'es',
      sourcemap: true,
    })

    const entryChunk = assertDefined(output.find(isEntryChunk))
    expect(entryChunk.code).toContain('?nfdpl=abc123')
    expect(entryChunk.map?.mappings).toBeTruthy()
  })

  test('is a no-op when patterns do not match JS assets', async () => {
    const resolved = assertDefined(
      resolveOptions({
        patterns: ['.*\\.wasm$'],
        token: 'abc123',
      }),
    )

    const virtualFiles: Record<string, string> = {
      'entry.js': `import('lazy.js').then((m) => console.log(m.default))`,
      'lazy.js': `export default 'lazy chunk'`,
    }

    const virtualPlugin = {
      load(id: string) {
        return virtualFiles[id]
      },
      name: 'virtual',
      resolveId(id: string) {
        const key = id.replace(/^\.\//, '')
        return key in virtualFiles ? key : null
      },
    }

    const bundle = await rollup({
      input: 'entry.js',
      plugins: [virtualPlugin, { name: 'skew-protection', ...createRolldownRollupHooks(resolved) }],
    })

    const { output } = await bundle.generate({ format: 'es', sourcemap: true })

    const entryChunk = assertDefined(output.find(isEntryChunk))
    expect(entryChunk.code).not.toContain('nfdpl')
  })

  test('appends the query parameter when run directly through Rolldown', async () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const virtualFiles: Record<string, string> = {
      'entry.js': `import('lazy.js').then((m) => console.log(m.default))`,
      'lazy.js': `export default 'lazy chunk'`,
    }

    const virtualPlugin = {
      load(id: string) {
        return virtualFiles[id]
      },
      name: 'virtual',
      resolveId(id: string) {
        const key = id.replace(/^\.\//, '')
        return key in virtualFiles ? key : null
      },
    }

    const bundle = await rolldown({
      input: 'entry.js',
      plugins: [virtualPlugin, { name: 'skew-protection', ...createRolldownRollupHooks(resolved) }],
    })

    const { output } = await bundle.generate({ format: 'es' })

    // Rolldown's OutputChunk isn't compatible with Rollup's type predicate,
    // so find the chunk without it and assert only the shape this test needs.
    const entryChunk = assertDefined(output.find((chunk) => chunk.type === 'chunk' && chunk.isEntry)) as {
      code: string
    }

    expect(entryChunk.code).toContain('?nfdpl=abc123')
  })

  test('decorates an HTML asset emitted by another plugin (e.g. @rollup/plugin-html)', async () => {
    const resolved = assertDefined(resolveOptions({ paramName: 'nfdpl', token: 'abc123' }))

    const virtualPlugin = {
      load: (id: string) => (id === 'entry.js' ? `console.log('hi')` : null),
      name: 'virtual',
      resolveId: (id: string) => (id === 'entry.js' ? id : null),
    }

    const bundle = await rollup({
      input: 'entry.js',
      plugins: [virtualPlugin, html(), { name: 'skew-protection', ...createRolldownRollupHooks(resolved) }],
    })

    const { output } = await bundle.generate({ format: 'es' })

    const htmlAsset = assertDefined(output.filter(isAsset).find((asset) => asset.fileName === 'index.html'))
    expect(String(htmlAsset.source)).toContain('?nfdpl=abc123')
  })

  test('decorates the HTML asset regardless of plugin registration order', async () => {
    const resolved = assertDefined(resolveOptions({ paramName: 'nfdpl', token: 'abc123' }))

    const virtualPlugin = {
      load: (id: string) => (id === 'entry.js' ? `console.log('hi')` : null),
      name: 'virtual',
      resolveId: (id: string) => (id === 'entry.js' ? id : null),
    }

    // The HTML-emitting plugin is registered *after* skew-protection here — `order: 'post'` on
    // our `generateBundle` hook must still guarantee it runs once the asset already exists.
    const bundle = await rollup({
      input: 'entry.js',
      plugins: [virtualPlugin, { name: 'skew-protection', ...createRolldownRollupHooks(resolved) }, html()],
    })

    const { output } = await bundle.generate({ format: 'es' })

    const htmlAsset = assertDefined(output.filter(isAsset).find((asset) => asset.fileName === 'index.html'))
    expect(String(htmlAsset.source)).toContain('?nfdpl=abc123')
  })

  test('decorates an HTML asset emitted through Rolldown', async () => {
    const resolved = assertDefined(resolveOptions({ paramName: 'nfdpl', token: 'abc123' }))

    const virtualPlugin = {
      load: (id: string) => (id === 'entry.js' ? `console.log('hi')` : null),
      name: 'virtual',
      resolveId: (id: string) => (id === 'entry.js' ? id : null),
    }

    const bundle = await rolldown({
      input: 'entry.js',
      plugins: [virtualPlugin, html(), { name: 'skew-protection', ...createRolldownRollupHooks(resolved) }],
    })

    const { output } = await bundle.generate({ format: 'es' })

    const htmlAsset = assertDefined(
      output.find((file) => file.type === 'asset' && file.fileName === 'index.html'),
    ) as { source: string | Uint8Array }
    expect(String(htmlAsset.source)).toContain('?nfdpl=abc123')
  })
})
