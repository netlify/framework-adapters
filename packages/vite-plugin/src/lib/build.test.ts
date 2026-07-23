import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { build } from 'vite'

import { createSpaConfigPlugin } from './build.js'

describe('createSpaConfigPlugin', () => {
  let root: string

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'vite-plugin-netlify-spa-config-')))
    await writeFile(join(root, 'index.html'), '<!doctype html><html><body>Hello</body></html>')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const configPath = () => join(root, '.netlify/v1/config.json')
  const readConfig = async (): Promise<unknown> => JSON.parse(await readFile(configPath(), 'utf8'))

  test('writes build.spa = true for a default (SPA) app', async () => {
    await build({
      root,
      logLevel: 'silent',
      plugins: [createSpaConfigPlugin()],
    })

    expect(await readConfig()).toEqual({ build: { spa: true } })
  })

  test('merges into an existing config.json, preserving other keys', async () => {
    await mkdir(join(root, '.netlify/v1'), { recursive: true })
    await writeFile(
      configPath(),
      JSON.stringify({ redirects: [{ from: '/a', to: '/b' }], build: { command: 'npm run build' } }),
    )

    await build({
      root,
      logLevel: 'silent',
      plugins: [createSpaConfigPlugin()],
    })

    expect(await readConfig()).toEqual({
      redirects: [{ from: '/a', to: '/b' }],
      build: { command: 'npm run build', spa: true },
    })
  })

  test('does not write config.json when appType is not spa', async () => {
    await build({
      root,
      logLevel: 'silent',
      appType: 'custom',
      plugins: [createSpaConfigPlugin()],
    })

    await expect(readConfig()).rejects.toThrow()
  })
})
