import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
}

export interface StaticServer {
  close: () => Promise<void>
  url: string
}

/**
 * Serves `root` over HTTP for the duration of a test. The query string is ignored when
 * resolving a file, which is what makes the skew protection parameter transparent to a
 * static host: `/assets/shared-abc.js?nfdpl=token` has to serve `/assets/shared-abc.js`.
 */
export async function serveStatic(root: string): Promise<StaticServer> {
  const server = createServer((req, res) => {
    // `req.url` is a path plus an optional query string, so a fixed base is enough to parse it.
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')

    // Reject traversal outside the served directory rather than reading an arbitrary file.
    if (normalize(relativePath).startsWith('..')) {
      res.writeHead(403).end()
      return
    }

    readFile(join(root, relativePath))
      .then((body) => {
        const extension = relativePath.slice(relativePath.lastIndexOf('.'))
        res.writeHead(200, { 'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream' }).end(body)
      })
      .catch(() => {
        res.writeHead(404).end()
      })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()

  if (address === null || typeof address === 'string') {
    throw new Error('static server did not bind to a TCP port')
  }

  return {
    close: () => closeServer(server),
    url: `http://127.0.0.1:${String(address.port)}`,
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}
