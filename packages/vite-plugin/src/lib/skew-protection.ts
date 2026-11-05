import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'

import type { DeploymentParticipant, RequestMetadataCarrier } from '@vitejs/deployment-metadata-types'
import type { Plugin, ResolvedConfig } from 'vite'

import { createLoggerFromViteLogger } from './logger.js'

// https://github.com/vitejs/deployment-metadata
export const DEPLOYMENT_METADATA_API = 'vite/deploymentMetadata'

const SKEW_PROTECTION_CONFIG_PATH = '.netlify/v1/skew-protection.json'

const CARRIERS: readonly RequestMetadataCarrier[] = [
  { type: 'header', name: 'X-Netlify-Deploy-ID' },
  { type: 'query', name: 'dpl' },
]

/* @see {link https://docs.netlify.com/build/frameworks/frameworks-api/#netlifyv1skew-protectionjson} */
const getSkewProtectionToken = (): string | undefined => process.env.NETLIFY_SKEW_PROTECTION_TOKEN

export const createSkewProtection = () => {
  let enabledTypes: ReadonlySet<RequestMetadataCarrier['type']> | undefined

  const participant: DeploymentParticipant = {
    id: '@netlify/vite-plugin',
    name: 'Netlify',
    getMetadata() {
      const token = getSkewProtectionToken()
      return token
        ? [
            {
              id: 'VDM0001',
              version: 1,
              value: token,
              carriers: CARRIERS,
              enable({ carriers }) {
                // The spec lets producers ignore calls after the first
                enabledTypes ??= new Set(carriers)
              },
            },
          ]
        : []
    },
  }

  /**
   * Opt this deploy into Netlify's skew protection routing for the carriers the framework enabled.
   * @see {link https://docs.netlify.com/build/frameworks/frameworks-api/#netlifyv1skew-protectionjson}
   * @return whether the config was written.
   */
  const writeConfig = async (root: string): Promise<boolean> => {
    const sources = CARRIERS.filter((carrier) => enabledTypes?.has(carrier.type))
    if (sources.length === 0) {
      return false
    }
    const configPath = join(root, SKEW_PROTECTION_CONFIG_PATH)
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify({
        // Frameworks only attach carriers to their own same-origin requests, so any path may be pinned
        patterns: ['.*'],
        sources,
      }),
    )
    return true
  }

  return { participant, writeConfig }
}

// Not tied to `build.enabled`: any framework supporting VDM0001 can enable it, and it's a no-op otherwise
export function createSkewProtectionPlugin(): Plugin {
  const skewProtection = createSkewProtection()
  let resolvedConfig: ResolvedConfig
  let written = false

  return {
    name: 'vite-plugin-netlify:skew-protection',
    apply: 'build',
    api: {
      [DEPLOYMENT_METADATA_API]: skewProtection.participant,
    },
    configResolved(config) {
      resolvedConfig = config
    },
    async writeBundle() {
      // TODO(serhalp): Before Vite 7, there was no hook that runs once after *all* envs are. Switch to `buildApp` and
      // remove this tracking once we've dropped support for Vite 5-6.
      if (written) {
        return
      }
      written = await skewProtection.writeConfig(resolvedConfig.root)
      if (written) {
        createLoggerFromViteLogger(resolvedConfig.logger).log('✓ Enabled skew protection\n')
      }
    },
  }
}
