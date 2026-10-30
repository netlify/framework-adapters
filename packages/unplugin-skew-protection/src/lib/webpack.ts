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

  wrapChunkFilenameFunctions(compiler, resolved, regexps)
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

// Chunk filenames are only known when webpack runs, so the configured patterns
// can't be checked at compile time. Instead, the compiled regexes are inlined
// into the runtime module and matched against each chunk's generated filename,
// ensuring patterns only stamp the chunks they actually match.

function wrapChunkFilenameFunctions(compiler: Compiler, resolved: ResolvedSkewProtectionOptions, regexps: RegExp[]) {
  const suffix = `?${resolved.paramName}=${encodeURIComponent(resolved.token)}`
  const patternsLiteral = `[${regexps.map(String).join(', ')}]`

  class SkewProtectionRuntimeModule extends compiler.webpack.RuntimeModule {
    constructor() {
      super('netlify skew protection', compiler.webpack.RuntimeModule.STAGE_ATTACH)
    }

    override generate(): string {
      return compiler.webpack.Template.asString([
        `var __netlifySkewPatterns__ = ${patternsLiteral};`,
        `var __netlifySkewSuffix__ = ${JSON.stringify(suffix)};`,
        'function __netlifySkewMatches__(filename) {',
        compiler.webpack.Template.indent([
          'for (var i = 0; i < __netlifySkewPatterns__.length; i++) {',
          compiler.webpack.Template.indent('if (__netlifySkewPatterns__[i].test(filename)) return true;'),
          '}',
          'return false;',
        ]),
        '}',
        `if (typeof ${compiler.webpack.RuntimeGlobals.getChunkScriptFilename} === "function") {`,
        compiler.webpack.Template.indent([
          `var __netlifyOrigChunkScriptFilename__ = ${compiler.webpack.RuntimeGlobals.getChunkScriptFilename};`,
          `${compiler.webpack.RuntimeGlobals.getChunkScriptFilename} = function (chunkId) {`,
          compiler.webpack.Template.indent([
            'var filename = __netlifyOrigChunkScriptFilename__(chunkId);',
            'return __netlifySkewMatches__(filename) ? filename + __netlifySkewSuffix__ : filename;',
          ]),
          '};',
        ]),
        '}',
        `if (typeof ${compiler.webpack.RuntimeGlobals.getChunkCssFilename} === "function") {`,
        compiler.webpack.Template.indent([
          `var __netlifyOrigChunkCssFilename__ = ${compiler.webpack.RuntimeGlobals.getChunkCssFilename};`,
          `${compiler.webpack.RuntimeGlobals.getChunkCssFilename} = function (chunkId) {`,
          compiler.webpack.Template.indent([
            'var filename = __netlifyOrigChunkCssFilename__(chunkId);',
            'return __netlifySkewMatches__(filename) ? filename + __netlifySkewSuffix__ : filename;',
          ]),
          '};',
        ]),
        '}',
      ])
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

    compilation.hooks.runtimeRequirementInTree
      .for(compiler.webpack.RuntimeGlobals.getChunkScriptFilename)
      .tap(PLUGIN_NAME, patchChunk)

    compilation.hooks.runtimeRequirementInTree
      .for(compiler.webpack.RuntimeGlobals.getChunkCssFilename)
      .tap(PLUGIN_NAME, patchChunk)
  })
}
