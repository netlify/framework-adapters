import { describe, expect, test } from 'vitest'
import { rolldown } from 'rolldown'
import { rollup, type OutputChunk } from 'rollup'

import { assertDefined } from './test-utils.js'
import { createRollupHooks } from './render-chunk.js'
import { resolveOptions } from './options.js'

function isEntryChunk(chunk: { isEntry?: boolean; type: string }): chunk is OutputChunk {
  return chunk.type === 'chunk' && Boolean(chunk.isEntry)
}

describe('createRollupHooks', () => {
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
          ...createRollupHooks(resolved),
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
      plugins: [virtualPlugin, { name: 'skew-protection', ...createRollupHooks(resolved) }],
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
      plugins: [virtualPlugin, { name: 'skew-protection', ...createRollupHooks(resolved) }],
    })

    const { output } = await bundle.generate({ format: 'es' })

    // Rolldown's OutputChunk isn't compatible with Rollup's type predicate,
    // so find the chunk without it and assert only the shape this test needs.
    const entryChunk = assertDefined(output.find((chunk) => chunk.type === 'chunk' && chunk.isEntry)) as {
      code: string
    }

    expect(entryChunk.code).toContain('?nfdpl=abc123')
  })
})
