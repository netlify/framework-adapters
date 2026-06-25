import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'

import webpack from 'webpack'
import type { Compilation, Compiler } from 'webpack'

import { SkewProtectionRuntimeModule } from './lib/runtime-module.js'

const { RuntimeGlobals } = webpack
// Resolve a `require` for the optional html-webpack-plugin peer that works in
// both the CJS and ESM build outputs: `import.meta.url` is undefined in the CJS
// bundle, while `__filename` is undefined in the ESM bundle.
const requirePeer = createRequire(typeof __filename === 'string' ? __filename : import.meta.url)

const PLUGIN = 'NetlifySkewProtectionPlugin'

// Frameworks API location for the skew protection manifest, relative to the
// build base directory. This is a stable, documented public contract
// (https://docs.netlify.com/build/frameworks/frameworks-api/), and matches the
// `FRAMEWORKS_API_SKEW_PROTECTION_PATH` constant in `@netlify/build`. That
// constant is internal to the build orchestrator and not importable, so we
// mirror the literal here rather than guess at it.
const MANIFEST_PATH = ['.netlify', 'v1', 'skew-protection.json']

export interface SkewProtectionPluginOptions {
  /**
   * The deploy-pinning token to bake into asset URLs. Defaults to the
   * `NETLIFY_SKEW_PROTECTION_TOKEN` environment variable that Netlify's build
   * system injects on real deploys. When absent or `"0"` (local / CLI /
   * unprovisioned builds) the plugin is a complete no-op.
   */
  token?: string
  /**
   * Name of the query parameter that carries the token. MUST match the
   * `sources` entry written to `.netlify/v1/skew-protection.json`.
   * Default: `"nfdpl"`.
   */
  paramName?: string
  /**
   * PCRE patterns, matched by the Netlify edge against the request *path*, for
   * which skew protection should apply. Default scopes to JS/CSS assets so that
   * only subresource requests get pinned (never navigations or API/XHR calls).
   */
  patterns?: string[]
  /**
   * Directory Netlify treats as the build base (where `.netlify/v1/` is
   * scanned). The manifest is written to
   * `<baseDir>/.netlify/v1/skew-protection.json`. Defaults to `process.cwd()`,
   * which during a Netlify build is the base directory the platform resolves
   * `.netlify/v1` against. Override it only if your build command runs from a
   * different directory than the configured base.
   */
  baseDir?: string
}

/**
 * Webpack plugin that pins a build's asset requests to its Netlify deploy,
 * enabling Netlify Skew Protection for any webpack SPA. It does three things:
 *
 *   1. Appends `?<paramName>=<token>` to dynamically-loaded chunk URLs
 *      (wrapping `__webpack_require__.u` / the CSS equivalent at runtime).
 *   2. Appends the same query to entry/initial `<script>`/`<link>` tags emitted
 *      by html-webpack-plugin.
 *   3. Emits `.netlify/v1/skew-protection.json` declaring the query source and
 *      the asset path patterns, so the Netlify edge knows to reroute on it.
 */
export class NetlifySkewProtectionPlugin {
  private readonly token: string | undefined
  private readonly paramName: string
  private readonly patterns: string[]
  private readonly baseDir: string | undefined

  constructor(options: SkewProtectionPluginOptions = {}) {
    this.token = options.token ?? process.env.NETLIFY_SKEW_PROTECTION_TOKEN
    this.paramName = options.paramName ?? 'nfdpl'
    this.patterns = options.patterns ?? ['.*\\.(js|css)$']
    this.baseDir = options.baseDir
  }

  apply(compiler: Compiler): void {
    const logger = compiler.getInfrastructureLogger(PLUGIN)

    // No token → not a real Netlify deploy build. Stay completely inert so local
    // and CLI builds are unaffected.
    if (!this.token || this.token === '0') {
      logger.log('NETLIFY_SKEW_PROTECTION_TOKEN not present; skew protection disabled for this build.')
      return
    }

    const query = `${this.paramName}=${encodeURIComponent(this.token)}`

    // (1) + (2): bake the query onto chunk URLs and entry/initial tags.
    compiler.hooks.thisCompilation.tap(PLUGIN, (compilation) => {
      this.wrapChunkUrls(compilation, query)
      this.decorateHtmlTags(compilation, query)
    })

    // (3): emit the Frameworks API manifest once assets are written. This is
    // required for the feature to work: without it the edge has no reason to
    // reroute on the query param we stamp onto asset URLs.
    // Default to `process.cwd()`, which during a Netlify build is the base
    // directory the platform resolves `.netlify/v1` against. We deliberately do
    // not use `compiler.options.context`: webpack's context is often a
    // subdirectory (e.g. `<root>/src`), which would put the manifest somewhere
    // the platform never scans.
    const baseDir = this.baseDir ?? process.cwd()
    compiler.hooks.afterEmit.tapPromise(PLUGIN, async () => {
      const root = isAbsolute(baseDir) ? baseDir : join(process.cwd(), baseDir)
      const file = join(root, ...MANIFEST_PATH)
      const manifest = {
        patterns: this.patterns,
        sources: [{ type: 'query', name: this.paramName }],
      }
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`)
      logger.log(`Wrote ${file}`)
    })
  }

  /**
   * Wrap the runtime chunk-URL functions so on-demand chunks carry the query.
   * Initial chunks are loaded via HTML tags (handled separately) and never go
   * through these functions, so there's no double-append.
   */
  private wrapChunkUrls(compilation: Compilation, query: string): void {
    const globals = [
      RuntimeGlobals.getChunkScriptFilename, // __webpack_require__.u (JS)
      RuntimeGlobals.getChunkCssFilename, // mini-css-extract chunk filename (CSS)
    ]
    // Attach our wrapper for each chunk that actually requires a chunk-URL
    // function. `runtimeRequirementInTree.for(global)` fires while that specific
    // requirement is being resolved. This is how webpack core attaches its own
    // runtime modules (e.g. the publicPath module). Hooking
    // `additionalTreeRuntimeRequirements` instead is too early: the chunk-URL
    // requirement isn't in the set yet.
    for (const global of globals) {
      compilation.hooks.runtimeRequirementInTree.for(global).tap(PLUGIN, (chunk) => {
        compilation.addRuntimeModule(chunk, new SkewProtectionRuntimeModule(global, query))
      })
    }
  }

  /**
   * Append the query to entry/initial `<script src>` and stylesheet `<link href>`
   * tags. html-webpack-plugin is an optional peer; if it isn't installed we skip
   * this step silently (chunk URLs are still pinned via the runtime wrapper).
   */
  private decorateHtmlTags(compilation: Compilation, query: string): void {
    let HtmlWebpackPlugin: { getHooks?: (c: Compilation) => HtmlHooks | undefined }
    try {
      // Resolved from the consumer's dependency tree.
      HtmlWebpackPlugin = requirePeer('html-webpack-plugin') as {
        getHooks?: (c: Compilation) => HtmlHooks | undefined
      }
    } catch {
      return
    }

    const hooks = HtmlWebpackPlugin.getHooks?.(compilation)
    if (!hooks?.alterAssetTagGroups) return

    hooks.alterAssetTagGroups.tap(PLUGIN, (data) => {
      for (const tag of [...(data.headTags ?? []), ...(data.bodyTags ?? [])]) {
        appendQueryToTag(tag, query)
      }
      return data
    })
  }
}

interface HtmlTag {
  tagName?: string
  attributes?: Record<string, string | boolean | undefined>
}

interface AssetTagGroups {
  headTags?: HtmlTag[]
  bodyTags?: HtmlTag[]
}

interface HtmlHooks {
  alterAssetTagGroups?: {
    tap(name: string, fn: (data: AssetTagGroups) => AssetTagGroups): void
  }
}

function appendQueryToTag(tag: HtmlTag, query: string): void {
  const attrs = tag.attributes
  if (!attrs) return

  let key: 'src' | 'href' | undefined
  if (tag.tagName === 'script' && typeof attrs.src === 'string') {
    key = 'src'
  } else if (
    tag.tagName === 'link' &&
    typeof attrs.href === 'string' &&
    /\bstylesheet\b/.test(String(attrs.rel ?? ''))
  ) {
    key = 'href'
  }
  if (!key) return

  const url = String(attrs[key])
  // Leave absolute/CDN and data URLs alone; only pin same-origin assets.
  if (/^(?:https?:)?\/\//.test(url) || url.startsWith('data:')) return

  attrs[key] = url + (url.includes('?') ? '&' : '?') + query
}

export default NetlifySkewProtectionPlugin
