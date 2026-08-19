import { expect, test as base } from '@playwright/test'

export { expect }

export const test = base.extend<{ browserDiagnostics: void }>({
  browserDiagnostics: [async ({ page }, use) => {
    const failures: string[] = []
    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') failures.push(`console: ${message.text()}`)
    })
    page.on('requestfailed', request => {
      failures.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText || 'unknown'})`)
    })

    await use()

    expect(failures, 'Browser page errors, console errors, or failed requests were captured').toEqual([])
  }, { auto: true }]
})
