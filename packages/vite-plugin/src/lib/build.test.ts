import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { build, createLogger } from 'vite'
import { afterEach, describe, expect, test } from 'vitest'

import { createBuildPlugin, resolveBuildTarget, type BuildPluginOptions } from './build.js'

const cleanupJobs: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(cleanupJobs.splice(0).map((job) => job()))
})

const createProject = async () => {
  const root = await mkdtemp(join(tmpdir(), 'vite-plugin-build-'))
  cleanupJobs.push(() => rm(root, { force: true, recursive: true }))

  await writeFile(
    join(root, 'server.js'),
    `export default { fetch: (request) => new Response("hello from " + new URL(request.url).pathname) }`,
  )
  await mkdir(join(root, 'public', 'fonts'), { recursive: true })
  await writeFile(join(root, 'public', 'favicon.ico'), '')

  return root
}

const buildProject = async (root: string, options: BuildPluginOptions) => {
  const warnings: string[] = []
  const logger = createLogger('silent')

  logger.warn = (message) => {
    warnings.push(message)
  }

  await build({
    root,
    customLogger: logger,
    build: { ssr: 'server.js', outDir: 'dist/server' },
    plugins: [createBuildPlugin(options)],
  })

  return warnings
}

type Handler = (request: Request) => Promise<Response>

const importModule = async <T>(path: string) => (await import(pathToFileURL(path).href)) as T

const readConfig = async (root: string): Promise<unknown> =>
  JSON.parse(await readFile(join(root, '.netlify/v1/config.json'), 'utf8'))

const exists = (path: string) =>
  readFile(path).then(
    () => true,
    () => false,
  )

describe('resolveBuildTarget', () => {
  test('defaults to a function', () => {
    expect(resolveBuildTarget()).toBe('function')
    expect(resolveBuildTarget({ edgeSSR: false })).toBe('function')
  })

  test('uses the target that is set', () => {
    expect(resolveBuildTarget({ target: 'server' })).toBe('server')
    expect(resolveBuildTarget({ target: 'edge' })).toBe('edge')
  })

  test('treats the deprecated edgeSSR flag as the edge target', () => {
    expect(resolveBuildTarget({ edgeSSR: true })).toBe('edge')
  })

  test('fails when edgeSSR is set along with another target', () => {
    // @ts-expect-error -- mutually exclusive
    expect(() => resolveBuildTarget({ target: 'server', edgeSSR: true })).toThrow(
      "build.edgeSSR deploys the server build to an Edge Function, but build.target is set to 'server'",
    )
    // @ts-expect-error -- mutually exclusive
    expect(() => resolveBuildTarget({ target: 'function', edgeSSR: true })).toThrow("build.target is set to 'function'")
  })
})

describe('build targets', () => {
  test('writes a function that serves the SSR entry', async () => {
    const root = await createProject()
    await buildProject(root, {})

    const file = join(root, '.netlify/v1/functions/server.mjs')
    const { default: handler, config } = await importModule<{ default: Handler; config: unknown }>(file)

    expect(config).toMatchObject({ path: '/*', preferStatic: true })
    expect(await (await handler(new Request('http://localhost/a'))).text()).toBe('hello from /a')
  })

  test('writes an edge function that leaves static files to the CDN', async () => {
    const root = await createProject()
    await buildProject(root, { target: 'edge' })

    const contents = await readFile(join(root, '.netlify/v1/edge-functions/server.mjs'), 'utf8')

    expect(contents).toContain('path: "/*"')
    expect(contents).toContain('excludedPath: ["/assets/*","/favicon.ico","/fonts/*"]')
  })

  test('writes a server entry and includes the SSR output in the server', async () => {
    const root = await createProject()
    await mkdir(join(root, '.netlify/v1'), { recursive: true })
    await writeFile(join(root, '.netlify/v1/config.json'), JSON.stringify({ server: { region: 'fra' } }))

    await buildProject(root, { target: 'server' })

    const file = join(root, '.netlify/v1/server/index.mjs')
    const { default: server } = await importModule<{ default: { fetch: Handler } }>(file)
    expect(await (await server.fetch(new Request('http://localhost/b'))).text()).toBe('hello from /b')
    expect(await readConfig(root)).toEqual({ server: { region: 'fra', includedFiles: ['dist/server/**'] } })

    await buildProject(root, { target: 'server' })

    expect(await readConfig(root)).toEqual({ server: { region: 'fra', includedFiles: ['dist/server/**'] } })
  })

  test('removes the files generated for the previous target', async () => {
    const root = await createProject()
    await buildProject(root, { target: 'function' })
    await buildProject(root, { target: 'server' })

    expect(await exists(join(root, '.netlify/v1/functions/server.mjs'))).toBe(false)
    expect(await exists(join(root, '.netlify/v1/server/index.mjs'))).toBe(true)
  })

  test('warns that edgeSSR is deprecated, and still deploys to an edge function', async () => {
    const root = await createProject()
    const warnings = await buildProject(root, { edgeSSR: true })

    expect(warnings).toEqual([expect.stringContaining('build.edgeSSR is deprecated')])
    expect(warnings[0]).toContain("Use build.target: 'edge' instead")
    expect(await exists(join(root, '.netlify/v1/edge-functions/server.mjs'))).toBe(true)
  })

  test("doesn't warn about edgeSSR when it is off or a target is set", async () => {
    const root = await createProject()

    expect(await buildProject(root, { edgeSSR: false })).toEqual([])
    expect(await buildProject(root, { target: 'edge' })).toEqual([])
  })

  test('fails when the project already has its own server', async () => {
    const root = await createProject()
    await mkdir(join(root, 'netlify/server'), { recursive: true })
    await writeFile(join(root, 'netlify/server/index.ts'), 'export default {}')

    await expect(buildProject(root, { target: 'server' })).rejects.toThrow(
      "build.target is set to 'server', but this project already has a Netlify Server in netlify/server/index.ts",
    )
    expect(await exists(join(root, '.netlify/v1/server/index.mjs'))).toBe(false)

    await buildProject(root, { target: 'function' })
  })

  test('fails when another tool already wrote a server', async () => {
    const root = await createProject()
    await mkdir(join(root, '.netlify/v1/server'), { recursive: true })
    await writeFile(join(root, '.netlify/v1/server/index.js'), 'export default {}')

    await expect(buildProject(root, { target: 'server' })).rejects.toThrow(
      'already has a Netlify Server in .netlify/v1/server/index.js',
    )
  })

  test('replaces a server it generated in an earlier build', async () => {
    const root = await createProject()
    await buildProject(root, { target: 'server' })
    await buildProject(root, { target: 'server' })

    expect(await exists(join(root, '.netlify/v1/server/index.mjs'))).toBe(true)
  })

  test('keeps files at those paths that the plugin did not generate', async () => {
    const root = await createProject()
    await mkdir(join(root, '.netlify/v1/server'), { recursive: true })
    await writeFile(join(root, '.netlify/v1/server/index.mjs'), 'export default {}')

    await buildProject(root, { target: 'function' })

    expect(await exists(join(root, '.netlify/v1/server/index.mjs'))).toBe(true)
  })
})
