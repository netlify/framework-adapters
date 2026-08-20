import { init, parse } from 'es-module-lexer'
import MagicString from 'magic-string'

import { appendQueryParam, compilePatterns, hasQueryParam, matchesAnyPattern } from './patterns.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

interface NormalizedSourceMap {
  file?: string
  mappings: string
  names: string[]
  sources: string[]
  sourcesContent?: string[]
  version: number
}

type RenderChunkResult = { code: string; map: NormalizedSourceMap } | null
export type RenderChunkHook = (code: string) => Promise<RenderChunkResult>

// Stamps dynamic `import()` call sites in already-rendered chunk code
export function createRenderChunk(resolved: ResolvedSkewProtectionOptions): RenderChunkHook {
  const regexps = compilePatterns(resolved.patterns)

  return async (code) => {
    if (!code.includes('import(')) {
      return null
    }

    await init

    const [imports] = parse(code)
    let magicString: MagicString | undefined

    for (const imp of imports) {
      // `d > -1` marks a dynamic `import(...)` call site (as opposed to a static import or
      // `import.meta`); `n` is only populated when the specifier is a plain string literal, which
      // excludes comments, string/template literals elsewhere in the code, and non-literal
      // specifiers (e.g. `import(someVariable)`) that can't be matched against `patterns`.
      if (imp.d === -1 || imp.n === undefined) {
        continue
      }

      const specifier = imp.n

      // Detects an exact paramName=token query parameter to ensure idempotency
      // and avoid matching marker-shaped values embedded in other parameters.
      if (hasQueryParam(specifier, resolved.paramName, resolved.token) || !matchesAnyPattern(specifier, regexps)) {
        continue
      }

      const stamped = appendQueryParam(specifier, resolved.paramName, resolved.token)

      // For dynamic import(), s/e include the quotes, while imp.n is decoded.
      // Re-serialize it with JSON.stringify to safely handle escaped quotes and backslashes.
      magicString ??= new MagicString(code)
      magicString.overwrite(imp.s, imp.e, JSON.stringify(stamped))
    }

    if (!magicString) {
      return null
    }

    // See https://rolldown.rs/apis/plugin-api/transformations#transforming-a-chunk
    const map = magicString.generateMap({
      hires: 'boundary',
    })

    return {
      code: magicString.toString(),
      map: {
        file: map.file,
        mappings: map.mappings,
        names: map.names,
        sources: map.sources,
        // magic-string types this as `(string | null)[]`; Rollup/Rolldown expect `string[]`.
        sourcesContent: map.sourcesContent?.map((content) => content ?? ''),
        version: map.version,
      },
    }
  }
}

// Shared by Rollup and Rolldown targets, kept package-agnostic
// to avoid coupling the shared value to either plugin type.
export function createRollupHooks(resolved: ResolvedSkewProtectionOptions): { renderChunk: RenderChunkHook } {
  return {
    renderChunk: createRenderChunk(resolved),
  }
}
