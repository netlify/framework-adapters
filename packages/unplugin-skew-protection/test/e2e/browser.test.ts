import { join } from 'node:path'
import { rm } from 'node:fs/promises'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chromium, type Browser } from 'playwright'

import { BUNDLERS, PAGES, TOKEN, createFixture } from '../support/builders.js'
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

  test('serves pages whose asset requests are pinned to the deploy', async () => {
    const assetRequests: URL[] = []
    const failedResponses: string[] = []
    const rendered: { path: string; text: string | null }[] = []

    for (const { path } of PAGES) {
      // Each document gets a browser page of its own: `newPage` opens a fresh context, so the chunk
      // the two documents share is requested again on the second visit instead of being served out
      // of the first visit's cache, where it would never be observed at all.
      const page = await browser.newPage()

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
          failedResponses.push(`${path} -> ${String(response.status())} ${response.url()}`)
        }
      })

      try {
        await page.goto(`${server.url}${path}`)

        // The fixture marks `data-state` on both the success and failure paths, so a chunk that
        // never loads leaves the text at "<name> loading" for the comparison below to report,
        // rather than stalling the whole test -- which keeps every page and assertion in play and
        // shows all the problems in one go.
        await page.waitForSelector('#app[data-state]', { timeout: 10_000 }).catch(() => null)

        rendered.push({ path, text: await page.textContent('#app') })
      } finally {
        await page.close()
      }
    }

    expect
      .soft(
        failedResponses,
        'these pages requested assets that the server could not serve, so a stamped URL does not point at a file this build emitted',
      )
      .toEqual([])

    expect
      .soft(
        rendered,
        'these pages did not settle with both of their shared chunks evaluated, so a stamped specifier does not resolve to a working module',
      )
      .toEqual(PAGES.map(({ path, text }) => ({ path, text })))

    // Deduplicated because the two pages request the chunk they share separately, and sorted so the
    // comparison does not depend on the order the browser happened to fetch things in.
    const unstamped = [
      ...new Set(assetRequests.filter((url) => url.search !== EXPECTED_QUERY).map((url) => url.pathname)),
    ].sort()
    expect
      .soft(
        unstamped,
        'these assets were requested without the deploy-pinning query parameter, so they are not pinned to this deploy',
      )
      .toEqual(expectedUnstamped)

    // Guards against a vacuous pass: with no asset requests at all, the comparison above is
    // satisfied by an empty list for the bundlers that are expected to stamp everything.
    const stamped = assetRequests.filter((url) => url.search === EXPECTED_QUERY)
    expect
      .soft(
        stamped.length,
        `no asset was requested with the deploy-pinning query parameter (all requests: ${assetRequests.map((url) => url.pathname).join(', ') || 'none'})`,
      )
      .toBeGreaterThan(0)
  })
})
