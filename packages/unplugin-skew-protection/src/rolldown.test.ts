import { env } from 'node:process'

import { describe, expect, test } from 'vitest'

import rolldownSkewProtection from './rolldown.js'

describe('rolldown entry point', () => {
  test('returns a Rolldown plugin object', () => {
    delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    const plugin = rolldownSkewProtection()

    expect(plugin).toMatchObject({
      name: 'netlify:skew-protection',
    })
  })
})
