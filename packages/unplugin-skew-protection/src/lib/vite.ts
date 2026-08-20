import type { Plugin as VitePlugin } from 'vite'

import { appendQueryParam, compilePatterns, matchesAnyPattern } from './patterns.js'
import { createRenderChunk } from './render-chunk.js'
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

function decorateHtml(html: string, resolved: ResolvedSkewProtectionOptions, regexps: RegExp[]): string {
  function decorateTag(tag: string, attribute: 'href' | 'src') {
    return tag.replace(new RegExp(`${attribute}="([^"]+)"`), (match, url: string) => {
      if (!matchesAnyPattern(url, regexps)) {
        return match
      }

      return `${attribute}="${appendQueryParam(url, resolved.paramName, resolved.token)}"`
    })
  }

  return html
    .replace(/<script\b[^>]*>/gi, (tag) => decorateTag(tag, 'src'))
    .replace(/<link\b[^>]*>/gi, (tag) => decorateTag(tag, 'href'))
}
