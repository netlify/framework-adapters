import { createRequire } from 'node:module'

import type { Chunk, Compiler } from 'webpack'

import { appendQueryParam, compilePatterns, matchesAnyPattern } from './patterns.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

const PLUGIN_NAME = 'netlify-skew-protection'

/**
 * Applies skew protection to a webpack compiler:
 * - wraps the chunk-loading filename functions (`__webpack_require__.u`/`.k`) so lazily
 *   loaded JS/CSS chunks are requested with the deploy-pinning query parameter
 * - decorates the initial `<script>`/`<link>` tags emitted by html-webpack-plugin, if present
 */

export function applySkewProtectionWebpackPlugin(compiler: Compiler, resolved: ResolvedSkewProtectionOptions) {
  const regexps = compilePatterns(resolved.patterns)
  const suffix = `?${resolved.paramName}=${encodeURIComponent(resolved.token)}`

  const stampJs = matchesAnyPattern('__netlify_probe__.js', regexps)
  const stampCss = matchesAnyPattern('__netlify_probe__.css', regexps)

  if (stampJs || stampCss) {
    wrapChunkFilenameFunctions(compiler, suffix, { stampCss, stampJs })
  }

  decorateHtmlWebpackPluginTags(compiler, resolved, regexps)
}

function decorateHtmlWebpackPluginTags(compiler: Compiler, resolved: ResolvedSkewProtectionOptions, regexps: RegExp[]) {
  let HtmlWebpackPlugin: typeof import('html-webpack-plugin')

  try {
    const require = createRequire(import.meta.url)
    HtmlWebpackPlugin = require('html-webpack-plugin') as typeof import('html-webpack-plugin')
  } catch {
    return
  }

  compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
    HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tapPromise(PLUGIN_NAME, (data) => {
      for (const tag of data.assetTags.scripts) {
        stampAttribute(tag, 'src', resolved, regexps)
      }

      for (const tag of data.assetTags.styles) {
        stampAttribute(tag, 'href', resolved, regexps)
      }

      return Promise.resolve(data)
    })
  })
}

function stampAttribute(
  tag: {
    attributes: Record<string, string | boolean | null | undefined>
  },
  attributeName: 'href' | 'src',
  resolved: ResolvedSkewProtectionOptions,
  regexps: RegExp[],
) {
  const url = tag.attributes[attributeName]

  if (typeof url !== 'string' || !matchesAnyPattern(url, regexps)) {
    return
  }

  tag.attributes[attributeName] = appendQueryParam(url, resolved.paramName, resolved.token)
}

function wrapChunkFilenameFunctions(
  compiler: Compiler,
  suffix: string,
  { stampCss, stampJs }: { stampCss: boolean; stampJs: boolean },
) {
  class SkewProtectionRuntimeModule extends compiler.webpack.RuntimeModule {
    constructor() {
      super('netlify skew protection', compiler.webpack.RuntimeModule.STAGE_ATTACH)
    }

    override generate(): string {
      const lines = [`var __netlifySkewSuffix__ = ${JSON.stringify(suffix)};`]

      if (stampJs) {
        lines.push(
          `if (typeof ${compiler.webpack.RuntimeGlobals.getChunkScriptFilename} === "function") {`,
          compiler.webpack.Template.indent([
            `var __netlifyOrigChunkScriptFilename__ = ${compiler.webpack.RuntimeGlobals.getChunkScriptFilename};`,
            `${compiler.webpack.RuntimeGlobals.getChunkScriptFilename} = function (chunkId) { return __netlifyOrigChunkScriptFilename__(chunkId) + __netlifySkewSuffix__; };`,
          ]),
          '}',
        )
      }

      if (stampCss) {
        lines.push(
          `if (typeof ${compiler.webpack.RuntimeGlobals.getChunkCssFilename} === "function") {`,
          compiler.webpack.Template.indent([
            `var __netlifyOrigChunkCssFilename__ = ${compiler.webpack.RuntimeGlobals.getChunkCssFilename};`,
            `${compiler.webpack.RuntimeGlobals.getChunkCssFilename} = function (chunkId) { return __netlifyOrigChunkCssFilename__(chunkId) + __netlifySkewSuffix__; };`,
          ]),
          '}',
        )
      }

      return compiler.webpack.Template.asString(lines)
    }
  }

  compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
    const patchedChunks = new WeakSet<Chunk>()

    function patchChunk(chunk: Chunk) {
      if (patchedChunks.has(chunk)) {
        return
      }

      patchedChunks.add(chunk)
      compilation.addRuntimeModule(chunk, new SkewProtectionRuntimeModule())
    }

    if (stampJs) {
      compilation.hooks.runtimeRequirementInTree
        .for(compiler.webpack.RuntimeGlobals.getChunkScriptFilename)
        .tap(PLUGIN_NAME, patchChunk)
    }

    if (stampCss) {
      compilation.hooks.runtimeRequirementInTree
        .for(compiler.webpack.RuntimeGlobals.getChunkCssFilename)
        .tap(PLUGIN_NAME, patchChunk)
    }
  })
}
