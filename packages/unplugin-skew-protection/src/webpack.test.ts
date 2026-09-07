import { env } from 'node:process'

import { afterEach, describe, expect, test } from 'vitest'

import webpackSkewProtection from './webpack.js'

describe('webpack entry point', () => {
  const originalToken = env.NETLIFY_SKEW_PROTECTION_TOKEN

  afterEach(() => {
    if (originalToken === undefined) {
      delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    } else {
      env.NETLIFY_SKEW_PROTECTION_TOKEN = originalToken
    }
  })

  test('returns a webpack plugin instance', () => {
    delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    const plugin = webpackSkewProtection()
    expect(typeof plugin.apply).toBe('function')
  })
})
