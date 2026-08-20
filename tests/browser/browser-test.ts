import { expect, test as base } from '@playwright/test'

export { expect }

interface BrowserDiagnostics {
  expectRequestCancellation: (urlFragment: string) => void
}

export const test = base.extend<{ browserDiagnostics: BrowserDiagnostics }>({
  browserDiagnostics: [async ({ page }, use) => {
    const failures: string[] = []
    const expectedCancellations: string[] = []
    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') failures.push(`console: ${message.text()}`)
    })
    page.on('requestfailed', request => {
      const errorText = request.failure()?.errorText || 'unknown'
      const expected = expectedCancellations.some(fragment => request.url().includes(fragment)) &&
        /abort|cancel/i.test(errorText)
      if (!expected) failures.push(`requestfailed: ${request.method()} ${request.url()} (${errorText})`)
    })

    await use({
      expectRequestCancellation: urlFragment => expectedCancellations.push(urlFragment)
    })

    expect(failures, 'Browser page errors, console errors, or failed requests were captured').toEqual([])
  }, { auto: true }]
})
