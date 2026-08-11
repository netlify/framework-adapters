import { createUnplugin, type UnpluginOptions } from 'unplugin'

import { applySkewProtectionWebpackPlugin } from './lib/webpack.js'
import { createRollupHooks, createViteHooks } from './lib/vite-rollup.js'
import { resolveOptions, type SkewProtectionOptions } from './lib/options.js'
import { writeManifest } from './lib/manifest.js'

export type { ResolvedSkewProtectionOptions, SkewProtectionOptions } from './lib/options.js'

export type { SkewProtectionManifest } from './lib/manifest.js'

export function unpluginFactory(userOptions: SkewProtectionOptions | undefined = {}): UnpluginOptions {
  const resolved = resolveOptions(userOptions)

  if (!resolved) {
    return {
      name: 'netlify:skew-protection',
    }
  }

  return {
    name: 'netlify:skew-protection',
    rollup: createRollupHooks(resolved),
    webpack(compiler) {
      applySkewProtectionWebpackPlugin(compiler, resolved)
    },
    vite: createViteHooks(resolved),
    writeBundle() {
      return writeManifest(resolved)
    },
  }
}

const skewProtection = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default skewProtection

export { skewProtection }
