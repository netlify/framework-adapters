import MagicString from 'magic-string'
import { parse, type DefaultTreeAdapterMap } from 'parse5'

import { appendQueryParam, matchesAnyPattern } from './patterns.js'
import type { ResolvedSkewProtectionOptions } from './options.js'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

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

  // parse5 decodes HTML entities in `attr.value` (e.g. `&quot;` -> `"`), so a matching URL that
  // contains an encoded quote/ampersand would otherwise be written back as literal markup — closing
  // the attribute early and injecting whatever follows as a new attribute.
  const escapedUrl = escapeAttributeValue(stampedUrl, quote)
  magicString.overwrite(location.startOffset, location.endOffset, `${attributeName}=${quote}${escapedUrl}${quote}`)
}

export function decorateHtml(html: string, resolved: ResolvedSkewProtectionOptions, regexps: RegExp[]): string {
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

function escapeAttributeValue(value: string, quote: string): string {
  const quoteEntity = quote === "'" ? '&#39;' : '&quot;'
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(new RegExp(quote, 'g'), quoteEntity)
}
