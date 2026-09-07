import { cwd, env } from 'node:process'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { DEFAULT_PARAM_NAME, DEFAULT_PATTERNS, resolveOptions } from './options.js'

describe('resolveOptions', () => {
  const originalToken = env.NETLIFY_SKEW_PROTECTION_TOKEN

  beforeEach(() => {
    delete env.NETLIFY_SKEW_PROTECTION_TOKEN
  })

  afterEach(() => {
    if (originalToken === undefined) {
      delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    } else {
      env.NETLIFY_SKEW_PROTECTION_TOKEN = originalToken
    }
  })

  test('is a no-op when no token is provided', () => {
    expect(resolveOptions()).toBeNull()
    expect(resolveOptions({})).toBeNull()
  })

  test('is a no-op when the token is "0"', () => {
    expect(
      resolveOptions({
        token: '0',
      }),
    ).toBeNull()
  })

  test('reads the token from NETLIFY_SKEW_PROTECTION_TOKEN by default', () => {
    env.NETLIFY_SKEW_PROTECTION_TOKEN = 'from-env'

    expect(resolveOptions()).toMatchObject({
      token: 'from-env',
    })
  })

  test('an explicit token option takes precedence over the environment variable', () => {
    env.NETLIFY_SKEW_PROTECTION_TOKEN = 'from-env'

    expect(
      resolveOptions({
        token: 'from-options',
      }),
    ).toMatchObject({
      token: 'from-options',
    })
  })

  test('applies defaults for paramName, patterns, and baseDir', () => {
    const resolved = resolveOptions({
      token: 'abc',
    })

    expect(resolved).toEqual({
      baseDir: cwd(),
      paramName: DEFAULT_PARAM_NAME,
      patterns: DEFAULT_PATTERNS,
      token: 'abc',
    })
  })

  test('throws a clear error when a pattern is not a valid regular expression', () => {
    expect(() =>
      resolveOptions({
        patterns: ['('],
        token: 'abc',
      }),
    ).toThrow('Invalid skew protection pattern "("')
  })

  test('honors explicit overrides', () => {
    const resolved = resolveOptions({
      baseDir: '/tmp/site',
      paramName: 'custom',
      patterns: ['.*\\.wasm$'],
      token: 'abc',
    })

    expect(resolved).toEqual({
      baseDir: '/tmp/site',
      paramName: 'custom',
      patterns: ['.*\\.wasm$'],
      token: 'abc',
    })
  })
})
