import { expect, test as base } from '@playwright/test'

export { expect }

export const visualTestPort = Number(process.env.SVGA_VISUAL_PORT ?? 4174)
export const visualTestUrl = `http://127.0.0.1:${visualTestPort}/`

interface BrowserDiagnostics {
  expectRequestCancellation: (urlFragment: string) => void
  expectConsoleError: (pattern: RegExp) => void
  expectRequestFailure: (pattern: RegExp) => void
}

export const test = base.extend<{ browserDiagnostics: BrowserDiagnostics }>({
  browserDiagnostics: [
    async ({ page }, use) => {
      const failures: string[] = []
      const expectedCancellations: string[] = []
      const expectedConsoleErrors: RegExp[] = []
      const expectedRequestFailures: RegExp[] = []
      page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() !== 'error') return
        const source = message.location().url
        const expected =
          expectedConsoleErrors.some(
            (pattern) => pattern.test(message.text()) || pattern.test(source),
          ) || expectedCancellations.some((fragment) => source.includes(fragment))
        if (!expected) failures.push(`console: ${message.text()} @ ${source}`)
      })
      page.on('requestfailed', (request) => {
        const errorText = request.failure()?.errorText || 'unknown'
        const expected =
          expectedRequestFailures.some((pattern) => pattern.test(request.url())) ||
          (expectedCancellations.some((fragment) => request.url().includes(fragment)) &&
            /abort|cancel/i.test(errorText))
        if (!expected)
          failures.push(`requestfailed: ${request.method()} ${request.url()} (${errorText})`)
      })

      await use({
        expectRequestCancellation: (urlFragment) => expectedCancellations.push(urlFragment),
        expectConsoleError: (pattern) => expectedConsoleErrors.push(pattern),
        expectRequestFailure: (pattern) => expectedRequestFailures.push(pattern),
      })

      expect(
        failures,
        'Browser page errors, console errors, or failed requests were captured',
      ).toEqual([])
    },
    { auto: true },
  ],
})
