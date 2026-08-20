import type { Plugin as VitePlugin } from 'vite'

import { compilePatterns } from './patterns.js'
import { createRenderChunk } from './render-chunk.js'
import { decorateHtml } from './html.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

export function createViteHooks(resolved: ResolvedSkewProtectionOptions): Partial<VitePlugin> {
  const regexps = compilePatterns(resolved.patterns)

  return {
    apply: 'build',
    renderChunk: createRenderChunk(resolved),
    transformIndexHtml(html) {
      return decorateHtml(html, resolved, regexps)
    },
  }
}
