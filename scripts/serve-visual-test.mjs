import { createServer } from 'node:http'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createRuntimeMetadata, parseBaselineOptions, prepareBaselineRuntime } from './visual-baseline.mjs'

const host = '127.0.0.1'
const port = 4173
const projectDir = resolve(import.meta.dirname, '..')
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

async function fixtureInventory (directory = fixtureDir) {
  const names = (await readdir(directory))
    .filter(name => name.endsWith('.svga'))
    .sort((first, second) => first.localeCompare(second, 'en'))

  return await Promise.all(names.map(async name => ({
    name,
    url: `/fixtures/${encodeURIComponent(name)}`,
    bytes: (await stat(resolve(directory, name))).size,
    expectation: name === 'show.svga' ? 'unsupported-v1' : 'playable'
  })))
}

function send (response, status, body, contentType) {
  response.writeHead(status, { ...securityHeaders, 'Content-Type': contentType })
  response.end(body)
}

export async function createVisualTestServer (options = {}) {
  const root = resolve(options.projectDir || projectDir)
  const fixtures = resolve(options.fixtureDir || resolve(root, 'tests/fixtures/svga'))
  const visual = resolve(options.visualDir || resolve(root, 'tests/visual'))
  const baselineRequest = options.baseline || parseBaselineOptions(options.arguments || [])
  const runtimeDependencies = {
    projectDir: root,
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    ...(options.run ? { run: options.run } : {})
  }
  const local = await createRuntimeMetadata(runtimeDependencies)
  const baseline = await prepareBaselineRuntime(baselineRequest, runtimeDependencies)
  const runtimes = { local, baseline }
  const staticFiles = new Map([
    ['/', { path: resolve(visual, 'index.html'), type: 'text/html; charset=utf-8' }],
    ['/app.js', { path: resolve(visual, 'app.js'), type: 'text/javascript; charset=utf-8' }],
    ['/metrics.js', { path: resolve(visual, 'metrics.js'), type: 'text/javascript; charset=utf-8' }],
    ['/styles.css', { path: resolve(visual, 'styles.css'), type: 'text/css; charset=utf-8' }],
    ['/dist/index.min.js', { path: local.runtimePath, type: 'text/javascript; charset=utf-8' }]
  ])

  async function handleRequest (request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return send(response, 405, 'Method Not Allowed', 'text/plain; charset=utf-8')
    }

    const url = new URL(request.url || '/', `http://${host}:${port}`)
    if (url.pathname === '/api/runtimes') {
      const body = JSON.stringify(runtimes)
      return send(response, 200, request.method === 'HEAD' ? '' : body, 'application/json; charset=utf-8')
    }

    if (url.pathname === '/api/fixtures') {
      const body = JSON.stringify({ fixtures: await fixtureInventory(fixtures) })
      return send(response, 200, request.method === 'HEAD' ? '' : body, 'application/json; charset=utf-8')
    }

    if (url.pathname === '/runtime/local.js' || url.pathname === '/runtime/baseline.js') {
      const runtime = url.pathname === '/runtime/local.js' ? local : baseline
      if (!runtime) return send(response, 404, 'Not Found', 'text/plain; charset=utf-8')
      const bytes = await readFile(runtime.runtimePath)
      return send(response, 200, request.method === 'HEAD' ? '' : bytes, 'text/javascript; charset=utf-8')
    }

    if (url.pathname.startsWith('/fixtures/')) {
      let name = ''
      try {
        name = url.pathname === '/fixtures/extensionless'
          ? '11.svga'
          : decodeURIComponent(url.pathname.slice('/fixtures/'.length))
      } catch {}
      const inventory = await fixtureInventory(fixtures)
      if (!inventory.some(fixture => fixture.name === name)) {
        return send(response, 404, 'Not Found', 'text/plain; charset=utf-8')
      }
      const bytes = await readFile(resolve(fixtures, name))
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
  return { server, runtimes }
}

async function start () {
  const { server, runtimes } = await createVisualTestServer({ arguments: process.argv.slice(2) })
  server.listen(port, host, () => {
    const warning = runtimes.baseline?.warning ? ` ${runtimes.baseline.warning}` : ''
    process.stdout.write(`SVGA visual test page: http://${host}:${port}${warning}\n`)
  })
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void start().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
