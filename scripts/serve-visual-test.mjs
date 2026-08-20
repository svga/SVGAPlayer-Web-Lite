import { createServer } from 'node:http'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const host = '127.0.0.1'
const port = 4173
const projectDir = resolve(import.meta.dirname, '..')
const visualDir = resolve(projectDir, 'tests/visual')
const fixtureDir = resolve(projectDir, 'tests/fixtures/svga')

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; connect-src 'self' blob:; img-src 'self' blob: data:; object-src 'none'; script-src 'self'; style-src 'self'; worker-src blob:",
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'cross-origin-isolated=(self)',
  'X-Content-Type-Options': 'nosniff'
}

const staticFiles = new Map([
  ['/', { path: resolve(visualDir, 'index.html'), type: 'text/html; charset=utf-8' }],
  ['/app.js', { path: resolve(visualDir, 'app.js'), type: 'text/javascript; charset=utf-8' }],
  ['/metrics.js', { path: resolve(visualDir, 'metrics.js'), type: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { path: resolve(visualDir, 'styles.css'), type: 'text/css; charset=utf-8' }],
  ['/dist/index.min.js', { path: resolve(projectDir, 'dist/index.min.js'), type: 'text/javascript; charset=utf-8' }]
])

async function fixtureInventory () {
  const names = (await readdir(fixtureDir))
    .filter(name => name.endsWith('.svga'))
    .sort((first, second) => first.localeCompare(second, 'en'))

  return await Promise.all(names.map(async name => ({
    name,
    url: `/fixtures/${encodeURIComponent(name)}`,
    bytes: (await stat(resolve(fixtureDir, name))).size,
    expectation: name === 'show.svga' ? 'unsupported-v1' : 'playable'
  })))
}

function send (response, status, body, contentType) {
  response.writeHead(status, { ...securityHeaders, 'Content-Type': contentType })
  response.end(body)
}

async function handleRequest (request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return send(response, 405, 'Method Not Allowed', 'text/plain; charset=utf-8')
  }

  const url = new URL(request.url || '/', `http://${host}:${port}`)
  if (url.pathname === '/api/fixtures') {
    const body = JSON.stringify({ fixtures: await fixtureInventory() })
    return send(response, 200, request.method === 'HEAD' ? '' : body, 'application/json; charset=utf-8')
  }

  if (url.pathname.startsWith('/fixtures/')) {
    let name = ''
    try {
      name = url.pathname === '/fixtures/extensionless'
        ? '11.svga'
        : decodeURIComponent(url.pathname.slice('/fixtures/'.length))
    } catch {}
    const fixtures = await fixtureInventory()
    if (!fixtures.some(fixture => fixture.name === name)) {
      return send(response, 404, 'Not Found', 'text/plain; charset=utf-8')
    }
    const bytes = await readFile(resolve(fixtureDir, name))
    return send(response, 200, request.method === 'HEAD' ? '' : bytes, 'application/octet-stream')
  }

  const file = staticFiles.get(url.pathname)
  if (!file) return send(response, 404, 'Not Found', 'text/plain; charset=utf-8')
  try {
    const bytes = await readFile(file.path)
    return send(response, 200, request.method === 'HEAD' ? '' : bytes, file.type)
  } catch (error) {
    const status = error && typeof error === 'object' && error.code === 'ENOENT' ? 404 : 500
    return send(response, status, status === 404 ? 'Not Found' : 'Internal Server Error', 'text/plain; charset=utf-8')
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) send(response, 500, 'Internal Server Error', 'text/plain; charset=utf-8')
    else response.destroy()
  })
})

server.listen(port, host, () => {
  process.stdout.write(`SVGA visual test page: http://${host}:${port}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
