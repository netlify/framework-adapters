import { init, parse } from 'es-module-lexer'
import { describe, expect, test } from 'vitest'

import { assertDefined } from './test-utils.js'
import { createRenderChunk } from './render-chunk.js'
import { resolveOptions } from './options.js'

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
