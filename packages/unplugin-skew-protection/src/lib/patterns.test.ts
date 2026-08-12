import { describe, expect, test } from 'vitest'

import { appendQueryParam, compilePatterns, matchesAnyPattern } from './patterns.js'

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
})
