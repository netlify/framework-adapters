import type { Plugin as VitePlugin, ResolvedConfig } from 'vite'

import { compilePatterns } from './patterns.js'
import { createRenderChunk } from './render-chunk.js'
import { decorateHtml } from './html.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

// Hand-rolled (rather than relying on the installed Vite version's own type) since this package's
// peerDependencies span back to Vite 4: `environment` is only ever present from Vite 6's Environment
// API onward — always, even for a "classic" single-environment project — so treating it as optional
// reflects the full supported range, not just whichever Vite version this package happens to be
// type-checked against.
interface RenderChunkThis {
  environment?: {
    config: {
      consumer: 'client' | 'server'
    }
  }
}

export function createViteHooks(resolved: ResolvedSkewProtectionOptions): Partial<VitePlugin> {
  const regexps = compilePatterns(resolved.patterns)
  const stampChunk = createRenderChunk(resolved)

  let isClassicSsrBuild = false

  return {
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      isClassicSsrBuild = Boolean(config.build.ssr)
    },
    renderChunk(this: RenderChunkThis, code) {
      const isServer = this.environment ? this.environment.config.consumer === 'server' : isClassicSsrBuild

      if (isServer) {
        return null
      }

      return stampChunk.call(this, code)
    },
    transformIndexHtml(html) {
      return decorateHtml(html, resolved, regexps)
    },
  }
}
