import { env } from 'node:process'

import { describe, expect, test } from 'vitest'

import webpackSkewProtection from './webpack.js'

describe('webpack entry point', () => {
  test('returns a webpack plugin instance', () => {
    delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    const plugin = webpackSkewProtection()
    expect(typeof plugin.apply).toBe('function')
  })
})
