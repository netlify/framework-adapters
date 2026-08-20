import MagicString from 'magic-string'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import type { Plugin as VitePlugin } from 'vite'

import { appendQueryParam, compilePatterns, matchesAnyPattern } from './patterns.js'
import { createRenderChunk } from './render-chunk.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

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
  const document = parse(html, { sourceCodeLocationInfo: true })
  const magicString = new MagicString(html)

  function visit(node: Node) {
    if ('tagName' in node) {
      if (node.tagName === 'script') {
        decorateAttribute(html, node, 'src', resolved, regexps, magicString)
      } else if (node.tagName === 'link') {
        decorateAttribute(html, node, 'href', resolved, regexps, magicString)
      }
    }

    if ('childNodes' in node) {
      for (const child of node.childNodes) {
        visit(child)
      }
    }
  }

  visit(document)
  return magicString.toString()
}

function decorateAttribute(
  html: string,
  element: Element,
  attributeName: 'href' | 'src',
  resolved: ResolvedSkewProtectionOptions,
  regexps: RegExp[],
  magicString: MagicString,
): void {
  const attr = element.attrs.find((candidate) => candidate.name === attributeName)
  const location = element.sourceCodeLocation?.attrs?.[attributeName]

  if (!attr || !location || !matchesAnyPattern(attr.value, regexps)) {
    return
  }

  // Reuses whichever quote style the attribute already used, except when unquoted: the appended
  // `?param=token` suffix contains `=`, which HTML forbids in an unquoted attribute value.
  const raw = html.slice(location.startOffset, location.endOffset)
  const quote = /^[^=]+=(["'])/.exec(raw)?.[1] ?? '"'
  const stampedUrl = appendQueryParam(attr.value, resolved.paramName, resolved.token)

  magicString.overwrite(location.startOffset, location.endOffset, `${attributeName}=${quote}${stampedUrl}${quote}`)
}
