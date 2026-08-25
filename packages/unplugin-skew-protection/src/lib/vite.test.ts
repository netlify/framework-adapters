import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { build as viteBuild } from 'vite'
import { describe, expect, test } from 'vitest'

import { assertDefined } from './test-utils.js'
import { createViteHooks } from './vite.js'
import { resolveOptions } from './options.js'

async function readAllFileContents(dir: string): Promise<string> {
  const relativePaths = await readdir(dir, { recursive: true })
  const contents = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const fullPath = path.join(dir, relativePath)
      const stats = await stat(fullPath)
      return stats.isFile() ? readFile(fullPath, 'utf8') : ''
    }),
  )
  return contents.join('\n')
}

describe('createViteHooks', () => {
  test('only applies during build', () => {
    const resolved = assertDefined(
      resolveOptions({
        token: 'abc123',
      }),
    )

    expect(createViteHooks(resolved).apply).toBe('build')
  })

  test('decorates initial <script> and <link> tags matching the configured patterns', () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const hooks = createViteHooks(resolved)
    const transformIndexHtml = assertDefined(hooks.transformIndexHtml) as (html: string) => string

    const html = [
      '<html><head>',
      '<link rel="stylesheet" crossorigin href="/assets/index-abc.css">',
      '<link rel="icon" href="/favicon.ico">',
      '</head><body>',
      '<script type="module" crossorigin src="/assets/index-abc.js"></script>',
      '</body></html>',
    ].join('')

    const result = transformIndexHtml(html)
    expect(result).toContain('href="/assets/index-abc.css?nfdpl=abc123"')
    expect(result).toContain('src="/assets/index-abc.js?nfdpl=abc123"')
    expect(result).toContain('href="/favicon.ico"')
  })

  test('decorates uppercase tags and single-quoted attributes', () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const hooks = createViteHooks(resolved)
    const transformIndexHtml = assertDefined(hooks.transformIndexHtml) as (html: string) => string

    const html = [
      '<HTML><HEAD>',
      "<LINK REL='stylesheet' HREF='/assets/index-abc.css'>",
      "<SCRIPT TYPE='module' SRC='/assets/index-abc.js'></SCRIPT>",
      '</HEAD></HTML>',
    ].join('')

    const result = transformIndexHtml(html)
    expect(result).toContain("href='/assets/index-abc.css?nfdpl=abc123'")
    expect(result).toContain("src='/assets/index-abc.js?nfdpl=abc123'")
  })

  test('does not mistake a data-src attribute for src', () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const hooks = createViteHooks(resolved)
    const transformIndexHtml = assertDefined(hooks.transformIndexHtml) as (html: string) => string

    const html = '<script data-src="/assets/lazy-preview.js" src="/assets/index-abc.js"></script>'

    const result = transformIndexHtml(html)
    expect(result).toContain('data-src="/assets/lazy-preview.js"')
    expect(result).toContain('src="/assets/index-abc.js?nfdpl=abc123"')
  })

  test('does not mistake a colon-namespaced data:src attribute for src', () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const hooks = createViteHooks(resolved)
    const transformIndexHtml = assertDefined(hooks.transformIndexHtml) as (html: string) => string

    const html = '<script data:src="/assets/lazy-preview.js" src="/assets/index-abc.js"></script>'

    const result = transformIndexHtml(html)
    expect(result).toContain('data:src="/assets/lazy-preview.js"')
    expect(result).toContain('src="/assets/index-abc.js?nfdpl=abc123"')
  })

  test('does not decorate a script tag written inside an HTML comment', () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const hooks = createViteHooks(resolved)
    const transformIndexHtml = assertDefined(hooks.transformIndexHtml) as (html: string) => string

    const html = [
      '<!--',
      '<script src="/assets/index-abc.js"></script>',
      '-->',
      '<script src="/assets/index-real.js"></script>',
    ].join('\n')

    const result = transformIndexHtml(html)
    expect(result).toContain('<script src="/assets/index-abc.js"></script>\n-->')
    expect(result).toContain('src="/assets/index-real.js?nfdpl=abc123"')
  })

  test('does not decorate a string literal inside a script body that looks like a tag', () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const hooks = createViteHooks(resolved)
    const transformIndexHtml = assertDefined(hooks.transformIndexHtml) as (html: string) => string

    const html = `<script>const s = "<script src=quux.js>"</script><script src="/assets/index-real.js"></script>`

    const result = transformIndexHtml(html)
    expect(result).toContain('const s = "<script src=quux.js>"')
    expect(result).toContain('src="/assets/index-real.js?nfdpl=abc123"')
  })

  test('escapes a decoded quote in the matched URL instead of injecting a new attribute', () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        patterns: ['^/assets/'],
        token: 'abc123',
      }),
    )

    const hooks = createViteHooks(resolved)
    const transformIndexHtml = assertDefined(hooks.transformIndexHtml) as (html: string) => string
    const html = '<script src="/assets/app.js&quot; onload=&quot;evil()"></script>'
    const result = transformIndexHtml(html)
    expect(result).not.toContain('" onload="')
    expect(result).toContain('src="/assets/app.js&quot; onload=&quot;evil()?nfdpl=abc123"')
  })

  test('decorates unquoted attribute values', () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        token: 'abc123',
      }),
    )

    const hooks = createViteHooks(resolved)
    const transformIndexHtml = assertDefined(hooks.transformIndexHtml) as (html: string) => string

    const html = [
      '<html><head>',
      '<link rel=stylesheet href=/assets/index-abc.css>',
      '</head><body>',
      '<script type=module src=/assets/index-abc.js></script>',
      '</body></html>',
    ].join('')

    const result = transformIndexHtml(html)
    expect(result).toContain('href="/assets/index-abc.css?nfdpl=abc123"')
    expect(result).toContain('src="/assets/index-abc.js?nfdpl=abc123"')
  })

  test('stamps a lazily-loaded chunk in a real Vite build', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skew-protection-vite-'))

    try {
      await writeFile(path.join(root, 'entry.js'), `import('./lazy.js').then((m) => console.log(m.default))`)
      await writeFile(path.join(root, 'lazy.js'), `export default 'lazy chunk'`)

      const resolved = assertDefined(
        resolveOptions({
          paramName: 'nfdpl',
          token: 'abc123',
        }),
      )

      await viteBuild({
        root,
        logLevel: 'silent',
        plugins: [{ name: 'skew-protection', ...createViteHooks(resolved) }],
        build: {
          outDir: 'dist',
          rollupOptions: {
            input: path.join(root, 'entry.js'),
          },
        },
      })

      const output = await readAllFileContents(path.join(root, 'dist'))
      expect(output).toContain('?nfdpl=abc123')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
