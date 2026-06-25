import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import webpack from 'webpack'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { NetlifySkewProtectionPlugin } from './main.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'skew-protection-'))
  const src = join(dir, 'src')
  await mkdir(src, { recursive: true })
  // An entry with a dynamic import forces a lazy chunk and the chunk-URL runtime.
  await writeFile(join(src, 'index.js'), `import('./lazy.js').then((m) => m.default)\n`)
  await writeFile(join(src, 'lazy.js'), `export default 42\n`)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const compile = (plugin: NetlifySkewProtectionPlugin): Promise<void> => {
  const compiler = webpack({
    mode: 'production',
    context: dir,
    entry: join(dir, 'src', 'index.js'),
    output: {
      path: join(dir, 'dist'),
      publicPath: '/',
      filename: '[name].js',
      chunkFilename: '[name].chunk.js',
    },
    optimization: { runtimeChunk: 'single', minimize: false },
    plugins: [plugin],
  })

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      compiler.close(() => {})
      if (err) {
        reject(err)
        return
      }
      if (stats?.hasErrors()) {
        reject(new Error(stats.toString()))
        return
      }
      resolve()
    })
  })
}

describe('NetlifySkewProtectionPlugin', () => {
  test('pins lazy chunk URLs and emits the manifest when a token is present', async () => {
    await compile(new NetlifySkewProtectionPlugin({ token: 'tok123', baseDir: dir }))

    const runtime = await readFile(join(dir, 'dist', 'runtime.js'), 'utf8')
    expect(runtime).toContain('nfdpl=tok123')

    const manifest = JSON.parse(await readFile(join(dir, '.netlify', 'v1', 'skew-protection.json'), 'utf8'))
    expect(manifest).toEqual({
      patterns: ['.*\\.(js|css)$'],
      sources: [{ type: 'query', name: 'nfdpl' }],
    })
  })

  test('honours a custom paramName', async () => {
    await compile(new NetlifySkewProtectionPlugin({ token: 'tok123', baseDir: dir, paramName: 'mydpl' }))

    const runtime = await readFile(join(dir, 'dist', 'runtime.js'), 'utf8')
    expect(runtime).toContain('mydpl=tok123')
  })

  test('is a no-op without a token', async () => {
    await compile(new NetlifySkewProtectionPlugin({ token: undefined, baseDir: dir }))

    const runtime = await readFile(join(dir, 'dist', 'runtime.js'), 'utf8')
    expect(runtime).not.toContain('nfdpl=')
    await expect(readFile(join(dir, '.netlify', 'v1', 'skew-protection.json'), 'utf8')).rejects.toThrow()
  })
})
