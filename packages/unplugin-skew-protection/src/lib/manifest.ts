import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

import type { ResolvedSkewProtectionOptions } from './options.js'

export interface SkewProtectionManifest {
  patterns: string[]
  sources: {
    name: string
    type: 'query'
  }[]
}

export function buildManifest(resolved: ResolvedSkewProtectionOptions): SkewProtectionManifest {
  return {
    patterns: resolved.patterns,
    sources: [
      {
        name: resolved.paramName,
        type: 'query',
      },
    ],
  }
}

export async function writeManifest(resolved: ResolvedSkewProtectionOptions): Promise<void> {
  const manifestDir = join(resolved.baseDir, '.netlify', 'v1')

  await mkdir(manifestDir, {
    recursive: true,
  })

  await writeFile(join(manifestDir, 'skew-protection.json'), `${JSON.stringify(buildManifest(resolved), null, 2)}\n`)
}
