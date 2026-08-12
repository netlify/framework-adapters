import { env } from 'node:process'
import { join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, test } from 'vitest'
import { rollup, type OutputChunk } from 'rollup'

import { assertDefined } from './lib/test-utils.js'
import skewProtection from './main.js'

const isEntryChunk = (chunk: { type: string; isEntry?: boolean }): chunk is OutputChunk =>
  chunk.type === 'chunk' && Boolean(chunk.isEntry)

describe('skewProtection', () => {
  const dirsToClean: string[] = []
  const originalToken = env.NETLIFY_SKEW_PROTECTION_TOKEN

  afterEach(async () => {
    await Promise.all(dirsToClean.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
    if (originalToken === undefined) {
      delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    } else {
      env.NETLIFY_SKEW_PROTECTION_TOKEN = originalToken
    }
  })

  test('is a no-op rollup plugin when no token is configured', async () => {
    delete env.NETLIFY_SKEW_PROTECTION_TOKEN

    const virtualPlugin = {
      name: 'virtual',
      resolveId: (id: string) => (id === 'entry.js' ? id : null),
      load: (id: string) => (id === 'entry.js' ? `console.log('hi')` : null),
    }

    const bundle = await rollup({ input: 'entry.js', plugins: [virtualPlugin, skewProtection.rollup()] })
    const { output } = await bundle.generate({ format: 'es' })
    const entryChunk = assertDefined(output.find(isEntryChunk))
    expect(entryChunk.code).not.toContain('nfdpl')
  })

  test('writes the skew-protection manifest and stamps dynamic imports for a rollup build', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'skew-protection-main-'))
    dirsToClean.push(baseDir)

    const virtualFiles: Record<string, string> = {
      'entry.js': `import('lazy.js').then((m) => console.log(m.default))`,
      'lazy.js': `export default 'lazy chunk'`,
    }
    const virtualPlugin = {
      name: 'virtual',
      resolveId(id: string) {
        const key = id.replace(/^\.\//, '')
        return key in virtualFiles ? key : null
      },
      load(id: string) {
        return virtualFiles[id]
      },
    }

    const bundle = await rollup({
      input: 'entry.js',
      plugins: [virtualPlugin, skewProtection.rollup({ token: 'abc123', paramName: 'nfdpl', baseDir })],
    })
    const { output } = await bundle.write({ format: 'es', dir: join(baseDir, 'dist') })

    const entryChunk = assertDefined(output.find(isEntryChunk))
    expect(entryChunk.code).toContain('?nfdpl=abc123')

    const manifest: unknown = JSON.parse(
      await readFile(join(baseDir, '.netlify', 'v1', 'skew-protection.json'), 'utf8'),
    )
    expect(manifest).toEqual({
      patterns: ['.*\\.(js|mjs|cjs)$', '.*\\.css$'],
      sources: [{ type: 'query', name: 'nfdpl' }],
    })
  })
})
