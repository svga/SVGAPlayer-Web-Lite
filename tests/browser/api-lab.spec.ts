import { readFile } from 'node:fs/promises'

import { API_CASES } from '../visual/api-cases.js'
import { expect, test, visualTestUrl } from './browser-test'

const apiLabUrl = new URL('/api-lab.html', visualTestUrl).href

async function setGroups(page: import('@playwright/test').Page, ids: string[]) {
  const inputs = page.locator('#api-group-list input[type="checkbox"]')
  const count = await inputs.count()
  for (let index = 0; index < count; index++) {
    const input = inputs.nth(index)
    const checked = await input.isChecked()
    const shouldCheck = ids.includes((await input.getAttribute('value')) || '')
    if (checked !== shouldCheck) await input.setChecked(shouldCheck)
  }
}

async function runSuite(page: import('@playwright/test').Page, rounds = '1') {
  await page.getByTestId('api-rounds').selectOption(rounds)
  await page.getByTestId('api-run').click()
}

async function waitForCompletion(page: import('@playwright/test').Page, timeout = 300_000) {
  await expect(page.getByTestId('api-status')).toHaveAttribute(
    'data-state',
    /completed|cancelled|failed/,
    { timeout },
  )
}

test('inventories fixtures and exposes the API lab from the visual page', async ({
  page,
  browserDiagnostics,
  browserName,
}) => {
  if (browserName === 'webkit')
    browserDiagnostics.expectConsoleError(/Refused to apply a stylesheet because its hash/)
  await page.goto(visualTestUrl)
  await expect(page.getByRole('link', { name: /API 实验室/ })).toHaveAttribute(
    'href',
    '/api-lab.html',
  )
  await page.getByRole('link', { name: /API 实验室/ }).click()

  await expect(page).toHaveTitle('SVGA API 实验室')
  await expect(page.getByTestId('api-runtime-card-local')).toContainText('2.2.0')
  await expect(page.getByTestId('api-csp-warning')).toContainText('unsafe-eval')
  await expect(page.getByTestId('api-fixture-select').locator('option')).toHaveCount(17)
  await expect(page.getByTestId('api-fixture-select')).toHaveValue('soundwave.svga')
  await expect(page.getByTestId('api-run')).toBeEnabled()
  await expect(page.locator('#api-plan-size')).toContainText(String(API_CASES.length))
})

test('keeps the API lab inside the mobile viewport', async ({
  page,
  browserDiagnostics,
  browserName,
}) => {
  if (browserName === 'webkit')
    browserDiagnostics.expectConsoleError(/Refused to apply a stylesheet because its hash/)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(apiLabUrl)
  await expect(page.getByTestId('api-run')).toBeEnabled()

  const noHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  expect(noHorizontalScroll).toBe(true)
  await expect(page.getByTestId('api-runtime-card-local')).toBeVisible()
})

test('allows evaluation only for the isolated API runner page', async ({ request }) => {
  const lab = await request.get(apiLabUrl)
  expect(lab.headers()['content-security-policy']).not.toContain("'unsafe-eval'")

  const apiRunner = await request.get(
    `${apiLabUrl.replace('api-lab.html', 'api-runner.html')}?runtime=local&runId=test`,
  )
  expect(apiRunner.headers()['content-security-policy']).toContain("'unsafe-eval'")

  const performanceRunner = await request.get(
    new URL('/runner.html?runtime=local', visualTestUrl).href,
  )
  expect(performanceRunner.headers()['content-security-policy']).not.toContain("'unsafe-eval'")
})

test('runs every shared API case against the local and baseline runtimes', async ({
  page,
  browserDiagnostics,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The complete API suite runs in Chromium only.')
  test.setTimeout(360_000)
  browserDiagnostics.expectRequestCancellation('/api/lab/delay')
  browserDiagnostics.expectConsoleError(/\/api\/lab\/echo/)
  browserDiagnostics.expectConsoleError(/\/api\/lab\/status/)
  browserDiagnostics.expectRequestFailure(/\/api\/lab\/echo/)
  browserDiagnostics.expectRequestFailure(/\/api\/lab\/status/)
  browserDiagnostics.expectRequestCancellation('/fixtures/')

  await page.goto(apiLabUrl)
  await expect(page.getByTestId('api-runtime-card-local')).toContainText('2.2.0')
  const baselineAvailable =
    (await page.getByTestId('api-runtime-card-baseline').getAttribute('data-available')) === 'true'

  await runSuite(page)
  await waitForCompletion(page)

  await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'completed')
  await expect(page.getByTestId('api-case-row')).toHaveCount(API_CASES.length)
  for (const row of await page.getByTestId('api-case-row').all()) {
    const outcome = await row.getAttribute('data-outcome')
    expect([
      'pass',
      'within-band',
      'improvement',
      'observation',
      'local-only',
      'skipped',
    ]).toContain(outcome)
  }
  await expect(page.locator('[data-testid="api-case-row"][data-outcome="failed"]')).toHaveCount(0)
  await expect(
    page.locator('[data-testid="api-case-row"][data-outcome="parity-mismatch"]'),
  ).toHaveCount(0)
  await expect(
    page.locator('[data-testid="api-case-row"][data-support="local-only"]').first(),
  ).toBeVisible()
  await expect(
    page.locator(
      '[data-testid="api-case-row"][data-case-id="parser.direct"] td[data-label="2.2.0"]',
    ),
  ).toHaveText('通过')
  await expect(page.getByTestId('api-verdict')).toHaveAttribute('data-verdict', 'pass')
  await expect(page.getByTestId('api-export')).toBeEnabled()
  if (baselineAvailable) {
    await expect(page.getByTestId('api-case-row').first()).toHaveAttribute(
      'data-baseline-status',
      'passed',
    )
  }
})

test('runs the local suite and keeps the export usable without a baseline', async ({
  page,
  browserDiagnostics,
  browserName,
}) => {
  if (browserName === 'webkit')
    browserDiagnostics.expectConsoleError(/Refused to apply a stylesheet because its hash/)
  const module = (await import('../../scripts/serve-visual-test.mjs')) as unknown as {
    createVisualTestServer: (options: unknown) => Promise<{ server: import('node:http').Server }>
  }
  const { createVisualTestServer } = module
  const { server } = await createVisualTestServer({
    baseline: { baseline: '2.1.1' },
    cacheDir: `/tmp/svga-api-lab-empty-${Date.now()}`,
    run: async () => {
      throw Error('offline')
    },
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('测试服务器没有端口')
  try {
    await page.goto(`http://127.0.0.1:${address.port}/api-lab.html`)
    await expect(page.getByTestId('api-runtime-card-baseline')).toHaveAttribute(
      'data-available',
      'false',
    )
    await setGroups(page, ['boot'])
    await runSuite(page)
    await waitForCompletion(page, 60_000)

    await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'completed')
    await expect(page.getByTestId('api-case-row').first()).toHaveAttribute(
      'data-baseline-status',
      'unavailable',
    )
    await expect(page.getByTestId('api-case-row').first()).toContainText('不可用')
    await expect(page.getByTestId('api-verdict')).toHaveAttribute('data-verdict', 'local-only')
    await expect(page.getByTestId('api-export')).toBeEnabled()
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('exports a complete JSON report for the selected scope', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Download capture runs in Chromium only.')
  test.setTimeout(60_000)
  await page.goto(apiLabUrl)
  await setGroups(page, ['boot'])
  await runSuite(page)
  await waitForCompletion(page, 60_000)

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('api-export').click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw Error('下载没有落盘路径')
  const report = JSON.parse(await readFile(path, 'utf8'))
  expect(report.schemaVersion).toBe(1)
  expect(report.kind).toBe('api-lab')
  expect(report.runtimes.local.version).toBe('2.2.0')
  expect(report.config.scope).toBe('selected')
  expect(report.config.warmup).toBe(false)
  expect(report.cases).toHaveLength(3)
  expect(report.summary.total).toBe(3)
  expect(report.cases.map((entry: { id: string }) => entry.id)).toEqual(
    expect.arrayContaining(['boot.exports', 'boot.constructors', 'boot.smoke']),
  )
  expect(report.environment.worker).toBe(true)
})

test('filters API rows by group, support, status and search', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The filter sweep runs in Chromium only.')
  test.setTimeout(120_000)
  await page.goto(apiLabUrl)
  await setGroups(page, ['db'])
  await runSuite(page)
  await waitForCompletion(page, 120_000)

  const rows = page.getByTestId('api-case-row')
  await expect(rows).toHaveCount(10)
  await expect(page.getByTestId('api-filter-count')).toHaveText('10 / 10')

  await page.getByTestId('api-filter-group').selectOption('parser')
  await expect(page.getByTestId('api-filter-count')).toHaveText('0 / 10')

  await page.getByTestId('api-filter-group').selectOption('all')
  await page.getByTestId('api-filter-support').selectOption('local-only')
  const localOnly = page.locator('[data-testid="api-case-row"]:not([hidden])')
  await expect(localOnly.first()).toHaveAttribute('data-support', 'local-only')
  const localOnlyCount = await localOnly.count()
  expect(localOnlyCount).toBeGreaterThan(0)

  await page.getByTestId('api-filter-support').selectOption('all')
  await page.getByTestId('api-search').fill('corrupt')
  await expect(page.getByTestId('api-filter-count')).toHaveText('1 / 10')
  await expect(page.locator('[data-testid="api-case-row"]:not([hidden])')).toHaveCount(1)
})

test('cancels an in-flight suite and keeps completed rows', async ({
  page,
  browserDiagnostics,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The cancellation sweep runs in Chromium only.')
  test.setTimeout(120_000)
  browserDiagnostics.expectRequestFailure(/\/api\/lab\/echo/)
  browserDiagnostics.expectRequestCancellation('/fixtures/')
  await page.goto(apiLabUrl)
  await setGroups(page, ['parser'])
  await runSuite(page)
  await expect(page.getByTestId('api-case-row').first()).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('api-cancel').click()
  await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'cancelled', {
    timeout: 30_000,
  })
  await expect(page.locator('#api-stage iframe')).toHaveCount(0)
  expect(await page.getByTestId('api-case-row').count()).toBeGreaterThan(0)
})

test('sweeps every playable fixture for the fixture-scoped cases', async ({
  page,
  browserDiagnostics,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The fixture sweep runs in Chromium only.')
  test.setTimeout(240_000)
  browserDiagnostics.expectRequestCancellation('/api/lab/delay')
  browserDiagnostics.expectConsoleError(/\/api\/lab\/echo/)
  browserDiagnostics.expectConsoleError(/\/api\/lab\/status/)
  browserDiagnostics.expectRequestFailure(/\/api\/lab\/echo/)
  browserDiagnostics.expectRequestFailure(/\/api\/lab\/status/)
  browserDiagnostics.expectRequestCancellation('/fixtures/')

  await page.goto(apiLabUrl)
  await setGroups(page, ['parser'])
  await page.locator('input[name="api-scope"][value="all"]').check()
  await expect(page.locator('#api-plan-size')).toContainText('16')
  await runSuite(page)
  await waitForCompletion(page, 240_000)

  await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'completed')
  await expect(page.getByTestId('api-case-row')).toHaveCount(16)
  await expect(page.getByTestId('api-case-row').filter({ hasText: 'show.svga' })).toHaveCount(0)
  await expect(page.locator('[data-testid="api-case-row"][data-outcome="failed"]')).toHaveCount(0)
  const fixtures = await page
    .getByTestId('api-case-row')
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelector('.api-case-fixture')?.textContent).filter(Boolean),
    )
  expect(new Set(fixtures).size).toBe(16)
})
