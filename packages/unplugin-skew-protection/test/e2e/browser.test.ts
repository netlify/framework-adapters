import { join } from 'node:path'
import { rm } from 'node:fs/promises'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chromium, type Browser } from 'playwright'

import { BUNDLERS, TOKEN, createFixture } from '../support/builders.js'
import { serveStatic, type StaticServer } from '../support/serve.js'

const EXPECTED_QUERY = `?nfdpl=${TOKEN}`

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser.close()
})

describe.each(BUNDLERS)('$name', ({ build, expectedUnstamped }) => {
  let root: string
  let server: StaticServer

  beforeAll(async () => {
    root = await createFixture()
    const outDir = join(root, 'dist')
    await build(root, outDir)
    server = await serveStatic(outDir)
  })

  afterAll(async () => {
    await server.close()
    await rm(root, { force: true, recursive: true })
  })

  test('serves an app whose asset requests are pinned to the deploy', async () => {
    const page = await browser.newPage()
    const assetRequests: URL[] = []
    const failedResponses: string[] = []

    page.on('request', (request) => {
      const url = new URL(request.url())

      if (/\.(css|js|mjs)$/.test(url.pathname)) {
        assetRequests.push(url)
      }
    })

    page.on('response', (response) => {
      // The browser asks for a favicon that the fixture does not ship; every other 4xx/5xx
      // means a stamped URL failed to resolve, which is the failure mode worth catching.
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
        failedResponses.push(`${String(response.status())} ${response.url()}`)
      }
    })

    try {
      await page.goto(`${server.url}/`)

      // The fixture marks `data-state` on both the success and failure paths, so a chunk that
      // never loads is reported as a soft failure here instead of stalling the whole test --
      // which keeps the assertions below running and shows every problem in one go.
      const reachedTerminalState = await page
        .waitForSelector('#app[data-state]', { timeout: 10_000 })
        .then(() => true)
        .catch(() => false)

      expect
        .soft(reachedTerminalState, 'the app never finished loading: its dynamic import neither resolved nor rejected')
        .toBe(true)

      expect
        .soft(
          failedResponses,
          'the page requested assets that the server could not serve, so a stamped URL does not point at a file this build emitted',
        )
        .toEqual([])

      expect
        .soft(
          await page.textContent('#app'),
          'the lazily imported chunk did not evaluate in the browser, so its stamped specifier does not resolve to a working module',
        )
        .toBe('lazy chunk loaded')

      const unstamped = assetRequests.filter((url) => url.search !== EXPECTED_QUERY).map((url) => url.pathname)
      expect
        .soft(
          unstamped,
          'these assets were requested without the deploy-pinning query parameter, so they are not pinned to this deploy',
        )
        .toEqual(expectedUnstamped)

      // Guards against a vacuous pass: with no asset requests at all, the comparison above is
      // satisfied by an empty list for the bundlers that are expected to stamp everything.
      const stamped = assetRequests.filter((url) => url.search === EXPECTED_QUERY).map((url) => url.pathname)
      expect
        .soft(
          stamped.length,
          `no asset was requested with the deploy-pinning query parameter (all requests: ${assetRequests.map((url) => url.pathname).join(', ') || 'none'})`,
        )
        .toBeGreaterThan(0)
    } finally {
      await page.close()
    }
  })
})
