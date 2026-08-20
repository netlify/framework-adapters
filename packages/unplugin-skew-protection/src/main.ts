import type { UnpluginOptions } from 'unplugin'

import { applySkewProtectionWebpackPlugin } from './lib/webpack.js'
import { createRollupHooks } from './lib/render-chunk.js'
import { createViteHooks } from './lib/vite.js'
import { resolveOptions, type SkewProtectionOptions } from './lib/options.js'
import { writeManifest } from './lib/manifest.js'

// Internal factory shared by each bundler-specific entry point (./rollup.js, ./rolldown.js,
// ./vite.js, ./webpack.js) — this module has no public entry of its own, so users can only reach
// a single-bundler plugin via one of those subpaths, not a combined multi-bundler object.
export function unpluginFactory(userOptions: SkewProtectionOptions | undefined = {}): UnpluginOptions {
  const resolved = resolveOptions(userOptions)

  if (!resolved) {
    return {
      name: 'netlify:skew-protection',
    }
  }

  return {
    name: 'netlify:skew-protection',
    // Rolldown and Rollup share the hooks this plugin uses, but each target only
    // merges its own field, so both must be set explicitly.
    rolldown: createRollupHooks(resolved),
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
