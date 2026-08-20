import { init, parse } from 'es-module-lexer'
import { describe, expect, test } from 'vitest'
import { rolldown } from 'rolldown'
import { rollup, type OutputChunk } from 'rollup'

import { assertDefined } from './test-utils.js'
import { createRenderChunk, createRollupHooks } from './render-chunk.js'
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

describe('createRenderChunk', () => {
  test('ignores dynamic-import-shaped text inside comments', async () => {
    const resolved = assertDefined(resolveOptions({ paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = `// import('lazy.js')\n/* import('lazy.js') */\nconsole.log('noop')`
    expect(await renderChunk(code)).toBeNull()
  })

  test('ignores dynamic-import-shaped text inside string literals', async () => {
    const resolved = assertDefined(resolveOptions({ paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = `console.log("import('lazy.js')")`
    expect(await renderChunk(code)).toBeNull()
  })

  test('stamps a real dynamic import that sits alongside comments and string literals', async () => {
    const resolved = assertDefined(resolveOptions({ paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = `// import('lazy.js')\nconsole.log("import('lazy.js')")\nimport('lazy.js')`
    const result = assertDefined(await renderChunk(code))

    expect(result.code).toBe(`// import('lazy.js')\nconsole.log("import('lazy.js')")\nimport("lazy.js?nfdpl=abc123")`)
  })

  test('stamps a dynamic import that passes an options argument', async () => {
    const resolved = assertDefined(resolveOptions({ patterns: ['.*\\.json$'], paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = `import('lazy.json', { with: { type: 'json' } })`
    const result = assertDefined(await renderChunk(code))

    expect(result.code).toBe(`import("lazy.json?nfdpl=abc123", { with: { type: 'json' } })`)
  })

  test('is a no-op for a dynamic import with a non-literal specifier', async () => {
    const resolved = assertDefined(resolveOptions({ paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = `const path = 'lazy.js'; import(path)`
    expect(await renderChunk(code)).toBeNull()
  })

  test('merges with an existing query string instead of appending a second "?"', async () => {
    // A pattern without a `.js$` anchor, since the default patterns wouldn't match a specifier
    // that already ends in a query string or fragment.
    const resolved = assertDefined(resolveOptions({ patterns: ['^lazy\\.js'], paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = `import('lazy.js?v=1')`
    const result = assertDefined(await renderChunk(code))

    expect(result.code).toBe(`import("lazy.js?v=1&nfdpl=abc123")`)
  })

  test('inserts before a URL fragment instead of appending after it', async () => {
    const resolved = assertDefined(resolveOptions({ patterns: ['^lazy\\.js'], paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = `import('lazy.js#foo')`
    const result = assertDefined(await renderChunk(code))

    expect(result.code).toBe(`import("lazy.js?nfdpl=abc123#foo")`)
  })

  test('stamps a specifier even when the marker text appears inside another query value', async () => {
    const resolved = assertDefined(resolveOptions({ patterns: ['^lazy\\.js'], paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = `import('lazy.js?debug=nfdpl=abc123')`
    const result = assertDefined(await renderChunk(code))

    expect(result.code).toBe(`import("lazy.js?debug=nfdpl=abc123&nfdpl=abc123")`)
  })

  test('does not re-stamp a specifier that already carries the exact marker', async () => {
    const resolved = assertDefined(resolveOptions({ patterns: ['^lazy\\.js'], paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = `import('lazy.js?nfdpl=abc123')`
    expect(await renderChunk(code)).toBeNull()
  })

  test('produces valid JavaScript for a specifier containing an escaped quote', async () => {
    const resolved = assertDefined(resolveOptions({ paramName: 'nfdpl', token: 'abc123' }))
    const renderChunk = createRenderChunk(resolved)

    const code = String.raw`import("./lazy\"chunk.js")`
    const result = assertDefined(await renderChunk(code))

    expect(result.code).toBe(String.raw`import("./lazy\"chunk.js?nfdpl=abc123")`)

    await init
    const [imports] = parse(result.code)
    expect(imports).toHaveLength(1)
    expect(imports[0]?.n).toBe('./lazy"chunk.js?nfdpl=abc123')
  })
})
