import { compilePatterns } from './patterns.js'
import { decorateHtml } from './html.js'
import { createRenderChunk, type RenderChunkHook } from './render-chunk.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

// Minimal, hand-rolled shapes (rather than importing Rollup's or Rolldown's actual types) since
// the object returned by `createRolldownRollupHooks` is assigned to both the `rollup` and
// `rolldown` fields of the same `UnpluginOptions` value, and only needs to satisfy each bundler's
// hook signature structurally, not nominally.
interface OutputAsset {
  fileName: string
  source: string | Uint8Array
  type: string
}

type OutputBundle = Record<string, OutputAsset | { type: string }>

type GenerateBundleHook = {
  handler: (outputOptions: unknown, bundle: OutputBundle) => void
  order: 'post'
}

// Decorates HTML emitted by other plugins with matching <script src>/<link href> tags,
// like Vite's transformIndexHtml. order: 'post' ensures this runs after the plugin emits the HTML,
// regardless of registration order.
function createGenerateBundleHook(resolved: ResolvedSkewProtectionOptions): GenerateBundleHook {
  const regexps = compilePatterns(resolved.patterns)

  return {
    handler(_outputOptions, bundle) {
      for (const entry of Object.values(bundle)) {
        if (!isHtmlAsset(entry)) {
          continue
        }

        entry.source = decorateHtml(entry.source, resolved, regexps)
      }
    },
    order: 'post',
  }
}

// Shared by Rollup and Rolldown targets, kept package-agnostic
// to avoid coupling the shared value to either plugin type.
export function createRolldownRollupHooks(resolved: ResolvedSkewProtectionOptions): {
  generateBundle: GenerateBundleHook
  renderChunk: RenderChunkHook
} {
  return {
    generateBundle: createGenerateBundleHook(resolved),
    renderChunk: createRenderChunk(resolved),
  }
}

function isHtmlAsset(entry: OutputAsset | { type: string }): entry is OutputAsset & { source: string } {
  return (
    entry.type === 'asset' &&
    'fileName' in entry &&
    typeof entry.source === 'string' &&
    entry.fileName.toLowerCase().endsWith('.html')
  )
}
