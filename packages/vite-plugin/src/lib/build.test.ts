import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'
import { afterEach, describe, expect, test } from 'vitest'

import { createBuildPlugin, type BuildPluginOptions } from './build.js'

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

const buildProject = async (root: string, options: BuildPluginOptions, base?: string) => {
  await build({
    root,
    base,
    logLevel: 'silent',
    build: { ssr: 'server.js', outDir: 'dist/server' },
    environments: { client: { build: { outDir: 'dist/client' } } },
    plugins: [createBuildPlugin(options)],
  })
}

const writeClientBuild = async (root: string, files: string[]) => {
  for (const file of files) {
    await mkdir(dirname(join(root, 'dist/client', file)), { recursive: true })
    await writeFile(join(root, 'dist/client', file), '')
  }
}

const readExcludedPath = async (root: string) => {
  const contents = await readFile(join(root, '.netlify/v1/edge-functions/server.mjs'), 'utf8')

  return JSON.parse(/excludedPath: (.*),/.exec(contents)?.[1] ?? 'null') as unknown
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

describe('build targets', () => {
  test('writes a function that serves the SSR entry', async () => {
    const root = await createProject()
    await buildProject(root, {})

    const file = join(root, '.netlify/v1/functions/server.mjs')
    const { default: handler, config } = await importModule<{ default: Handler; config: unknown }>(file)

    expect(config).toMatchObject({ path: '/*', excludedPath: ['/.netlify/*'], preferStatic: true })
    expect(await (await handler(new Request('http://localhost/a'))).text()).toBe('hello from /a')
  })

  test('writes an edge function that leaves every file in the client build to the CDN', async () => {
    const root = await createProject()
    await writeClientBuild(root, ['index.html', 'assets/app.js', 'about/index.html', 'docs.html', 'favicon.ico'])
    await buildProject(root, { target: 'edge' })

    const contents = await readFile(join(root, '.netlify/v1/edge-functions/server.mjs'), 'utf8')

    expect(contents).toContain('path: "/*"')
    expect(contents).toContain('cache: "manual"')
    expect(await readExcludedPath(root)).toEqual([
      '/.netlify/*',
      '/',
      '/about',
      '/about/',
      '/about/index.html',
      '/assets/app.js',
      '/docs',
      '/docs.html',
      '/favicon.ico',
      '/index.html',
    ])
  })

  // https://vite.dev/config/shared-options#base
  test.for([
    { base: '', prefix: '/' },
    { base: './', prefix: '/' },
    { base: '/', prefix: '/' },
    { base: '/foo', prefix: '/foo/' },
    { base: '/foo/', prefix: '/foo/' },
    { base: 'https://example.com/foo', prefix: '/foo/' },
    { base: 'https://example.com/foo/', prefix: '/foo/' },
  ])("prefixes the edge function's excluded paths with the base $base", async ({ base, prefix }) => {
    const root = await createProject()
    await writeClientBuild(root, ['index.html', 'bar/index.html', 'docs.html', 'assets/app.js'])
    await buildProject(root, { target: 'edge' }, base)

    const staticPaths = [
      prefix,
      `${prefix}assets/app.js`,
      `${prefix}bar`,
      `${prefix}bar/`,
      `${prefix}bar/index.html`,
      `${prefix}docs`,
      `${prefix}docs.html`,
      `${prefix}index.html`,
      // The root's path without the trailing slash, which only exists under a base.
      ...(prefix === '/' ? [] : [prefix.slice(0, -1)]),
    ]

    expect(await readExcludedPath(root)).toEqual(['/.netlify/*', ...staticPaths.sort()])
  })

  test('falls back to the assets and public directories before the client build has run', async () => {
    const root = await createProject()
    await mkdir(join(root, 'public/about'), { recursive: true })
    await writeFile(join(root, 'public/about/index.html'), '')
    await writeFile(join(root, 'public/docs.html'), '')
    await buildProject(root, { target: 'edge' })

    expect(await readExcludedPath(root)).toEqual([
      '/.netlify/*',
      '/about',
      '/about/',
      '/about/index.html',
      '/assets/*',
      '/docs',
      '/docs.html',
      '/favicon.ico',
    ])
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

  test('fails without touching a config file it cannot parse', async () => {
    const root = await createProject()
    const config = '{"headers": [],}'
    await mkdir(join(root, '.netlify/v1'), { recursive: true })
    await writeFile(join(root, '.netlify/v1/config.json'), config)

    await expect(buildProject(root, { target: 'server' })).rejects.toThrow('Could not parse .netlify/v1/config.json')
    expect(await readFile(join(root, '.netlify/v1/config.json'), 'utf8')).toBe(config)
  })

  test('removes the SSR output from the server when deploying elsewhere', async () => {
    const root = await createProject()
    await mkdir(join(root, '.netlify/v1'), { recursive: true })
    await writeFile(join(root, '.netlify/v1/config.json'), JSON.stringify({ headers: [] }))

    await buildProject(root, { target: 'server' })
    await buildProject(root, { target: 'function' })

    expect(await readConfig(root)).toEqual({ headers: [] })
  })

  test("doesn't leave a config file behind when deploying elsewhere", async () => {
    const root = await createProject()
    await buildProject(root, { target: 'function' })

    expect(await exists(join(root, '.netlify/v1/config.json'))).toBe(false)

    await buildProject(root, { target: 'server' })
    await buildProject(root, { target: 'function' })

    expect(await exists(join(root, '.netlify/v1/config.json'))).toBe(false)
  })

  test('removes a function generated by an earlier version of the plugin', async () => {
    const root = await createProject()
    await mkdir(join(root, '.netlify/v1/functions'), { recursive: true })
    await writeFile(
      join(root, '.netlify/v1/functions/server.mjs'),
      'export default () => {}\nexport const config = { generator: "@netlify/vite-plugin@3.0.1", path: "/*" };',
    )

    await buildProject(root, { target: 'server' })

    expect(await exists(join(root, '.netlify/v1/functions/server.mjs'))).toBe(false)
  })

  test('removes the files generated for the previous target', async () => {
    const root = await createProject()
    await buildProject(root, { target: 'function' })
    await buildProject(root, { target: 'server' })

    expect(await exists(join(root, '.netlify/v1/functions/server.mjs'))).toBe(false)
    expect(await exists(join(root, '.netlify/v1/server/index.mjs'))).toBe(true)
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
