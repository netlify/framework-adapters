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

// Stamps dynamic `import()` call sites, and static cross-chunk `import ... from` specifiers, in
// already-rendered chunk code
export function createRenderChunk(resolved: ResolvedSkewProtectionOptions): RenderChunkHook {
  const regexps = compilePatterns(resolved.patterns)

  return async (code) => {
    if (!code.includes('import')) {
      return null
    }

    await init

    const [imports] = parse(code)
    let magicString: MagicString | undefined

    for (const imp of imports) {
      // At this stage, static imports only point to emitted chunks; source imports have already
      // been inlined. Those chunks may also have a modulepreload tag, so leaving these imports
      // unstamped would fetch them twice. Exclude `import.meta` (`d === -2`) and non-literal
      // specifiers, since only plain string literals can be matched against `patterns`.
      if (imp.d === -2 || imp.n === undefined) {
        continue
      }

      const specifier = imp.n

      // Detects an exact paramName=token query parameter to ensure idempotency
      // and avoid matching marker-shaped values embedded in other parameters.
      if (hasQueryParam(specifier, resolved.paramName, resolved.token) || !matchesAnyPattern(specifier, regexps)) {
        continue
      }

      const stamped = appendQueryParam(specifier, resolved.paramName, resolved.token)

      // Dynamic import() ranges include the quotes, but static import ranges only cover the
      // specifier. Expand the range to include the quotes so we replace the whole string instead
      // of nesting a new quoted string inside it.
      const isDynamic = imp.d > -1
      const start = isDynamic ? imp.s : imp.s - 1
      const end = isDynamic ? imp.e : imp.e + 1

      // Re-serialize with JSON.stringify to safely handle escaped quotes and backslashes.
      magicString ??= new MagicString(code)
      magicString.overwrite(start, end, JSON.stringify(stamped))
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
