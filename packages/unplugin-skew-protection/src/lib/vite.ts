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
    // Anchors the attribute name, supports both quote styles via the backreference, and matches
    // tag/attribute names case-insensitively.
    return tag.replace(
      new RegExp(`(?<![\\w-])${attribute}\\s*=\\s*(["'])([^"']*)\\1`, 'i'),
      (match, quote: string, url: string) => {
        if (!matchesAnyPattern(url, regexps)) {
          return match
        }

        return `${attribute}=${quote}${appendQueryParam(url, resolved.paramName, resolved.token)}${quote}`
      },
    )
  }

  return html
    .replace(/<script\b[^>]*>/gi, (tag) => decorateTag(tag, 'src'))
    .replace(/<link\b[^>]*>/gi, (tag) => decorateTag(tag, 'href'))
}
