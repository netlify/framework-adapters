import { env } from 'node:process'

import { describe, expect, test } from 'vitest'

import viteSkewProtection from './vite.js'

describe('vite entry point', () => {
  test('returns a Vite plugin object', () => {
    delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    const plugin = viteSkewProtection()

    expect(plugin).toMatchObject({
      name: 'netlify:skew-protection',
    })
  })
})
