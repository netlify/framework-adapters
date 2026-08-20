import { cwd, env } from 'node:process'

import { compilePatterns } from './patterns.js'

export const DEFAULT_PARAM_NAME = 'nfdpl'
export const DEFAULT_PATTERNS = ['.*\\.(js|mjs|cjs)$', '.*\\.css$']

export interface ResolvedSkewProtectionOptions {
  /**
   * The directory the `.netlify/v1/` folder is written into.
   *
   * @default process.cwd()
   */
  baseDir: string

  /**
   * The name of the query parameter appended to matching asset URLs to pin them to
   * this deploy. Written into `.netlify/v1/skew-protection.json` as a `query` source.
   *
   * @default 'nfdpl'
   */
  paramName: string

  /**
   * Regular expression patterns (as strings) matching the URL paths that should
   * receive the skew protection query parameter. Written verbatim into
   * `.netlify/v1/skew-protection.json`.
   *
   * @default ['.*\\.(js|mjs|cjs)$', '.*\\.css$']
   */
  patterns: string[]

  /**
   * The skew protection token that identifies the current deploy. Netlify sets this
   * automatically during production builds.
   *
   * The plugin is a no-op when no token is available, or when it is set to `"0"`.
   *
   * @default process.env.NETLIFY_SKEW_PROTECTION_TOKEN
   */
  token: string
}

/**
 * User-facing options; every field is optional and falls back to the default
 * documented on {@link ResolvedSkewProtectionOptions}.
 */
export type SkewProtectionOptions = Partial<ResolvedSkewProtectionOptions>

/**
 * Resolves user options, returning `null` when the plugin should be a no-op
 * (no token available, or explicitly disabled with token `"0"`).
 */
export function resolveOptions(options: SkewProtectionOptions = {}): ResolvedSkewProtectionOptions | null {
  const token = options.token ?? env.NETLIFY_SKEW_PROTECTION_TOKEN

  if (!token || token === '0') {
    return null
  }

  const patterns = options.patterns ?? DEFAULT_PATTERNS
  compilePatterns(patterns)

  return {
    baseDir: options.baseDir ?? cwd(),
    paramName: options.paramName ?? DEFAULT_PARAM_NAME,
    patterns,
    token,
  }
}
