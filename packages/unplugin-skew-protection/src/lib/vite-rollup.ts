import type { Plugin as RollupPlugin } from 'rollup'
import type { Plugin as VitePlugin } from 'vite'

import { appendQueryParam, compilePatterns, matchesAnyPattern } from './patterns.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

interface DynamicImportWrapper {
  left: string
  right: string
}

/**
 * Rollup/Vite dynamic `import()` calls always resolve to a JS chunk, but the final
 * chunk filename isn't known yet when `renderDynamicImport` runs, so there's nothing
 * meaningful to test patterns against per-call. Instead, gate on whether the configured
 * patterns match JS assets at all.
 *
 * Returns a plain function rather than a `Partial<RollupPlugin>`/`Partial<VitePlugin>` so
 * `createRollupHooks` and `createViteHooks` can each type-check it against their own
 * package's `Plugin` type independently — Vite 8+ defines its `Plugin` type against
 * Rolldown rather than re-exporting Rollup's, so the two are no longer interchangeable.
 */
function createRenderDynamicImport(resolved: ResolvedSkewProtectionOptions): (() => DynamicImportWrapper) | undefined {
  const regexps = compilePatterns(resolved.patterns)

  if (!matchesAnyPattern('__netlify_probe__.js', regexps)) {
    return undefined
  }

  const suffix = `?${resolved.paramName}=${encodeURIComponent(resolved.token)}`

  return () => ({
    left: 'import(',
    right: ` + ${JSON.stringify(suffix)})`,
  })
}

export function createRollupHooks(resolved: ResolvedSkewProtectionOptions): Partial<RollupPlugin> {
  const renderDynamicImport = createRenderDynamicImport(resolved)
  return renderDynamicImport ? { renderDynamicImport } : {}
}

export function createViteHooks(resolved: ResolvedSkewProtectionOptions): Partial<VitePlugin> {
  const regexps = compilePatterns(resolved.patterns)
  const renderDynamicImport = createRenderDynamicImport(resolved)

  return {
    apply: 'build',
    ...(renderDynamicImport ? { renderDynamicImport } : {}),
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
    .replace(/<script\b[^>]*>/g, (tag) => decorateTag(tag, 'src'))
    .replace(/<link\b[^>]*>/g, (tag) => decorateTag(tag, 'href'))
}
