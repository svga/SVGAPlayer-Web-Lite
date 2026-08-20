import { expect, test } from './browser-test'

const visualTestUrl = 'http://127.0.0.1:4173/'

test('visual test page inventories every production fixture', async ({ page }) => {
  await page.goto(visualTestUrl)

  await expect(page).toHaveTitle('SVGA 动画检验台')
  await expect(page.getByTestId('fixture-item')).toHaveCount(17)
  await expect(page.locator('[data-fixture="soundwave.svga"]')).toContainText('soundwave.svga')
  await expect(page.locator('[data-fixture="show.svga"]')).toContainText('预期拒绝')
})

test('runs a real SVGA file and reports finite startup and playback metrics', async ({ page }) => {
  await page.goto(visualTestUrl)
  await expect(page.locator('[data-fixture="soundwave.svga"]')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('run-selected').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'playing')
  const readCanvas = () => page.getByTestId('player-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
    return {
      height: canvas.height,
      nonEmptyPixels: pixels
        ? Array.from(pixels).filter((_, index) => index % 4 === 3 && pixels[index] > 0).length
        : 0,
      width: canvas.width
    }
  })
  await expect.poll(async () => (await readCanvas()).nonEmptyPixels).toBeGreaterThan(0)
  const canvasEvidence = await readCanvas()
  expect(canvasEvidence).toMatchObject({ width: 400, height: 400 })
  expect(canvasEvidence.nonEmptyPixels).toBeGreaterThan(0)
  await expect(page.getByTestId('frame-tick')).not.toHaveCount(0, { timeout: 1000 })

  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'completed', { timeout: 15_000 })

  await expect(page.locator('[data-metric="profile.frames"]')).toHaveAttribute('data-value', '35')
  await expect(page.locator('[data-metric="playback.targetFps"]')).toHaveAttribute('data-value', '20')
  await expect(page.locator('[data-metric="startup.parseMs"]')).toHaveAttribute('data-value', /\d/)
  await expect(page.locator('[data-metric="playback.actualFps"]')).toHaveAttribute('data-value', /\d/)
  await expect(page.locator('[data-metric="runtime.heapMountBytes"]')).toHaveAttribute('data-value', /\d|unsupported/)
  const finiteMetrics = await page.locator('[data-numeric-metric="true"]').evaluateAll(elements => {
    return elements.every(element => {
      const value = Number((element as HTMLElement).dataset.value)
      const signed = (element as HTMLElement).dataset.metric === 'runtime.heapDeltaBytes'
      return Number.isFinite(value) && (signed || value >= 0)
    })
  })
  expect(finiteMetrics).toBe(true)
})

test('pauses, resumes and replays the mounted real animation', async ({ page }) => {
  await page.goto(visualTestUrl)
  await page.getByTestId('run-selected').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'playing')

  await page.getByTestId('pause').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'paused')
  const pausedFrame = await page.getByTestId('player-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  await page.waitForTimeout(150)
  await expect.poll(() => page.getByTestId('player-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(pausedFrame)

  await page.getByTestId('resume').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'completed', { timeout: 15_000 })
  await expect(page.getByTestId('replay')).toBeEnabled()
  await page.getByTestId('replay').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'playing')
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'completed', { timeout: 15_000 })
  await expect(page.locator('#measurement-mode')).toContainText('热播放')

  await page.locator('[data-fixture="show.svga"]').click()
  await expect(page.getByTestId('replay')).toBeDisabled()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('[data-metric="profile.frames"]')).toHaveAttribute('data-value', 'unsupported')
})

test('passes the selected cache and timer options to the real Player', async ({ page }) => {
  await page.goto(visualTestUrl)
  await page.evaluate(() => {
    const browserWindow = window as unknown as {
      SVGA: { Player: new (options: unknown) => unknown }
      capturedPlayerOptions: unknown[]
    }
    const Player = browserWindow.SVGA.Player
    browserWindow.capturedPlayerOptions = []
    browserWindow.SVGA.Player = new Proxy(Player, {
      construct (target, argumentsList, newTarget) {
        browserWindow.capturedPlayerOptions.push(argumentsList[0])
        return Reflect.construct(target, argumentsList, newTarget)
      }
    })
  })
  await page.locator('#cache-frames').check()
  await page.locator('#timer-worker').check()
  await page.getByTestId('run-selected').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'playing')
  await page.getByTestId('stop').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'stopped')

  const options = await page.evaluate(() => {
    const captured = (window as unknown as { capturedPlayerOptions: Array<Record<string, unknown>> }).capturedPlayerOptions
    return captured[captured.length - 1]
  })
  expect(options).toMatchObject({
    isCacheFrames: true,
    isOpenNoExecutionDelay: true,
    loop: false
  })
})

test('reports the SVGA 1.x fixture as an expected parsing rejection', async ({ page }) => {
  await page.goto(visualTestUrl)
  await page.locator('[data-fixture="show.svga"]').click()
  await page.getByTestId('run-selected').click()

  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'expected-rejection')
  await expect(page.locator('#canvas-message')).toContainText('SVGA 1.x 已按预期拒绝')
  await expect(page.locator('#warnings')).toContainText('解析阶段')
})

test('cancels an in-progress full fixture sweep and releases the controls', async ({ page }) => {
  await page.goto(visualTestUrl)
  await page.getByTestId('run-all').click()
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-state', 'running')
  await expect(page.getByTestId('cancel-all')).toBeEnabled()
  await expect(page.getByTestId('run-selected')).toBeDisabled()
  await expect(page.getByTestId('fixture-item').first()).toBeDisabled()

  await page.getByTestId('cancel-all').click()
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-state', 'cancelled')
  await expect(page.getByTestId('cancel-all')).toBeDisabled()
  await expect(page.getByTestId('run-all')).toBeEnabled()
})

test('serves an isolated no-cache page and rejects fixture path traversal', async ({ request }) => {
  const pageResponse = await request.get(visualTestUrl)
  expect(pageResponse.status()).toBe(200)
  expect(pageResponse.headers()['cache-control']).toBe('no-store')
  expect(pageResponse.headers()['cross-origin-opener-policy']).toBe('same-origin')
  expect(pageResponse.headers()['cross-origin-embedder-policy']).toBe('require-corp')

  const traversal = await request.get(`${visualTestUrl}fixtures/%2e%2e%2fpackage.json`)
  expect(traversal.status()).toBe(404)
})

test('completes the full real-fixture sweep in Chromium', async ({ browserName, page }) => {
  test.skip(browserName !== 'chromium', 'The complete sweep runs once; representative flows run in every browser.')
  test.setTimeout(90_000)
  await page.goto(visualTestUrl)

  await page.getByTestId('run-all').click()
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-state', 'completed', { timeout: 80_000 })
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-success', '16')
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-expected', '1')
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-failed', '0')
  await expect(page.getByTestId('batch-row')).toHaveCount(17)
  await expect(page.locator('[data-testid="batch-row"][data-fixture="show.svga"]')).toHaveAttribute('data-result', 'expected-rejection')
})

test('keeps the animation stage first and avoids horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(visualTestUrl)

  const layout = await page.evaluate(() => {
    const stage = document.querySelector('.stage-panel')?.getBoundingClientRect()
    const fixtures = document.querySelector('.fixture-panel')?.getBoundingClientRect()
    const summary = document.querySelector('.summary-panel')?.getBoundingClientRect()
    return {
      stageY: stage?.y ?? -1,
      fixturesY: fixtures?.y ?? -1,
      summaryY: summary?.y ?? -1,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }
  })
  expect(layout.stageY).toBeLessThan(layout.fixturesY)
  expect(layout.fixturesY).toBeLessThan(layout.summaryY)
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('#environment-badge')).toContainText('CPU')
  await expect(page.locator('#environment-badge')).toContainText('ImageBitmap')
})
