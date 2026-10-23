import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const ORIGIN = 'https://csp.test'

interface ProbeOptions {
  policy: string
  probe: string
  expectConsoleErrors?: boolean
}

async function runProbe(page: Page, options: ProbeOptions): Promise<Record<string, unknown>> {
  const script = await readFile(resolve('dist/index.min.js'))
  const fixture = await readFile(resolve('tests/fixtures/svga/11.svga'))
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname === '/dist.js')
      return route.fulfill({ body: script, contentType: 'text/javascript' })
    if (pathname === '/fixture.svga')
      return route.fulfill({ body: fixture, contentType: 'application/octet-stream' })
    if (pathname === '/probe.js')
      return route.fulfill({ body: options.probe, contentType: 'text/javascript' })
    return route.fulfill({
      body: '<!doctype html><html><body><script src="/dist.js"></script><script src="/probe.js"></script></body></html>',
      contentType: 'text/html',
      headers: { 'content-security-policy': options.policy },
    })
  })
  await page.goto(`${ORIGIN}/`)
  await page.waitForFunction(() => '__result' in window)
  const result = (await page.evaluate(
    () => (window as unknown as { __result: Record<string, unknown> }).__result,
  )) as Record<string, unknown>
  if (!options.expectConsoleErrors) expect(errors).toEqual([])
  return result
}

const workerProbe = `
(async () => {
  try {
    const parser = new SVGA.Parser()
    const video = await parser.load('/fixture.svga')
    parser.destroy()
    window.__result = { size: video.size }
  } catch (error) {
    window.__result = { error: String((error && error.message) || error) }
  }
})()
`

test('worker parsing runs with script-src self and worker-src blob', async ({ page }) => {
  const result = await runProbe(page, {
    policy: "default-src 'self'; script-src 'self'; worker-src blob:; connect-src 'self'",
    probe: workerProbe,
  })

  expect(result).toEqual({ size: { width: 96, height: 96 } })
})

test('direct parsing fails closed when unsafe-eval is absent', async ({ page }) => {
  const result = await runProbe(page, {
    policy: "default-src 'self'; script-src 'self'; worker-src blob:",
    probe: `
      try {
        new SVGA.Parser({ isDisableWebWorker: true })
        window.__result = { outcome: 'created' }
      } catch (error) {
        window.__result = { outcome: String((error && error.message) || error) }
      }
    `,
    expectConsoleErrors: true,
  })

  expect(result.outcome).not.toBe('created')
  expect(String(result.outcome)).toMatch(
    /unsafe-eval|Content Security Policy|EvalError|Refused|blocked by CSP|Function\(\)/i,
  )
})

test('direct parsing works when unsafe-eval is allowed', async ({ page }) => {
  const result = await runProbe(page, {
    policy: "default-src 'self'; script-src 'self' 'unsafe-eval'; worker-src blob:",
    probe: workerProbe.replace(
      'new SVGA.Parser()',
      'new SVGA.Parser({ isDisableWebWorker: true })',
    ),
  })

  expect(result).toEqual({ size: { width: 96, height: 96 } })
})
