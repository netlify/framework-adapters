import { join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, test } from 'vitest'

import { assertDefined } from './test-utils.js'
import { buildManifest, writeManifest } from './manifest.js'
import { resolveOptions } from './options.js'

describe('buildManifest', () => {
  test('matches the Netlify Frameworks API skew protection schema', () => {
    const resolved = assertDefined(
      resolveOptions({
        paramName: 'nfdpl',
        patterns: ['.*\\.js$', '.*\\.css$'],
        token: 'abc',
      }),
    )

    expect(buildManifest(resolved)).toEqual({
      patterns: ['.*\\.js$', '.*\\.css$'],
      sources: [
        {
          name: 'nfdpl',
          type: 'query',
        },
      ],
    })
  })
})

describe('writeManifest', () => {
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

  test('writes .netlify/v1/skew-protection.json under baseDir', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'skew-protection-'))
    dirsToClean.push(baseDir)

    const resolved = assertDefined(
      resolveOptions({
        baseDir,
        token: 'abc',
      }),
    )

    await writeManifest(resolved)
    const manifestPath = join(baseDir, '.netlify', 'v1', 'skew-protection.json')
    const contents: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(contents).toEqual(buildManifest(resolved))
  })
})
