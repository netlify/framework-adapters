import type { Plugin as VitePlugin, ResolvedConfig } from 'vite'

import { compilePatterns } from './patterns.js'
import { createRenderChunk } from './render-chunk.js'
import { decorateHtml } from './html.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

export function createViteHooks(resolved: ResolvedSkewProtectionOptions): Partial<VitePlugin> {
  const regexps = compilePatterns(resolved.patterns)
  const stampChunk = createRenderChunk(resolved)

  let isClassicSsrBuild = false

  return {
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      isClassicSsrBuild = Boolean(config.build.ssr)
    },
    renderChunk(code) {
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
