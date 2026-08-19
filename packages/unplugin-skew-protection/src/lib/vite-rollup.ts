import MagicString from 'magic-string'
import type { Plugin as VitePlugin } from 'vite'

import { appendQueryParam, compilePatterns, matchesAnyPattern } from './patterns.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

const DYNAMIC_IMPORT_RE = /import\((["'`])([^"'`]+)\1\)/g

interface NormalizedSourceMap {
  version: number
  file?: string
  sources: string[]
  sourcesContent?: string[]
  names: string[]
  mappings: string
}

type RenderChunkResult = { code: string; map: NormalizedSourceMap } | null
type RenderChunkHook = (code: string) => RenderChunkResult

/**
 * Stamps dynamic `import()` call sites in already-rendered chunk code.
 *
 * Uses `renderChunk` rather than `renderDynamicImport` because Rolldown — the bundler
 * Vite 8+ runs on — never invokes `renderDynamicImport` (confirmed by calling Rolldown
 * directly), while `renderChunk` is a universal hook supported by Rollup, Rolldown, and
 * every bundler built on either. Using it everywhere means one mechanism instead of two.
 *
 * By the time `renderChunk` runs, the target's real (hashed) specifier is already in the
 * code, so — unlike the old `renderDynamicImport`-based approach — each match can be
 * tested against `patterns` individually instead of gating the whole hook on/off with a
 * synthetic probe string.
 *
 * Returns a plain function rather than a `Partial<RollupPlugin>`/`Partial<VitePlugin>`/
 * `Partial<RolldownPlugin>` so `createRollupHooks` and `createViteHooks` can each
 * type-check it against their own package's `Plugin` type independently — Vite 8+ and
 * Rolldown define their own `Plugin` type rather than re-exporting Rollup's, so the
 * three aren't interchangeable at the type level (even though they're runtime-compatible).
 */
function createRenderChunk(resolved: ResolvedSkewProtectionOptions): RenderChunkHook {
  const regexps = compilePatterns(resolved.patterns)
  const suffix = `?${resolved.paramName}=${encodeURIComponent(resolved.token)}`

  return (code) => {
    if (!code.includes('import(')) {
      return null
    }

    let magicString: MagicString | undefined

    for (const match of code.matchAll(DYNAMIC_IMPORT_RE)) {
      const [, quote, specifier] = match
      if (specifier.includes(suffix) || !matchesAnyPattern(specifier, regexps)) {
        continue
      }

      magicString ??= new MagicString(code)
      const specifierEnd = match.index + 'import('.length + quote.length + specifier.length
      magicString.appendLeft(specifierEnd, suffix)
    }

    if (!magicString) {
      return null
    }

    // See https://rolldown.rs/apis/plugin-api/transformations#transforming-a-chunk
    const map = magicString.generateMap({ hires: 'boundary' })
    return {
      code: magicString.toString(),
      map: {
        version: map.version,
        file: map.file,
        sources: map.sources,
        // magic-string types this as `(string | null)[]`; Rollup/Rolldown expect `string[]`.
        sourcesContent: map.sourcesContent?.map((content) => content ?? ''),
        names: map.names,
        mappings: map.mappings,
      },
    }
  }
}

/**
 * Shared by the `rollup` and `rolldown` unplugin targets. Typed as a minimal,
 * package-agnostic shape — not `Partial<RollupPlugin>` — because unplugin only merges
 * each target's own same-named field (e.g. `rolldown` only reads `UnpluginOptions.rolldown`),
 * so this same value gets assigned to both `Partial<RollupPlugin>` and `Partial<RolldownPlugin>`
 * at the call site; typing it against either package specifically would reintroduce the
 * cross-package coupling `createRenderChunk` above already avoids.
 */
export function createRollupHooks(resolved: ResolvedSkewProtectionOptions): { renderChunk: RenderChunkHook } {
  return { renderChunk: createRenderChunk(resolved) }
}

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
    .replace(/<script\b[^>]*>/g, (tag) => decorateTag(tag, 'src'))
    .replace(/<link\b[^>]*>/g, (tag) => decorateTag(tag, 'href'))
}
