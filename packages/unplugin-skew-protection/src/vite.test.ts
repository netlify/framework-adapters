import { env } from 'node:process'

import { afterEach, describe, expect, test } from 'vitest'

import viteSkewProtection from './vite.js'

describe('vite entry point', () => {
  const originalToken = env.NETLIFY_SKEW_PROTECTION_TOKEN

  afterEach(() => {
    if (originalToken === undefined) {
      delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    } else {
      env.NETLIFY_SKEW_PROTECTION_TOKEN = originalToken
    }
  })

  test('returns a Vite plugin object', () => {
    delete env.NETLIFY_SKEW_PROTECTION_TOKEN
    const plugin = viteSkewProtection()

    expect(plugin).toMatchObject({
      name: 'netlify:skew-protection',
    })
  })
})
