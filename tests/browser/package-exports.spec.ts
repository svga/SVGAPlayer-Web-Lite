import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from './browser-test'

const expectedExports = ['DB', 'Parser', 'Player']

test('browser bundles expose the public package exports', async ({ page }) => {
  const umdPath = resolve('dist/index.min.js')
  await page.goto('about:blank')
  await page.addScriptTag({ path: umdPath })

  const umdExports = await page.evaluate(() => {
    const browserWindow = window as unknown as Window & { SVGA: Record<string, unknown> }
    return Object.keys(browserWindow.SVGA).sort()
  })
  expect(umdExports).toEqual(expectedExports)

  const esmCode = await readFile(resolve('dist/index.mjs'), 'utf8')
  const esmUrl = `data:text/javascript;base64,${Buffer.from(esmCode).toString('base64')}`
  const esmExports = await page.evaluate(async url => Object.keys(await import(url)).sort(), esmUrl)
  expect(esmExports).toEqual(expectedExports)
})

test('built UMD direct Parser instances keep local state without public worker globals', async ({ page }) => {
  const [firstFile, secondFile] = await Promise.all([
    readFile(resolve('__test__/svga/11.svga')),
    readFile(resolve('__test__/svga/soundwave.svga'))
  ])
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async ({ firstData, secondData }) => {
    interface BrowserParser {
      load: (url: string) => Promise<{ size: { width: number, height: number } }>
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: { Parser: new (options: { isDisableWebWorker: boolean }) => BrowserParser }
    }
    const first = new browserWindow.SVGA.Parser({ isDisableWebWorker: true })
    const second = new browserWindow.SVGA.Parser({ isDisableWebWorker: true })
    const [firstVideo, secondVideo] = await Promise.all([
      first.load(`data:application/octet-stream;base64,${firstData}`),
      second.load(`data:application/octet-stream;base64,${secondData}`)
    ])
    first.destroy()
    second.destroy()
    return {
      firstSize: firstVideo.size,
      secondSize: secondVideo.size,
      firstHasWorker: Object.prototype.hasOwnProperty.call(first, 'worker'),
      hasLegacyGlobal: Object.prototype.hasOwnProperty.call(window, 'SVGAParserMockWorker')
    }
  }, { firstData: firstFile.toString('base64'), secondData: secondFile.toString('base64') })

  expect(evidence.firstHasWorker).toBe(false)
  expect(evidence.hasLegacyGlobal).toBe(false)
  expect(evidence.firstSize).toEqual({ width: 96, height: 96 })
  expect(evidence.secondSize).toEqual({ width: 400, height: 400 })
})

test('built UMD direct Parser works when globalThis is unavailable', async ({ page }) => {
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const parserAvailable = await page.evaluate(() => {
    const browserWindow = window as unknown as Window & {
      SVGA: { Parser: new (options: { isDisableWebWorker: boolean }) => { destroy: () => void } }
    }
    const globalObject = window as unknown as Record<string, unknown>
    const hadGlobalThis = Object.prototype.hasOwnProperty.call(globalObject, 'globalThis')
    const originalGlobalThis = globalObject.globalThis
    try {
      delete globalObject.globalThis
      const parser = new browserWindow.SVGA.Parser({ isDisableWebWorker: true })
      parser.destroy()
      return true
    } finally {
      if (hadGlobalThis) globalObject.globalThis = originalGlobalThis
      else delete globalObject.globalThis
    }
  })

  expect(parserAvailable).toBe(true)
})

test('built UMD timer Worker advances and ends a Player timeline', async ({ page }) => {
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async () => {
    interface BrowserPlayer {
      currentFrame: number
      onEnd?: () => void
      onProcess?: () => void
      mount: (video: unknown) => Promise<void>
      start: () => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        Player: new (options: unknown) => BrowserPlayer
      }
    }
    const NativeWorker = Worker
    let workerConstructions = 0
    window.Worker = new Proxy(NativeWorker, {
      construct (target, argumentsList) {
        workerConstructions++
        return Reflect.construct(target, argumentsList) as Worker
      }
    })
    const player = new browserWindow.SVGA.Player({
      container: document.createElement('canvas'),
      isOpenNoExecutionDelay: true,
      loop: false
    })
    await player.mount({
      version: '2.0',
      size: { width: 2, height: 2 },
      fps: 30,
      frames: 3,
      images: Object.create(null),
      replaceElements: Object.create(null),
      dynamicElements: Object.create(null),
      sprites: []
    })
    const frames: number[] = []
    let schedulerWasNative = false
    player.onProcess = () => frames.push(player.currentFrame)
    const result = await Promise.race([
      new Promise<{ ended: boolean, frame: number }>(resolve => {
        player.onEnd = () => resolve({ ended: true, frame: player.currentFrame })
        player.start()
        schedulerWasNative = workerConstructions === 1
      }),
      new Promise<{ ended: boolean, frame: number }>(resolve => {
        setTimeout(() => resolve({ ended: false, frame: player.currentFrame }), 1000)
      })
    ])
    player.destroy()
    return { ...result, frames, schedulerWasNative }
  })

  expect(evidence.ended).toBe(true)
  expect(evidence.frame).toBe(2)
  expect(evidence.frames).toContain(1)
  expect(evidence.schedulerWasNative).toBe(true)
})
