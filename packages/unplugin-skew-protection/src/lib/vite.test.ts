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
