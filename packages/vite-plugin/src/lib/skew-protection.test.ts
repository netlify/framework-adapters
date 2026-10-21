import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { DeploymentParticipant, RequestMetadata } from '@vitejs/deployment-metadata-types'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Plugin } from 'vite'

import netlify from '../main.js'
import { DEPLOYMENT_METADATA_API, createSkewProtection } from './skew-protection.js'

const HEADER = { type: 'header', name: 'X-Netlify-Deploy-ID' }
const QUERY = { type: 'query', name: 'dpl' }

const getRequestMetadata = async (participant: DeploymentParticipant): Promise<RequestMetadata> => {
  const [metadata] = await participant.getMetadata()
  return metadata
}

beforeEach(() => {
  vi.stubEnv('NETLIFY_SKEW_PROTECTION_TOKEN', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('participant', () => {
  test('is advertised without `build.enabled`', () => {
    const plugins = netlify() as Plugin[]
    const participants = plugins.map(
      (plugin) => (plugin.api as Record<string, unknown> | undefined)?.[DEPLOYMENT_METADATA_API],
    )

    expect(participants).toContainEqual(expect.objectContaining({ id: '@netlify/vite-plugin' }))
  })

  test('returns request metadata with the skew protection token', async () => {
    vi.stubEnv('NETLIFY_SKEW_PROTECTION_TOKEN', 'token-123')

    expect(await createSkewProtection().participant.getMetadata()).toEqual([
      { id: 'VDM0001', version: 1, value: 'token-123', carriers: [HEADER, QUERY], enable: expect.any(Function) },
    ])
  })

  test('returns no metadata without a skew protection token', async () => {
    vi.stubEnv('DEPLOY_ID', 'deploy-456')

    expect(await createSkewProtection().participant.getMetadata()).toEqual([])
  })
})

describe('writeConfig', () => {
  let root: string
  const readConfig = async () =>
    JSON.parse(await readFile(join(root, '.netlify/v1/skew-protection.json'), 'utf8')) as unknown

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'netlify-vite-plugin-'))
    vi.stubEnv('NETLIFY_SKEW_PROTECTION_TOKEN', 'token-123')
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('writes the config for the enabled carriers', async () => {
    const skewProtection = createSkewProtection()
    ;(await getRequestMetadata(skewProtection.participant)).enable({ carriers: ['header'] })

    expect(await skewProtection.writeConfig(root)).toBe(true)
    expect(await readConfig()).toEqual({ patterns: ['.*'], sources: [HEADER] })
  })

  test('ignores calls after the first', async () => {
    const skewProtection = createSkewProtection()
    const metadata = await getRequestMetadata(skewProtection.participant)
    metadata.enable({ carriers: ['query'] })
    metadata.enable({ carriers: ['header', 'query'] })

    await skewProtection.writeConfig(root)
    expect(await readConfig()).toEqual({ patterns: ['.*'], sources: [QUERY] })
  })

  test('does nothing when the framework never enables it', async () => {
    const skewProtection = createSkewProtection()
    await skewProtection.participant.getMetadata()

    expect(await skewProtection.writeConfig(root)).toBe(false)
    await expect(readConfig()).rejects.toThrow()
  })
})
