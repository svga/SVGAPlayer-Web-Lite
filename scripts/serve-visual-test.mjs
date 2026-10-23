import { createServer } from 'node:http'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  createRuntimeMetadata,
  parseBaselineOptions,
  prepareBaselineRuntime,
} from './visual-baseline.mjs'

const host = '127.0.0.1'
const port = Number.parseInt(process.env.SVGA_VISUAL_PORT || '4173', 10)
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new Error('SVGA_VISUAL_PORT must be a valid TCP port')
const projectDir = resolve(import.meta.dirname, '..')
const fixtureDir = resolve(projectDir, 'tests/fixtures/svga')

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; connect-src 'self' blob:; img-src 'self' blob: data:; object-src 'none'; script-src 'self'; style-src 'self'; worker-src blob:",
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'cross-origin-isolated=(self)',
  'X-Content-Type-Options': 'nosniff',
}

const runnerSecurityHeaders = {
  ...securityHeaders,
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; connect-src 'self' blob:; img-src 'self' blob: data:; object-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self'; worker-src blob:",
}

// Only the API lab runner needs eval for the Parser direct-mode case, and
// data: for its data-URL case. The API lab page itself stays on strict CSP.
export const apiRunnerSecurityHeaders = {
  ...securityHeaders,
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; connect-src 'self' blob: data:; img-src 'self' blob: data:; object-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self'; worker-src blob:",
}

export function runnerSecurityHeadersFor(runtime, baseline) {
  return runtime === 'baseline' && baseline?.source === 'npm' && baseline.version === '2.1.1'
    ? runnerSecurityHeaders
    : securityHeaders
}

async function fixtureInventory(directory = fixtureDir) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith('.svga'))
    .sort((first, second) => first.localeCompare(second, 'en'))

  return await Promise.all(
    names.map(async (name) => ({
      name,
      url: `/fixtures/${encodeURIComponent(name)}`,
      bytes: (await stat(resolve(directory, name))).size,
      expectation: name === 'show.svga' ? 'unsupported-v1' : 'playable',
    })),
  )
}

function send(response, status, body, contentType, headers = securityHeaders) {
  response.writeHead(status, {
    ...headers,
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
  })
  response.end(body)
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

function labHeaders(request) {
  const headers = request.headers
  return {
    instance: headers['x-lab-instance'],
    call: headers['x-lab-call'],
    override: headers['x-lab-override'],
  }
}

async function labEcho(request, response, url, fixtures, inventory) {
  const fixtureName = url.searchParams.get('fixture')
  const headers = labHeaders(request)
  if (!fixtureName) {
    return send(
      response,
      200,
      request.method === 'HEAD' ? '' : JSON.stringify({ headers }),
      'application/json; charset=utf-8',
    )
  }
  if (!inventory.some((fixture) => fixture.name === fixtureName)) {
    return send(response, 400, 'Unknown fixture', 'text/plain; charset=utf-8')
  }
  // The API lab asserts header forwarding by requiring the merged values:
  // instance header, per-call header, and the per-call override.
  if (headers.instance !== 'instance' || headers.call !== 'call' || headers.override !== 'call') {
    return send(response, 403, 'Missing lab headers', 'text/plain; charset=utf-8')
  }
  const bytes = await readFile(resolve(fixtures, fixtureName))
  return send(response, 200, request.method === 'HEAD' ? '' : bytes, 'application/octet-stream')
}

async function labDelay(request, response, url, fixtures, inventory) {
  const fixtureName = url.searchParams.get('fixture')
  if (!fixtureName || !inventory.some((fixture) => fixture.name === fixtureName)) {
    return send(response, 400, 'Unknown fixture', 'text/plain; charset=utf-8')
  }
  const milliseconds = clampInteger(url.searchParams.get('ms'), 0, 5_000, 0)
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
  const bytes = await readFile(resolve(fixtures, fixtureName))
  return send(response, 200, request.method === 'HEAD' ? '' : bytes, 'application/octet-stream')
}

export async function createVisualTestServer(options = {}) {
  const root = resolve(options.projectDir || projectDir)
  const fixtures = resolve(options.fixtureDir || resolve(root, 'tests/fixtures/svga'))
  const visual = resolve(options.visualDir || resolve(root, 'tests/visual'))
  const baselineRequest = options.baseline || parseBaselineOptions(options.arguments || [])
  const runtimeDependencies = {
    projectDir: root,
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    ...(options.run ? { run: options.run } : {}),
  }
  const local = await createRuntimeMetadata(runtimeDependencies)
  const baseline = await prepareBaselineRuntime(baselineRequest, runtimeDependencies)
  const runtimes = { local, baseline }
  const staticFiles = new Map([
    ['/', { path: resolve(visual, 'index.html'), type: 'text/html; charset=utf-8' }],
    ['/app.js', { path: resolve(visual, 'app.js'), type: 'text/javascript; charset=utf-8' }],
    [
      '/metrics.js',
      { path: resolve(visual, 'metrics.js'), type: 'text/javascript; charset=utf-8' },
    ],
    [
      '/comparison.js',
      { path: resolve(visual, 'comparison.js'), type: 'text/javascript; charset=utf-8' },
    ],
    [
      '/comparison-orchestrator.js',
      {
        path: resolve(visual, 'comparison-orchestrator.js'),
        type: 'text/javascript; charset=utf-8',
      },
    ],
    ['/runner.html', { path: resolve(visual, 'runner.html'), type: 'text/html; charset=utf-8' }],
    ['/runner.js', { path: resolve(visual, 'runner.js'), type: 'text/javascript; charset=utf-8' }],
    ['/runner.css', { path: resolve(visual, 'runner.css'), type: 'text/css; charset=utf-8' }],
    [
      '/runner-client.js',
      { path: resolve(visual, 'runner-client.js'), type: 'text/javascript; charset=utf-8' },
    ],
    ['/styles.css', { path: resolve(visual, 'styles.css'), type: 'text/css; charset=utf-8' }],
    ['/api-lab.html', { path: resolve(visual, 'api-lab.html'), type: 'text/html; charset=utf-8' }],
    [
      '/api-lab.js',
      { path: resolve(visual, 'api-lab.js'), type: 'text/javascript; charset=utf-8' },
    ],
    [
      '/api-cases.js',
      { path: resolve(visual, 'api-cases.js'), type: 'text/javascript; charset=utf-8' },
    ],
    [
      '/api-case-runners.js',
      {
        path: resolve(visual, 'api-case-runners.js'),
        type: 'text/javascript; charset=utf-8',
      },
    ],
    [
      '/api-comparison.js',
      { path: resolve(visual, 'api-comparison.js'), type: 'text/javascript; charset=utf-8' },
    ],
    [
      '/api-runner-client.js',
      {
        path: resolve(visual, 'api-runner-client.js'),
        type: 'text/javascript; charset=utf-8',
      },
    ],
    [
      '/api-runner.html',
      { path: resolve(visual, 'api-runner.html'), type: 'text/html; charset=utf-8' },
    ],
    [
      '/api-runner.js',
      { path: resolve(visual, 'api-runner.js'), type: 'text/javascript; charset=utf-8' },
    ],
    [
      '/api-runner.css',
      { path: resolve(visual, 'api-runner.css'), type: 'text/css; charset=utf-8' },
    ],
    ['/dist/index.min.js', { path: local.runtimePath, type: 'text/javascript; charset=utf-8' }],
  ])

  async function handleRequest(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return send(response, 405, 'Method Not Allowed', 'text/plain; charset=utf-8')
    }

    const url = new URL(request.url || '/', `http://${host}:${port}`)
    if (url.pathname === '/api/runtimes') {
      const body = JSON.stringify(runtimes)
      return send(
        response,
        200,
        request.method === 'HEAD' ? '' : body,
        'application/json; charset=utf-8',
      )
    }

    if (url.pathname === '/api/fixtures') {
      const body = JSON.stringify({ fixtures: await fixtureInventory(fixtures) })
      return send(
        response,
        200,
        request.method === 'HEAD' ? '' : body,
        'application/json; charset=utf-8',
      )
    }

    if (url.pathname === '/api/lab/echo') {
      return labEcho(request, response, url, fixtures, await fixtureInventory(fixtures))
    }

    if (url.pathname === '/api/lab/delay') {
      return labDelay(request, response, url, fixtures, await fixtureInventory(fixtures))
    }

    if (url.pathname === '/api/lab/status') {
      const status = clampInteger(url.searchParams.get('code'), 400, 599, 404)
      return send(
        response,
        status,
        request.method === 'HEAD' ? '' : `Lab status ${status}`,
        'text/plain; charset=utf-8',
      )
    }

    if (url.pathname === '/runtime/local.js' || url.pathname === '/runtime/baseline.js') {
      const runtime = url.pathname === '/runtime/local.js' ? local : baseline
      if (!runtime) return send(response, 404, 'Not Found', 'text/plain; charset=utf-8')
      const bytes = await readFile(runtime.runtimePath)
      return send(
        response,
        200,
        request.method === 'HEAD' ? '' : bytes,
        'text/javascript; charset=utf-8',
      )
    }

    if (url.pathname.startsWith('/fixtures/')) {
      let name = ''
      try {
        name =
          url.pathname === '/fixtures/extensionless'
            ? '11.svga'
            : decodeURIComponent(url.pathname.slice('/fixtures/'.length))
      } catch {}
      const inventory = await fixtureInventory(fixtures)
      if (!inventory.some((fixture) => fixture.name === name)) {
        return send(response, 404, 'Not Found', 'text/plain; charset=utf-8')
      }
      const bytes = await readFile(resolve(fixtures, name))
      return send(response, 200, request.method === 'HEAD' ? '' : bytes, 'application/octet-stream')
    }

    const file = staticFiles.get(url.pathname)
    if (!file) return send(response, 404, 'Not Found', 'text/plain; charset=utf-8')
    try {
      const bytes = await readFile(file.path)
      const headers =
        url.pathname === '/runner.html'
          ? runnerSecurityHeadersFor(url.searchParams.get('runtime'), baseline)
          : url.pathname === '/api-runner.html'
            ? apiRunnerSecurityHeaders
            : file.headers
      return send(response, 200, request.method === 'HEAD' ? '' : bytes, file.type, headers)
    } catch (error) {
      const status = error && typeof error === 'object' && error.code === 'ENOENT' ? 404 : 500
      return send(
        response,
        status,
        status === 404 ? 'Not Found' : 'Internal Server Error',
        'text/plain; charset=utf-8',
      )
    }
  }

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch(() => {
      if (!response.headersSent)
        send(response, 500, 'Internal Server Error', 'text/plain; charset=utf-8')
      else response.destroy()
    })
  })
  return { server, runtimes }
}

async function start() {
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
  void start().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
