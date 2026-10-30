import { describe, expect, test } from 'vitest'

import { appendQueryParam, compilePatterns, hasQueryParam, matchesAnyPattern } from './patterns.js'

describe('compilePatterns', () => {
  test('throws a clear error for an invalid regular expression', () => {
    expect(() => compilePatterns(['.*\\.js$', '('])).toThrow('Invalid skew protection pattern "("')
  })
})

describe('matchesAnyPattern', () => {
  test('matches when at least one pattern matches', () => {
    const regexps = compilePatterns(['.*\\.js$', '.*\\.css$'])
    expect(matchesAnyPattern('/assets/app.js', regexps)).toBe(true)
    expect(matchesAnyPattern('/assets/app.css', regexps)).toBe(true)
    expect(matchesAnyPattern('/assets/app.png', regexps)).toBe(false)
  })
})

describe('appendQueryParam', () => {
  test('adds a leading "?" when the URL has no query string', () => {
    expect(appendQueryParam('/assets/app.js', 'nfdpl', 'abc')).toBe('/assets/app.js?nfdpl=abc')
  })

  test('adds a leading "&" when the URL already has a query string', () => {
    expect(appendQueryParam('/assets/app.js?v=1', 'nfdpl', 'abc')).toBe('/assets/app.js?v=1&nfdpl=abc')
  })

  test('encodes the token value', () => {
    expect(appendQueryParam('/assets/app.js', 'nfdpl', 'a b&c')).toBe('/assets/app.js?nfdpl=a%20b%26c')
  })

  test('inserts before a URL fragment when the URL has no query string', () => {
    expect(appendQueryParam('/assets/app.js#foo', 'nfdpl', 'abc')).toBe('/assets/app.js?nfdpl=abc#foo')
  })

  test('inserts before a URL fragment when the URL already has a query string', () => {
    expect(appendQueryParam('/assets/app.js?v=1#foo', 'nfdpl', 'abc')).toBe('/assets/app.js?v=1&nfdpl=abc#foo')
  })
})

describe('hasQueryParam', () => {
  test('returns false when there is no query string', () => {
    expect(hasQueryParam('/assets/app.js', 'nfdpl', 'abc123')).toBe(false)
  })

  test('returns true when the exact parameter is present', () => {
    expect(hasQueryParam('/assets/app.js?nfdpl=abc123', 'nfdpl', 'abc123')).toBe(true)
    expect(hasQueryParam('/assets/app.js?v=1&nfdpl=abc123', 'nfdpl', 'abc123')).toBe(true)
    expect(hasQueryParam('/assets/app.js?nfdpl=abc123#foo', 'nfdpl', 'abc123')).toBe(true)
  })

  test('returns false when the marker only appears inside another parameter value', () => {
    expect(hasQueryParam('/assets/app.js?debug=nfdpl=abc123', 'nfdpl', 'abc123')).toBe(false)
  })
})
