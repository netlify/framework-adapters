import { env } from 'node:process'

import { describe, expect, test } from 'vitest'

import rollupSkewProtection from './rollup.js'

describe('rollup entry point', () => {
  test('returns a Rollup plugin object', () => {
    delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    const plugin = rollupSkewProtection()

    expect(plugin).toMatchObject({
      name: 'netlify:skew-protection',
    })
  })
})
