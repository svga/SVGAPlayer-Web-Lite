import { expect, test } from './browser-test'

const visualTestUrl = 'http://127.0.0.1:4173/'
const isolatedRuntime = process.env.SVGA_VISUAL_RUNTIME === 'baseline' ? 'baseline' : 'local'

async function forceAndTrackPlaybackTimeout (page: import('@playwright/test').Page, property: string) {
  await page.evaluate(name => {
    const browserWindow = window as typeof window & Record<string, any>
    const active = new Set<number>()
    const created: number[] = []
    const cleared: number[] = []
    const originalSetTimeout = window.setTimeout.bind(window)
    const originalClearTimeout = window.clearTimeout.bind(window)
    const originalIsFinite = Number.isFinite
    const isPlaybackTimeout = (callback: TimerHandler) => typeof callback === 'function' && callback.toString().includes('player.pause()')

    browserWindow[name] = {
      active,
      cleared,
      created,
      restore () {
        window.setTimeout = originalSetTimeout
        window.clearTimeout = originalClearTimeout
        Number.isFinite = originalIsFinite
      }
    }
    // The normal local UI intentionally uses Infinity, so make only its playback
    // sample branch observable without tracking unrelated page timers.
    Number.isFinite = value => value === Infinity || originalIsFinite(value)
    window.setTimeout = ((callback: TimerHandler, timeout?: number, ...args: any[]) => {
      const playbackTimeout = isPlaybackTimeout(callback)
      let id = 0
      const handler = typeof callback === 'function'
        ? (...callbackArgs: any[]) => {
            active.delete(id)
            callback(...callbackArgs)
          }
        : callback
      id = originalSetTimeout(handler, playbackTimeout && timeout === Infinity ? 10_000 : timeout, ...args) as unknown as number
      if (playbackTimeout) {
        active.add(id)
        created.push(id)
      }
      return id as unknown as number
    }) as typeof window.setTimeout
    window.clearTimeout = ((id?: number) => {
      if (id !== undefined && active.delete(id)) cleared.push(id)
      return originalClearTimeout(id)
    }) as typeof window.clearTimeout
  }, property)
}

async function playbackTimeoutStats (page: import('@playwright/test').Page, property: string) {
  return await page.evaluate(name => {
    const tracker = (window as typeof window & Record<string, any>)[name]
    return { active: tracker.active.size, cleared: tracker.cleared.length, created: tracker.created.length }
  }, property)
}

test('visual test page inventories every production fixture', async ({ page }) => {
  await page.goto(visualTestUrl)

  await expect(page).toHaveTitle('SVGA 动画检验台')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'data:,')
  await expect(page.getByTestId('fixture-item')).toHaveCount(17)
  await expect(page.locator('[data-fixture="soundwave.svga"]')).toContainText('soundwave.svga')
  await expect(page.locator('[data-fixture="show.svga"]')).toContainText('预期拒绝')
})

test('shows both runtime cards and only enables comparison when a baseline is available', async ({ page }) => {
  await page.goto(visualTestUrl)

  await expect(page.getByTestId('runtime-card-local')).toContainText('本地')
  await expect(page.getByTestId('runtime-card-baseline')).toContainText(/基线|不可用/)
  await expect(page.getByTestId('runtime-card-local')).toContainText(/原始/)
  await expect(page.getByTestId('runtime-card-local')).toContainText(/gzip/)
  await expect(page.getByTestId('runtime-card-local')).toContainText(/包完整性/)
  await expect(page.getByTestId('runtime-card-local')).toContainText(/脚本完整性/)
  await expect(page.getByTestId('runtime-card-local')).toContainText(/提交/)
  await expect(page.getByTestId('runtime-card-local')).toContainText(/工作区/)
  const baselineAvailable = await page.getByTestId('runtime-card-baseline').getAttribute('data-available')
  if (baselineAvailable === 'true') await expect(page.locator('#comparison-warnings')).toContainText('版本相同')
  if (baselineAvailable === 'true') await expect(page.getByTestId('compare-selected')).toBeEnabled()
  else await expect(page.getByTestId('compare-selected')).toBeDisabled()
  await expect(page.getByTestId('export-json')).toBeDisabled()
})

test('keeps local diagnostics available while a server reports no baseline runtime', async ({ page }) => {
  const module = await import('../../scripts/serve-visual-test.mjs') as unknown as {
    createVisualTestServer: (options: unknown) => Promise<{ server: import('node:http').Server }>
  }
  const { createVisualTestServer } = module
  const { server } = await createVisualTestServer({
    baseline: { baseline: '2.1.1' }, cacheDir: `/tmp/svga-visual-empty-${Date.now()}`,
    run: async () => { throw Error('offline') }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('测试服务器没有端口')
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`)
    await expect(page.getByTestId('runtime-card-baseline')).toHaveAttribute('data-available', 'false')
    await expect(page.getByTestId('compare-selected')).toBeDisabled()
    await expect(page.getByTestId('run-all')).toBeDisabled()
    await expect(page.getByTestId('run-selected')).toBeEnabled()
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('compares the selected fixture with shared input, finite metrics, and exportable JSON', async ({ page }) => {
  test.setTimeout(45_000)
  await page.goto(visualTestUrl)
  test.skip(await page.getByTestId('runtime-card-baseline').getAttribute('data-available') !== 'true', 'A baseline is required for comparison.')

  let fixtureRequests = 0
  page.on('request', request => {
    if (request.url().endsWith('/fixtures/soundwave.svga')) fixtureRequests++
  })
  await page.getByTestId('compare-selected').click()
  await expect(page.getByTestId('comparison-status')).toHaveAttribute('data-state', /match|limited|expected-rejection|metadata-change|visual-change/, { timeout: 30_000 })
  await expect(page.locator('#comparison-metrics')).toContainText('运行时加载')
  await expect(page.locator('#comparison-metrics')).toContainText('P99 帧间隔')
  await expect(page.locator('#comparison-metrics')).toContainText('页面 RAF 频率')
  await expect(page.locator('#comparison-metrics')).toContainText('长任务数')
  await expect(page.locator('.comparison-metric-row').first().locator('td').nth(0)).toContainText('中位')
  await expect(page.locator('.comparison-metric-row').first().locator('td').nth(1)).toContainText('MAD')
  await expect(page.locator('.comparison-metric-row').first().locator('td').nth(2)).toContainText(/↑ 改善|↓ 退化|≈ 波动带内/)
  await expect(page.locator('#comparison-warnings')).toContainText('单轮结果为方向性数据')
  await expect(page.getByTestId('player-canvas')).toBeVisible()
  await expect(page.locator('.canvas-bay iframe')).toHaveCount(0)
  const finite = await page.locator('.comparison-metric-row').evaluateAll(rows => rows.every(row => !row.textContent?.includes('NaN')))
  expect(finite).toBe(true)
  expect(fixtureRequests).toBe(1)
  await expect(page.getByTestId('export-json')).toBeEnabled()

  const download = page.waitForEvent('download')
  await page.getByTestId('export-json').click()
  const content = await (await download).createReadStream()
  let json = ''
  for await (const chunk of content!) json += chunk
  const report = JSON.parse(json)
  expect(report).toMatchObject({ schemaVersion: 1, config: { mode: 'selected', rounds: 1 }, fixtures: [expect.any(Object)] })
  expect(report.fixtures[0]).toMatchObject({ read: { readMs: expect.any(Number) }, orders: [expect.any(Array)], rounds: { baseline: [expect.any(Object)], local: [expect.any(Object)] } })
})

test('runs the stable three-round warm comparison in alternating order', async ({ page }) => {
  test.setTimeout(70_000)
  await page.goto(visualTestUrl)
  test.skip(await page.getByTestId('runtime-card-baseline').getAttribute('data-available') !== 'true', 'A baseline is required for comparison.')
  await page.locator('input[name="comparison-rounds"][value="3"]').check()
  await page.locator('#compare-warm').check()
  await page.getByTestId('compare-selected').click()
  await expect(page.getByTestId('comparison-status')).toHaveAttribute('data-state', /match|limited|expected-rejection|metadata-change|visual-change/, { timeout: 60_000 })
  const report = await page.evaluate(() => new Promise(resolve => {
    const original = URL.createObjectURL
    URL.createObjectURL = blob => { (window as any).capturedReport = blob; return original(blob) }
    document.querySelector('[data-testid="export-json"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    setTimeout(async () => resolve(JSON.parse(await (window as any).capturedReport.text())), 0)
  }))
  expect((report as any).fixtures[0].rounds.baseline).toHaveLength(3)
  expect((report as any).fixtures[0].rounds.local).toHaveLength(3)
  expect((report as any).fixtures[0].orders).toEqual([['baseline', 'local'], ['local', 'baseline'], ['baseline', 'local']])
  expect((report as any).fixtures[0].warmAggregates.baseline.startMs.samples).toBe(3)
  expect((report as any).fixtures[0].warmMetricComparisons.startMs).toBeTruthy()
  expect((report as any).fixtures[0].warmCorrectness).toMatchObject({ state: expect.any(String), performanceComparable: expect.any(Boolean) })
  expect((report as any).fixtures[0].warmPerformanceComparable).toBe((report as any).fixtures[0].correctness.state === 'match' && (report as any).fixtures[0].warmCorrectness.state === 'match')
  await expect(page.locator('#warm-comparison')).toBeVisible()
  await expect(page.locator('#warm-comparison-metrics')).toContainText('启动')
  await expect(page.locator('#warm-comparison-metrics .comparison-metric-row').first().locator('td').nth(0)).toContainText('MAD')
  await expect(page.locator('#warm-comparison-metrics .comparison-metric-row').first().locator('td').nth(2)).toContainText(/↑ 改善|↓ 退化|≈ 波动带内/)
  await expect(page.locator('#warm-comparison-note')).toContainText(/一致|能力|视觉|回归|失败/)
})

test('starting a full comparison cancels a local playback before creating isolated runners', async ({ page }) => {
  await page.goto(visualTestUrl)
  test.skip(await page.getByTestId('runtime-card-baseline').getAttribute('data-available') !== 'true', 'A baseline is required for comparison.')
  await page.getByTestId('run-selected').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'playing')
  await expect(page.getByTestId('run-all')).toBeEnabled()
  await page.getByTestId('run-all').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'cancelled')
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-state', 'running')
  await expect(page.getByTestId('pause')).toBeDisabled()
  await expect(page.locator('.canvas-bay iframe')).toHaveCount(1, { timeout: 10_000 })
  await page.getByTestId('cancel-all').click()
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-state', 'cancelled')
  await expect(page.locator('.canvas-bay iframe')).toHaveCount(0)
})

test('cancelling the first selected fetch does not publish an old or partial report', async ({ browserDiagnostics, page }) => {
  test.setTimeout(15_000)
  await page.goto(visualTestUrl)
  test.skip(await page.getByTestId('runtime-card-baseline').getAttribute('data-available') !== 'true', 'A baseline is required for comparison.')
  browserDiagnostics.expectRequestCancellation('/fixtures/soundwave.svga')
  let releaseFetch: (() => void) | undefined
  await page.route('**/fixtures/soundwave.svga', async route => {
    await new Promise<void>(resolve => { releaseFetch = resolve })
    await route.continue()
  })
  await page.getByTestId('compare-selected').click()
  await expect.poll(() => Boolean(releaseFetch)).toBe(true)
  await page.getByTestId('cancel-all').click()
  releaseFetch?.()
  await expect(page.getByTestId('comparison-status')).toHaveAttribute('data-state', 'cancelled')
  await expect(page.getByTestId('export-json')).toBeDisabled()
  await expect(page.locator('#comparison-metrics')).toBeEmpty()
})

test('switching fixtures cancels an old local run without overwriting the new idle state', async ({ browserDiagnostics, page }) => {
  test.setTimeout(15_000)
  browserDiagnostics.expectRequestCancellation('/fixtures/soundwave.svga')
  await page.goto(visualTestUrl)
  let releaseFetch: (() => void) | undefined
  await page.route('**/fixtures/soundwave.svga', async route => {
    await new Promise<void>(resolve => { releaseFetch = resolve })
    await route.continue()
  })
  await page.getByTestId('run-selected').click()
  await expect.poll(() => Boolean(releaseFetch)).toBe(true)
  await page.locator('[data-fixture="11.svga"]').click()
  releaseFetch?.()
  await expect(page.getByTestId('selected-name')).toHaveText('11.svga')
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'idle')
  await page.waitForTimeout(100)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'idle')
})

test('a late parser resolution cannot publish over the newly selected fixture', async ({ page }) => {
  await page.goto(visualTestUrl)
  await page.evaluate(() => {
    const browserWindow = window as any
    const Parser = browserWindow.SVGA.Parser
    browserWindow.SVGA.Parser = new Proxy(Parser, {
      construct (target, argumentsList, newTarget) {
        const parser = Reflect.construct(target, argumentsList, newTarget)
        const destroy = parser.destroy.bind(parser)
        parser.destroy = () => {
          browserWindow.deferredParserDestroyCount = (browserWindow.deferredParserDestroyCount || 0) + 1
          destroy()
        }
        parser.load = () => new Promise(resolve => { browserWindow.releaseDeferredParser = () => resolve({}) })
        return parser
      }
    })
  })
  await page.getByTestId('run-selected').click()
  await expect.poll(() => page.evaluate(() => typeof (window as any).releaseDeferredParser)).toBe('function')
  await page.locator('[data-fixture="11.svga"]').click()
  await page.evaluate(() => (window as any).releaseDeferredParser())
  await expect(page.getByTestId('selected-name')).toHaveText('11.svga')
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('#canvas-message')).toBeVisible()
  await expect(page.locator('#canvas-message')).toContainText('准备运行真实文件')
  expect(await page.evaluate(() => (window as any).deferredParserDestroyCount)).toBeGreaterThan(0)
})

test('a late mount resolution cannot hide the new fixture prompt', async ({ page }) => {
  test.setTimeout(15_000)
  await page.goto(visualTestUrl)
  await page.evaluate(() => {
    const browserWindow = window as any
    const Player = browserWindow.SVGA.Player
    browserWindow.SVGA.Player = new Proxy(Player, {
      construct (target, argumentsList, newTarget) {
        const player = Reflect.construct(target, argumentsList, newTarget)
        const destroy = player.destroy.bind(player)
        player.destroy = () => {
          browserWindow.deferredMountDestroyCount = (browserWindow.deferredMountDestroyCount || 0) + 1
          destroy()
        }
        player.mount = () => new Promise<void>(resolve => { browserWindow.releaseDeferredMount = () => resolve() })
        return player
      }
    })
  })
  await page.getByTestId('run-selected').click()
  await expect.poll(() => page.evaluate(() => typeof (window as any).releaseDeferredMount)).toBe('function')
  await page.locator('[data-fixture="11.svga"]').click()
  await page.evaluate(() => (window as any).releaseDeferredMount())
  await expect(page.getByTestId('selected-name')).toHaveText('11.svga')
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('#canvas-message')).toBeVisible()
  await expect(page.locator('#canvas-message')).toContainText('准备运行真实文件')
  expect(await page.evaluate(() => (window as any).deferredMountDestroyCount)).toBeGreaterThan(0)
})

test('switching fixtures during local playback releases every monitor', async ({ page }) => {
  await page.goto(visualTestUrl)
  await forceAndTrackPlaybackTimeout(page, 'visualLocalPlaybackTimeouts')
  await page.evaluate(() => {
    const browserWindow = window as any
    const intervals = new Set<number>()
    const frames = new Set<number>()
    const originalSetInterval = window.setInterval.bind(window)
    const originalClearInterval = window.clearInterval.bind(window)
    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    const originalCancelFrame = window.cancelAnimationFrame.bind(window)
    browserWindow.visualMonitorStats = { intervals, frames, observed: 0, disconnected: 0 }
    window.setInterval = ((callback: TimerHandler, timeout?: number, ...args: any[]) => {
      const id = originalSetInterval(callback, timeout, ...args) as unknown as number
      intervals.add(id)
      return id as unknown as number
    }) as typeof window.setInterval
    window.clearInterval = ((id?: number) => {
      intervals.delete(id || 0)
      return originalClearInterval(id)
    }) as typeof window.clearInterval
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      let id = 0
      id = originalRequestFrame(timestamp => {
        frames.delete(id)
        callback(timestamp)
      })
      frames.add(id)
      return id
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = ((id: number) => {
      frames.delete(id)
      return originalCancelFrame(id)
    }) as typeof window.cancelAnimationFrame
    const OriginalObserver = window.PerformanceObserver
    if (OriginalObserver) {
      class ObservedPerformanceObserver extends OriginalObserver {
        observe (options: PerformanceObserverInit) {
          browserWindow.visualMonitorStats.observed++
          return super.observe(options)
        }

        disconnect () {
          browserWindow.visualMonitorStats.disconnected++
          return super.disconnect()
        }
      }
      Object.defineProperty(ObservedPerformanceObserver, 'supportedEntryTypes', { value: OriginalObserver.supportedEntryTypes })
      browserWindow.PerformanceObserver = ObservedPerformanceObserver
    }
  })
  await page.getByTestId('run-selected').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'playing')
  await page.locator('[data-fixture="11.svga"]').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'idle')
  await expect.poll(() => page.evaluate(() => ({
    intervals: (window as any).visualMonitorStats.intervals.size,
    frames: (window as any).visualMonitorStats.frames.size,
    observed: (window as any).visualMonitorStats.observed,
    disconnected: (window as any).visualMonitorStats.disconnected
  }))).toMatchObject({ intervals: 0, frames: 0 })
  const observer = await page.evaluate(() => (window as any).visualMonitorStats)
  expect(observer.disconnected).toBe(observer.observed)
  expect(await playbackTimeoutStats(page, 'visualLocalPlaybackTimeouts')).toEqual({ active: 0, cleared: 1, created: 1 })
  await page.evaluate(() => (window as any).visualLocalPlaybackTimeouts.restore())
})

test('switching fixtures during replay releases every monitor', async ({ page }) => {
  test.setTimeout(20_000)
  await page.goto(visualTestUrl)
  await page.evaluate(() => {
    const browserWindow = window as any
    const intervals = new Set<number>()
    const frames = new Set<number>()
    const originalSetInterval = window.setInterval.bind(window)
    const originalClearInterval = window.clearInterval.bind(window)
    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    const originalCancelFrame = window.cancelAnimationFrame.bind(window)
    browserWindow.visualReplayMonitorStats = { intervals, frames }
    window.setInterval = ((callback: TimerHandler, timeout?: number, ...args: any[]) => {
      const id = originalSetInterval(callback, timeout, ...args) as unknown as number
      intervals.add(id)
      return id as unknown as number
    }) as typeof window.setInterval
    window.clearInterval = ((id?: number) => {
      intervals.delete(id || 0)
      return originalClearInterval(id)
    }) as typeof window.clearInterval
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      let id = 0
      id = originalRequestFrame(timestamp => {
        frames.delete(id)
        callback(timestamp)
      })
      frames.add(id)
      return id
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = ((id: number) => {
      frames.delete(id)
      return originalCancelFrame(id)
    }) as typeof window.cancelAnimationFrame
  })
  await page.getByTestId('run-selected').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'completed', { timeout: 15_000 })
  await forceAndTrackPlaybackTimeout(page, 'visualReplayPlaybackTimeouts')
  await page.getByTestId('replay').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'playing')
  await page.locator('[data-fixture="11.svga"]').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'idle')
  await expect.poll(() => page.evaluate(() => ({
    intervals: (window as any).visualReplayMonitorStats.intervals.size,
    frames: (window as any).visualReplayMonitorStats.frames.size
  }))).toEqual({ intervals: 0, frames: 0 })
  expect(await playbackTimeoutStats(page, 'visualReplayPlaybackTimeouts')).toEqual({ active: 0, cleared: 1, created: 1 })
  await page.evaluate(() => (window as any).visualReplayPlaybackTimeouts.restore())
})

test('changing fixtures clears the previous comparison report before a new run', async ({ page }) => {
  test.setTimeout(20_000)
  await page.goto(visualTestUrl)
  test.skip(await page.getByTestId('runtime-card-baseline').getAttribute('data-available') !== 'true', 'A baseline is required for comparison.')
  await page.getByTestId('compare-selected').click()
  await expect(page.getByTestId('export-json')).toBeEnabled({ timeout: 15_000 })
  await page.locator('[data-fixture="11.svga"]').click()
  await expect(page.getByTestId('export-json')).toBeDisabled()
  await expect(page.locator('#comparison-metrics')).toBeEmpty()
})

test('full cancellation retains only complete rows and exports the same fixture set', async ({ browserName, page }) => {
  test.skip(browserName !== 'chromium', 'The complete-pair cancellation assertion runs once; first-fetch cancellation covers every browser.')
  test.setTimeout(25_000)
  await page.goto(visualTestUrl)
  test.skip(await page.getByTestId('runtime-card-baseline').getAttribute('data-available') !== 'true', 'A baseline is required for comparison.')
  await page.getByTestId('run-all').click()
  await expect(page.getByTestId('batch-row')).toHaveCount(1, { timeout: 12_000 })
  await expect(page.getByTestId('batch-status')).toContainText('正在对比 2/17')
  await page.getByTestId('cancel-all').click()
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-state', 'cancelled')
  const rows = await page.getByTestId('batch-row').count()
  await expect(page.getByTestId('export-json')).toBeEnabled()
  const download = page.waitForEvent('download')
  await page.getByTestId('export-json').click()
  const stream = await (await download).createReadStream()
  let json = ''
  for await (const chunk of stream!) json += chunk
  const report = JSON.parse(json)
  expect(report.warnings).toContain('人工取消：已完成行已保留。')
  expect(report.fixtures).toHaveLength(rows)
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

test('runs one isolated local runtime and returns runtime-only startup metrics', async ({ page }) => {
  await page.goto(visualTestUrl)
  const result = await page.evaluate(async runtime => {
    const response = await fetch('/fixtures/soundwave.svga')
    const buffer = await response.arrayBuffer()
    const runner = (window as unknown as {
      SVGAVisual: {
        createIsolatedRunner: (runtime: 'local' | 'baseline', options: { onEvent: (event: { event: string, result?: unknown }) => void }) => {
          ready: Promise<unknown>
          run: (input: { buffer: ArrayBuffer, fixture: { name: string, bytes: number, expectation: string }, options: { maxPlaybackMs: number, includeWarm: boolean } }) => void
          dispose: () => void
        }
      }
    }).SVGAVisual.createIsolatedRunner(runtime as 'local' | 'baseline', {
      onEvent: event => {
        if (['result', 'error', 'cancelled'].includes(event.event)) {
          window.dispatchEvent(new CustomEvent('visual-runner-result', { detail: event }))
        }
      }
    })
    await runner.ready
    const done = new Promise(resolve => window.addEventListener('visual-runner-result', event => resolve((event as CustomEvent).detail), { once: true }))
    runner.run({
      buffer,
      fixture: { name: 'soundwave.svga', bytes: buffer.byteLength, expectation: 'playable' },
      options: { maxPlaybackMs: 100, includeWarm: true }
    })
    const outcome = await done
    runner.dispose()
    return (outcome as { result?: unknown }).result || outcome
  }, isolatedRuntime)

  expect(result).toMatchObject({
    status: 'sampled',
    startup: { runtimeLoadMs: expect.any(Number), runtimeReadyMs: expect.any(Number), playerReadyMs: expect.any(Number) },
    visual: { width: 400, height: 400, nonEmptyPixels: expect.any(Number), rgbaHash: expect.any(String) },
    warm: { status: 'sampled' }
  })
})

test('prefers the first process callback visual over an empty start visual and keeps the start fallback', async ({ page }) => {
  await page.goto(visualTestUrl)
  const outcome = await page.evaluate(async () => {
    const buffer = await (await fetch('/fixtures/soundwave.svga')).arrayBuffer()
    const fixture = { name: 'soundwave.svga', bytes: buffer.byteLength, expectation: 'playable' }
    const api = (window as any).SVGAVisual
    const run = async (processVisual: boolean) => {
      const runner = api.createIsolatedRunner('local', { onEvent: () => {} })
      await runner.ready
      const runnerWindow = runner.frame.contentWindow as any
      const video = {
        size: { width: 10, height: 10 }, fps: 20, frames: 2,
        images: {}, sprites: [{ frames: [{ shapes: [] }] }]
      }
      runnerWindow.SVGA.Parser = class {
        async load () { return video }
        destroy () {}
      }
      runnerWindow.SVGA.Player = class {
        currentFrame = 0
        constructor ({ container }: { container: HTMLCanvasElement }) { this.container = container }
        container: HTMLCanvasElement
        async mount () {}
        start () {
          if (!processVisual) return queueMicrotask(() => this.onEnd?.())
          queueMicrotask(() => {
            this.currentFrame = 1
            const context = this.container.getContext('2d')!
            this.onProcess?.()
            context.fillStyle = '#000'
            context.fillRect(0, 0, 10, 10)
            setTimeout(() => {
              context.clearRect(0, 0, 10, 10)
              this.currentFrame = 2
              this.onProcess?.()
              this.onEnd?.()
            }, 0)
          })
        }
        pause () {}
        destroy () {}
        onProcess?: () => void
        onEnd?: () => void
      }
      const event = await runner.run({ buffer, fixture, options: { maxPlaybackMs: 100, includeWarm: true } })
      runner.dispose()
      return event.result
    }
    return { process: await run(true), fallback: await run(false) }
  })

  expect(outcome.process).toMatchObject({
    visual: { frame: 1, width: 300, height: 150, nonEmptyPixels: 100 },
    warm: { visual: { frame: 1, width: 300, height: 150, nonEmptyPixels: 100 } }
  })
  expect(outcome.fallback).toMatchObject({
    visual: { frame: 0, width: 300, height: 150, nonEmptyPixels: 0 },
    warm: { visual: { frame: 0, width: 300, height: 150, nonEmptyPixels: 0 } }
  })
})

test('keeps a one-second cold and warm sample inside its full timeout budget', async ({ page }) => {
  test.setTimeout(10_000)
  await page.goto(visualTestUrl)
  const event = await page.evaluate(async runtime => {
    const buffer = await (await fetch('/fixtures/soundwave.svga')).arrayBuffer()
    const runner = (window as any).SVGAVisual.createIsolatedRunner(runtime, { onEvent: () => {} })
    await runner.ready
    const result = await runner.run({
      buffer,
      fixture: { name: 'soundwave.svga', bytes: buffer.byteLength, expectation: 'playable' },
      options: { maxPlaybackMs: 1_000, includeWarm: true }
    })
    runner.dispose()
    return result
  }, isolatedRuntime)

  expect(event).toMatchObject({ event: 'result', result: { status: 'sampled', warm: { status: 'sampled' } } })
})

test('copies one input buffer for sequential baseline and local runners', async ({ page }) => {
  await page.goto(visualTestUrl)
  const outcome = await page.evaluate(async () => {
    const buffer = await (await fetch('/fixtures/soundwave.svga')).arrayBuffer()
    const initialBytes = buffer.byteLength
    const api = (window as unknown as {
      SVGAVisual: {
        createIsolatedRunner: (runtime: 'local' | 'baseline', options: { onEvent: (event: { event: string, result?: unknown }) => void }) => {
          ready: Promise<unknown>
          run: (input: { buffer: ArrayBuffer, fixture: { name: string, bytes: number, expectation: string }, options: { maxPlaybackMs: number } }) => Promise<{ event: string, result?: unknown }>
          dispose: () => void
        }
      }
    }).SVGAVisual
    const run = async (runtime: 'local' | 'baseline') => {
      const runner = api.createIsolatedRunner(runtime, { onEvent: () => {} })
      await runner.ready
      const event = await runner.run({
        buffer,
        fixture: { name: 'soundwave.svga', bytes: initialBytes, expectation: 'playable' },
        options: { maxPlaybackMs: 60 }
      })
      runner.dispose()
      return { bytes: buffer.byteLength, event }
    }
    return { initialBytes, baseline: await run('baseline'), local: await run('local'), finalBytes: buffer.byteLength }
  })

  expect(outcome.baseline.bytes).toBe(outcome.initialBytes)
  expect(outcome.local.bytes).toBe(outcome.initialBytes)
  expect(outcome.finalBytes).toBe(outcome.initialBytes)
  expect(outcome.baseline.event.event).toBe('result')
  expect(outcome.local.event.event).toBe('result')
})

test('settles isolated start failures and paint-time cancellation without leaving an iframe', async ({ page }) => {
  await page.goto(visualTestUrl)
  const outcome = await page.evaluate(async () => {
    const buffer = await (await fetch('/fixtures/soundwave.svga')).arrayBuffer()
    const fixture = { name: 'soundwave.svga', bytes: buffer.byteLength, expectation: 'playable' }
    const api = (window as any).SVGAVisual

    const failing = api.createIsolatedRunner('local', { onEvent: () => {} })
    await failing.ready
    const OriginalPlayer = failing.frame.contentWindow.SVGA.Player
    failing.frame.contentWindow.SVGA.Player = class extends OriginalPlayer {
      start () { throw Error('intentional start failure') }
    }
    const startFailure = await failing.run({ buffer, fixture, options: { maxPlaybackMs: 100 } })
    failing.dispose()

    let reachStart: (() => void) | undefined
    const started = new Promise<void>(resolve => { reachStart = resolve })
    const blockedPaint = api.createIsolatedRunner('local', {
      onEvent: (event: { event: string, stage?: string }) => {
        if (event.event === 'stage' && event.stage === 'start') reachStart?.()
      }
    })
    await blockedPaint.ready
    blockedPaint.frame.contentWindow.requestAnimationFrame = () => 1
    blockedPaint.run({ buffer, fixture, options: { maxPlaybackMs: 10_000, timeoutMs: 10_000 } })
    await started
    const cancelled = await blockedPaint.cancel()
    return { startFailure, cancelled, connected: blockedPaint.frame.isConnected }
  })

  expect(outcome.startFailure).toMatchObject({ event: 'error', error: { stage: 'start' } })
  expect((outcome.startFailure as { error: { message: string } }).error.message).toContain('intentional start failure')
  expect(outcome.cancelled).toMatchObject({ event: 'cancelled', stage: 'start' })
  expect(outcome.connected).toBe(false)
})

test('reports asynchronous runner errors with the stage where they occurred', async ({ page }) => {
  await page.goto(visualTestUrl)
  const outcome = await page.evaluate(async () => {
    const buffer = await (await fetch('/fixtures/soundwave.svga')).arrayBuffer()
    const fixture = { name: 'soundwave.svga', bytes: buffer.byteLength, expectation: 'playable' }
    let runner: any
    runner = (window as any).SVGAVisual.createIsolatedRunner('local', {
      onEvent: (event: { event: string, stage?: string }) => {
        if (event.event === 'stage' && event.stage === 'start') {
          dispatched = runner.frame.contentWindow.dispatchEvent(new ErrorEvent('error', { cancelable: true, error: Error('late start error') }))
        }
      }
    })
    let dispatched = true
    await runner.ready
    const terminal = await runner.run({ buffer, fixture, options: { maxPlaybackMs: 1_000 } })
    runner.dispose()
    return { terminal, dispatched }
  })
  expect(outcome.terminal).toMatchObject({ event: 'error', error: { stage: 'start', message: expect.stringContaining('late start error') } })
  expect(outcome.dispatched).toBe(false)
})

test('cancels a pending isolated parser exactly once and releases its realm', async ({ page }) => {
  await page.goto(visualTestUrl)
  const outcome = await page.evaluate(async runtime => {
    const buffer = await (await fetch('/fixtures/soundwave.svga')).arrayBuffer()
    const events: Array<{ event: string, stage?: string }> = []
    const runner = (window as any).SVGAVisual.createIsolatedRunner(runtime, {
      onEvent: (event: { event: string, stage?: string }) => events.push(event)
    })
    await runner.ready
    runner.run({
      buffer,
      fixture: { name: 'soundwave.svga', bytes: buffer.byteLength, expectation: 'playable' },
      options: { maxPlaybackMs: 10_000, timeoutMs: 10_000 }
    })
    const cancellation = await runner.cancel()
    return { cancellation, events, connected: runner.frame.isConnected }
  }, isolatedRuntime)

  expect(outcome.cancellation).toMatchObject({ event: 'cancelled', stage: 'parse' })
  expect(outcome.events.filter(event => event.event === 'cancelled')).toHaveLength(1)
  expect(outcome.connected).toBe(false)
})

test('disposes a cancelled runner even when its event callback throws', async ({ page }) => {
  await page.goto(visualTestUrl)
  const outcome = await page.evaluate(async () => {
    const buffer = await (await fetch('/fixtures/soundwave.svga')).arrayBuffer()
    const runner = (window as any).SVGAVisual.createIsolatedRunner('local', {
      onEvent: (event: { event: string }) => {
        if (event.event === 'cancelled') throw Error('observer failure')
      }
    })
    await runner.ready
    runner.run({
      buffer,
      fixture: { name: 'soundwave.svga', bytes: buffer.byteLength, expectation: 'playable' },
      options: { maxPlaybackMs: 10_000 }
    })
    const cancellation = await runner.cancel()
    return { cancellation, connected: runner.frame.isConnected }
  })

  expect(outcome.cancellation).toMatchObject({ event: 'cancelled', stage: 'parse' })
  expect(outcome.connected).toBe(false)
})

test('rejects a runner readiness promise when disposed before startup', async ({ browserDiagnostics, page }) => {
  browserDiagnostics.expectRequestCancellation('/runner.html')
  await page.goto(visualTestUrl)
  const message = await page.evaluate(async () => {
    const runner = (window as any).SVGAVisual.createIsolatedRunner('local', { onEvent: () => {} })
    const ready = runner.ready.then(
      () => 'unexpected-ready',
      (error: Error) => error.message
    )
    runner.dispose()
    return await ready
  })

  expect(message).toContain('就绪前被释放')
})

test('cancels an in-progress full fixture sweep and releases the controls', async ({ browserDiagnostics, page }) => {
  browserDiagnostics.expectRequestCancellation('/fixtures/')
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
  expect(pageResponse.headers()['content-security-policy']).not.toContain("'unsafe-eval'")

  const localRunnerResponse = await request.get(`${visualTestUrl}runner.html?runtime=local&runId=test`)
  expect(localRunnerResponse.status()).toBe(200)
  expect(localRunnerResponse.headers()['content-security-policy']).not.toContain("'unsafe-eval'")

  const baselineRunnerResponse = await request.get(`${visualTestUrl}runner.html?runtime=baseline&runId=test`)
  expect(baselineRunnerResponse.status()).toBe(200)
  const runtimeResponse = await request.get(`${visualTestUrl}api/runtimes`)
  const runtimes = await runtimeResponse.json() as { baseline: { version: string, source: string } | null }
  const baselineAllowsLegacyEval = runtimes.baseline?.version === '2.1.1' && runtimes.baseline.source === 'npm'
  if (baselineAllowsLegacyEval) {
    expect(baselineRunnerResponse.headers()['content-security-policy']).toContain("script-src 'self' 'unsafe-eval'")
  } else {
    expect(baselineRunnerResponse.headers()['content-security-policy']).not.toContain("'unsafe-eval'")
  }

  const traversal = await request.get(`${visualTestUrl}fixtures/%2e%2e%2fpackage.json`)
  expect(traversal.status()).toBe(404)
})

test('completes the full real-fixture sweep in Chromium', async ({ browserName, page }) => {
  test.skip(browserName !== 'chromium', 'The complete sweep runs once; representative flows run in every browser.')
  test.setTimeout(90_000)
  await page.goto(visualTestUrl)

  await page.getByTestId('run-all').click()
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-state', 'completed', { timeout: 80_000 })
  await expect(page.getByTestId('batch-status')).toContainText('17 个素材')
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-success', '16')
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-expected', '1')
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-failed', '0')
  await expect(page.getByTestId('batch-status')).toHaveAttribute('data-review', '0')
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
  await expect(page.getByTestId('comparison-status')).toContainText(/等待比较|基线不可用/)
  if (await page.getByTestId('runtime-card-baseline').getAttribute('data-available') === 'true') {
    await page.getByTestId('compare-selected').click()
    await expect(page.getByTestId('comparison-status')).toHaveAttribute('data-state', /match|limited|expected-rejection|metadata-change|visual-change/, { timeout: 30_000 })
    const comparisonLayout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      headers: Array.from(document.querySelectorAll('.comparison-metrics thead')).map(header => getComputedStyle(header).display),
      status: document.querySelector('[data-testid="comparison-status"]')?.textContent
    }))
    expect(comparisonLayout.scrollWidth).toBeLessThanOrEqual(comparisonLayout.viewportWidth)
    expect(comparisonLayout.headers.every(display => display !== 'none')).toBe(true)
    expect(comparisonLayout.status).not.toBe('')
  }
})
