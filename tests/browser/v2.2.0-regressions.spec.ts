import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Page } from '@playwright/test'

import { expect, test } from './browser-test'

async function openRuntime (page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => {
    return typeof (window as unknown as { SVGA?: unknown }).SVGA === 'object'
  })
}

test('one Parser resolves concurrent HTTP loads independently when they finish out of order', async ({ page }) => {
  const [firstFixture, secondFixture] = await Promise.all([
    readFile(resolve('tests/fixtures/svga/11.svga')),
    readFile(resolve('tests/fixtures/svga/soundwave.svga'))
  ])
  await page.route('**/regression/concurrent-first', async route => {
    await new Promise(resolve => setTimeout(resolve, 250))
    await route.fulfill({ body: firstFixture, contentType: 'application/octet-stream' })
  })
  await page.route('**/regression/concurrent-second', async route => {
    await route.fulfill({ body: secondFixture, contentType: 'application/octet-stream' })
  })
  await openRuntime(page)

  const evidence = await page.evaluate(async () => {
    interface BrowserVideo { size: { width: number, height: number } }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: { Parser: new () => BrowserParser }
    }
    const parser = new browserWindow.SVGA.Parser()
    const completionOrder: string[] = []
    try {
      const first = parser.load('/regression/concurrent-first').then(video => {
        completionOrder.push('first')
        return video
      })
      const second = parser.load('/regression/concurrent-second').then(video => {
        completionOrder.push('second')
        return video
      })
      const [firstVideo, secondVideo] = await Promise.all([first, second])
      return { completionOrder, firstSize: firstVideo.size, secondSize: secondVideo.size }
    } finally {
      parser.destroy()
    }
  })

  expect(evidence.completionOrder).toEqual(['second', 'first'])
  expect(evidence.firstSize).toEqual({ width: 96, height: 96 })
  expect(evidence.secondSize).toEqual({ width: 400, height: 400 })
})

test('HTTP extensionless, empty-path, and audio fixtures parse and render', async ({ page }) => {
  await openRuntime(page)

  const evidence = await page.evaluate(async () => {
    interface BrowserVideo {
      size: { width: number, height: number }
      frames: number
      images: Record<string, Uint8Array>
    }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    interface BrowserPlayer {
      progress: number
      onProcess?: (progress: number) => void
      mount: (video: BrowserVideo) => Promise<void>
      stepToFrame: (frame: number) => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        Parser: new () => BrowserParser
        Player: new (canvas: HTMLCanvasElement) => BrowserPlayer
      }
    }
    const parser = new browserWindow.SVGA.Parser()
    const renderFrames = async (video: BrowserVideo): Promise<{ pixels: number, progress: number }> => {
      const canvas = document.createElement('canvas')
      const player = new browserWindow.SVGA.Player(canvas)
      let callbackProgress = 0
      player.onProcess = progress => { callbackProgress = progress }
      await player.mount(video)
      let pixels = 0
      for (let frame = 0; frame < video.frames; frame++) {
        player.stepToFrame(frame)
        const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
        let framePixels = 0
        if (data) {
          for (let index = 3; index < data.length; index += 4) {
            if (data[index] > 0) framePixels++
          }
        }
        pixels = Math.max(pixels, framePixels)
      }
      const progress = player.progress
      player.destroy()
      if (progress !== callbackProgress) throw new Error('progress callback mismatch')
      return { pixels, progress }
    }

    try {
      const extensionless = await parser.load('/fixtures/extensionless')
      const [emptyPath, audio] = await Promise.all([
        parser.load('/fixtures/shape-path-undefined.svga'),
        parser.load('/fixtures/soundwave.svga')
      ])
      return {
        audio: await renderFrames(audio),
        audioKeys: Object.keys(audio.images).filter(key => key.startsWith('audio')),
        emptyPath: await renderFrames(emptyPath),
        extensionlessSize: extensionless.size
      }
    } finally {
      parser.destroy()
    }
  })

  expect(evidence.extensionlessSize).toEqual({ width: 96, height: 96 })
  expect(evidence.emptyPath.pixels).toBeGreaterThan(0)
  expect(evidence.audio.pixels).toBeGreaterThan(0)
  expect(evidence.emptyPath.progress).toBeGreaterThan(0)
  expect(evidence.audio.progress).toBeGreaterThan(0)
  expect(evidence.audioKeys).toEqual([])
})

test('default and disabled OffscreenCanvas paths both render and can switch at runtime', async ({ page }) => {
  await openRuntime(page)

  const evidence = await page.evaluate(async () => {
    interface BrowserPlayer {
      config: { isDisableOffscreenCanvas: boolean }
      progress: number
      mount: (video: unknown) => Promise<void>
      setConfig: (options: { isDisableOffscreenCanvas: boolean }) => void
      stepToFrame: (frame: number) => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: { Player: new (options: unknown) => BrowserPlayer }
    }
    const NativeOffscreenCanvas = window.OffscreenCanvas
    const supportsOffscreen = typeof NativeOffscreenCanvas === 'function'
    let offscreenConstructions = 0
    if (supportsOffscreen) {
      Object.defineProperty(window, 'OffscreenCanvas', {
        configurable: true,
        value: new Proxy(NativeOffscreenCanvas, {
          construct: (target, args) => {
            offscreenConstructions++
            return Reflect.construct(target, args)
          }
        })
      })
    }
    const source = document.createElement('canvas')
    source.width = source.height = 4
    const sourceContext = source.getContext('2d')
    if (!sourceContext) throw new Error('source context unavailable')
    sourceContext.fillStyle = '#ff0000'
    sourceContext.fillRect(0, 0, 4, 4)
    const frame = {
      alpha: 1,
      transform: null,
      layout: { x: 0, y: 0, width: 4, height: 4 },
      clipPath: '',
      shapes: []
    }
    const video = {
      version: '2.0',
      size: { width: 4, height: 4 },
      fps: 20,
      frames: 1,
      images: Object.create(null),
      replaceElements: Object.assign(Object.create(null), { sprite: source }),
      dynamicElements: Object.create(null),
      sprites: [{ imageKey: 'sprite', frames: [frame] }]
    }
    const alpha = (canvas: HTMLCanvasElement): number => {
      return canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data[3] ?? 0
    }
    const defaultCanvas = document.createElement('canvas')
    const disabledCanvas = document.createElement('canvas')
    const defaultPlayer = new browserWindow.SVGA.Player({ container: defaultCanvas })
    const disabledPlayer = new browserWindow.SVGA.Player({
      container: disabledCanvas,
      isDisableOffscreenCanvas: true
    })
    await defaultPlayer.mount(video)
    await disabledPlayer.mount(video)
    defaultPlayer.stepToFrame(0)
    disabledPlayer.stepToFrame(0)
    const beforeSwitch = {
      defaultAlpha: alpha(defaultCanvas),
      defaultProgress: defaultPlayer.progress,
      disabledAlpha: alpha(disabledCanvas),
      disabledProgress: disabledPlayer.progress
    }
    defaultPlayer.setConfig({ isDisableOffscreenCanvas: true })
    disabledPlayer.setConfig({ isDisableOffscreenCanvas: false })
    defaultPlayer.stepToFrame(0)
    disabledPlayer.stepToFrame(0)
    const afterSwitch = {
      defaultAlpha: alpha(defaultCanvas),
      defaultDisabled: defaultPlayer.config.isDisableOffscreenCanvas,
      disabledAlpha: alpha(disabledCanvas),
      disabledDisabled: disabledPlayer.config.isDisableOffscreenCanvas
    }
    defaultPlayer.destroy()
    disabledPlayer.destroy()
    return { afterSwitch, beforeSwitch, offscreenConstructions, supportsOffscreen }
  })

  expect(evidence.beforeSwitch).toEqual({
    defaultAlpha: 255,
    defaultProgress: 1,
    disabledAlpha: 255,
    disabledProgress: 1
  })
  expect(evidence.afterSwitch).toEqual({
    defaultAlpha: 255,
    defaultDisabled: true,
    disabledAlpha: 255,
    disabledDisabled: false
  })
  expect(evidence.offscreenConstructions).toBe(evidence.supportsOffscreen ? 2 : 0)
})

test('repeated mount, cache switching, and destroy close every produced bitmap once', async ({ page }) => {
  await openRuntime(page)

  const evidence = await page.evaluate(async () => {
    interface BrowserPlayer {
      mount: (video: unknown) => Promise<void>
      setConfig: (options: { isDisableOffscreenCanvas: boolean }) => void
      stepToFrame: (frame: number) => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: { Player: new (options: unknown) => BrowserPlayer }
    }
    const nativeCreateImageBitmap = createImageBitmap
    const nativeClose = ImageBitmap.prototype.close
    const produced = new Set<ImageBitmap>()
    const closeCounts = new Map<ImageBitmap, number>()
    const track = (bitmap: ImageBitmap): ImageBitmap => {
      produced.add(bitmap)
      if (!closeCounts.has(bitmap)) closeCounts.set(bitmap, 0)
      return bitmap
    }
    window.createImageBitmap = (async (...args: unknown[]) => {
      return track(await (nativeCreateImageBitmap as unknown as (...values: unknown[]) => Promise<ImageBitmap>)(...args))
    }) as typeof createImageBitmap
    ImageBitmap.prototype.close = function () {
      if (produced.has(this)) closeCounts.set(this, (closeCounts.get(this) ?? 0) + 1)
      nativeClose.call(this)
    }

    const source = document.createElement('canvas')
    source.width = source.height = 4
    const context = source.getContext('2d')
    if (!context) throw new Error('source context unavailable')
    context.fillStyle = '#00ff00'
    context.fillRect(0, 0, 4, 4)
    const baseFrame = {
      alpha: 1,
      transform: null,
      layout: { x: 0, y: 0, width: 4, height: 4 },
      clipPath: '',
      shapes: []
    }
    const video = {
      version: '2.0',
      size: { width: 4, height: 4 },
      fps: 20,
      frames: 3,
      images: Object.create(null),
      replaceElements: Object.assign(Object.create(null), { sprite: source }),
      dynamicElements: Object.create(null),
      sprites: [{ imageKey: 'sprite', frames: [baseFrame, baseFrame, baseFrame] }]
    }
    const nextPaint = async (): Promise<void> => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      await Promise.resolve()
    }
    const player = new browserWindow.SVGA.Player({
      container: document.createElement('canvas'),
      isCacheFrames: true
    })
    try {
      for (let iteration = 0; iteration < 5; iteration++) {
        await player.mount(video)
        player.stepToFrame(0)
        player.stepToFrame(1)
        await nextPaint()
        player.setConfig({ isDisableOffscreenCanvas: true })
        player.stepToFrame(2)
        await nextPaint()
        player.setConfig({ isDisableOffscreenCanvas: false })
      }
      player.destroy()
      return {
        closeCounts: [...closeCounts.values()],
        produced: produced.size
      }
    } finally {
      player.destroy()
      window.createImageBitmap = nativeCreateImageBitmap
      ImageBitmap.prototype.close = nativeClose
    }
  })

  expect(evidence.produced).toBeGreaterThan(0)
  expect(evidence.closeCounts).toEqual(Array(evidence.produced).fill(1))
})
