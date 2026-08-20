import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from './browser-test'

const readFixture = async (name: string): Promise<string> => {
  return (await readFile(resolve(`tests/fixtures/svga/${name}.svga`))).toString('base64')
}

test('built UMD validates complete clipPath grammar in the native browser', async ({ page }) => {
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async () => {
    interface BrowserPlayer {
      mount: (video: unknown) => Promise<void>
      start: () => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: { Player: new (canvas: HTMLCanvasElement) => BrowserPlayer }
    }
    const source = document.createElement('canvas')
    source.width = source.height = 4
    const sourceContext = source.getContext('2d')
    if (!sourceContext) throw new Error('source context unavailable')
    sourceContext.fillStyle = '#ff0000'
    sourceContext.fillRect(0, 0, 4, 4)

    const renderAlpha = async (clipPath: string): Promise<number> => {
      const canvas = document.createElement('canvas')
      const player = new browserWindow.SVGA.Player(canvas)
      await player.mount({
        version: '2.0',
        size: { width: 4, height: 4 },
        fps: 20,
        frames: 1,
        images: Object.create(null),
        replaceElements: Object.assign(Object.create(null), { sprite: source }),
        dynamicElements: Object.create(null),
        sprites: [{
          imageKey: 'sprite',
          frames: [{
            alpha: 1,
            transform: null,
            layout: { x: 0, y: 0, width: 4, height: 4 },
            clipPath,
            shapes: []
          }]
        }]
      })
      player.start()
      const alpha = canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data[3] ?? 0
      player.destroy()
      return alpha
    }

    return {
      nonBreakingSpace: await renderAlpha('M0 0\u00a0H4 V4 H0 Z'),
      validNewline: await renderAlpha('M0 0\nH4 V4 H0 Z'),
      verticalTab: await renderAlpha('M0 0\u000bH4 V4 H0 Z'),
      trailingGarbage: await renderAlpha('M0 0 H4 V4 H0 Z invalid'),
      trailingCommand: await renderAlpha('M0 0 L')
    }
  })

  expect(evidence.nonBreakingSpace).toBe(0)
  expect(evidence.validNewline).toBe(255)
  expect(evidence.verticalTab).toBe(0)
  expect(evidence.trailingGarbage).toBe(0)
  expect(evidence.trailingCommand).toBe(0)
})

test('built UMD parses with real Worker and direct modes, then renders non-empty Canvas pixels', async ({ page }) => {
  const [workerFixture, directFixture] = await Promise.all([
    readFixture('11'),
    readFixture('soundwave')
  ])
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async ({ workerData, directData }) => {
    interface BrowserVideo {
      size: { width: number, height: number }
    }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    interface BrowserPlayer {
      mount: (video: BrowserVideo) => Promise<void>
      start: () => void
      pause: () => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        Parser: new (options?: { isDisableWebWorker?: boolean }) => BrowserParser
        Player: new (container: HTMLCanvasElement) => BrowserPlayer
      }
    }
    const workerParser = new browserWindow.SVGA.Parser()
    const directParser = new browserWindow.SVGA.Parser({ isDisableWebWorker: true })
    try {
      const [workerVideo, directVideo] = await Promise.all([
        workerParser.load(`data:application/octet-stream;base64,${workerData}`),
        directParser.load(`data:application/octet-stream;base64,${directData}`)
      ])
      const canvas = document.createElement('canvas')
      document.body.appendChild(canvas)
      const player = new browserWindow.SVGA.Player(canvas)
      await player.mount(directVideo)
      player.start()
      player.pause()
      const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
      let nonEmptyPixels = 0
      if (pixels) {
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) nonEmptyPixels++
        }
      }
      player.destroy()
      return {
        directSize: directVideo.size,
        nonEmptyPixels,
        workerSize: workerVideo.size
      }
    } finally {
      workerParser.destroy()
      directParser.destroy()
    }
  }, { directData: directFixture, workerData: workerFixture })

  expect(evidence.workerSize).toEqual({ width: 96, height: 96 })
  expect(evidence.directSize).toEqual({ width: 400, height: 400 })
  expect(evidence.nonEmptyPixels).toBeGreaterThan(0)
})

test('built UMD renders native SVG paths, masks, ellipses and rounded rectangles', async ({ page }) => {
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async () => {
    interface BrowserPlayer {
      mount: (video: unknown) => Promise<void>
      start: () => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: { Player: new (canvas: HTMLCanvasElement) => BrowserPlayer }
    }
    const identity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
    const noStyle = {
      fill: null,
      stroke: null,
      strokeWidth: null,
      lineCap: null,
      lineJoin: null,
      miterLimit: null,
      lineDash: null
    }
    const style = (fill: string) => ({ ...noStyle, fill })
    const source = document.createElement('canvas')
    source.width = 40
    source.height = 40
    const sourceContext = source.getContext('2d')
    if (!sourceContext) throw new Error('source context unavailable')
    sourceContext.fillStyle = '#ff00ff'
    sourceContext.fillRect(0, 0, 40, 40)
    const sourceBlob = await new Promise<Blob>((resolve, reject) => {
      source.toBlob(value => {
        if (value === null) reject(new Error('source image encoding failed'))
        else resolve(value)
      }, 'image/png')
    })
    const imageBytes = new Uint8Array(await sourceBlob.arrayBuffer())
    const baseFrame = {
      alpha: 1,
      transform: null,
      layout: { x: 0, y: 0, width: 40, height: 40 },
      clipPath: ''
    }
    const canvas = document.createElement('canvas')
    const player = new browserWindow.SVGA.Player(canvas)
    await player.mount({
      version: '2.0',
      size: { width: 40, height: 40 },
      fps: 20,
      frames: 1,
      images: Object.assign(Object.create(null), { masked: imageBytes }),
      replaceElements: Object.create(null),
      dynamicElements: Object.create(null),
      sprites: [
        {
          imageKey: 'masked',
          frames: [{
            ...baseFrame,
            clipPath: 'M0 0 H20 V40 H0 Z',
            shapes: []
          }]
        },
        {
          imageKey: 'shapes',
          frames: [{
            ...baseFrame,
            shapes: [
              {
                type: 'shape',
                path: { d: 'M2 2 L18 2 L2 18 Z' },
                transform: identity,
                styles: style('rgba(255, 0, 0, 1)')
              },
              {
                type: 'ellipse',
                path: { x: 30, y: 10, radiusX: 5, radiusY: 5 },
                transform: identity,
                styles: style('rgba(0, 255, 0, 1)')
              },
              {
                type: 'rect',
                path: { x: 22, y: 22, width: 12, height: 12, cornerRadius: 3 },
                transform: identity,
                styles: style('rgba(0, 0, 255, 1)')
              }
            ]
          }]
        }
      ]
    })
    player.start()
    const pixels = canvas.getContext('2d')?.getImageData(0, 0, 40, 40).data
    if (!pixels) throw new Error('render context unavailable')
    const pixel = (x: number, y: number): number[] => {
      const index = (y * 40 + x) * 4
      return Array.from(pixels.slice(index, index + 4))
    }
    const result = {
      blue: pixel(28, 28),
      green: pixel(30, 10),
      maskedLeft: pixel(1, 30),
      maskedRight: pixel(39, 39),
      red: pixel(5, 5)
    }
    player.destroy()
    return result
  })

  expect(evidence.red).toEqual([255, 0, 0, 255])
  expect(evidence.green).toEqual([0, 255, 0, 255])
  expect(evidence.blue).toEqual([0, 0, 255, 255])
  expect(evidence.maskedLeft).toEqual([255, 0, 255, 255])
  expect(evidence.maskedRight[3]).toBe(0)
})

test('built UMD transfers default Worker image bytes and Player decodes them for rendering', async ({ page }) => {
  const fixture = await readFixture('11')
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async data => {
    interface BrowserVideo {
      images: Record<string, Uint8Array>
    }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    interface BrowserPlayer {
      mount: (video: BrowserVideo) => Promise<void>
      start: () => void
      pause: () => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        Parser: new () => BrowserParser
        Player: new (container: HTMLCanvasElement) => BrowserPlayer
      }
    }
    const parser = new browserWindow.SVGA.Parser()
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    try {
      const video = await parser.load(`data:application/octet-stream;base64,${data}`)
      const rasterValues = Object.keys(video.images).map(key => video.images[key])
      const rasterValuesAreBytes = rasterValues.length > 0 && rasterValues.every(value => value instanceof Uint8Array)
      const player = new browserWindow.SVGA.Player(canvas)
      await player.mount(video)
      player.start()
      player.pause()
      const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
      let nonEmptyPixels = 0
      if (pixels) {
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) nonEmptyPixels++
        }
      }
      player.destroy()
      return { nonEmptyPixels, rasterValuesAreBytes }
    } finally {
      parser.destroy()
    }
  }, fixture)

  expect(evidence.rasterValuesAreBytes).toBe(true)
  expect(evidence.nonEmptyPixels).toBeGreaterThan(0)
})

test('Player closes only its own decoded ImageBitmaps exactly once', async ({ page }) => {
  const fixture = await readFixture('11')
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async data => {
    interface BrowserVideo {
      images: Record<string, Uint8Array>
      replaceElements: Record<string, CanvasImageSource>
      dynamicElements: Record<string, CanvasImageSource>
    }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    interface BrowserPlayer {
      mount: (video: BrowserVideo) => Promise<void>
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        Parser: new () => BrowserParser
        Player: new (container: HTMLCanvasElement) => BrowserPlayer
      }
    }
    const nativeCreate = createImageBitmap
    const nativeClose = ImageBitmap.prototype.close
    const caller = await nativeCreate(document.createElement('canvas'))
    const owned: ImageBitmap[] = []
    const closeCounts: number[] = []
    let callerCloses = 0
    window.createImageBitmap = (async (...args: unknown[]) => {
      const bitmap = await (nativeCreate as unknown as (...values: unknown[]) => Promise<ImageBitmap>)(...args)
      owned.push(bitmap)
      closeCounts.push(0)
      return bitmap
    }) as typeof createImageBitmap
    ImageBitmap.prototype.close = function () {
      if (this === caller) callerCloses++
      const index = owned.indexOf(this)
      if (index >= 0) closeCounts[index]++
      nativeClose.call(this)
    }

    const parser = new browserWindow.SVGA.Parser()
    const player = new browserWindow.SVGA.Player(document.createElement('canvas'))
    try {
      const video = await parser.load(`data:application/octet-stream;base64,${data}`)
      const key = Object.keys(video.images)[0]
      video.replaceElements[key] = caller
      video.dynamicElements[key] = caller
      await player.mount(video)
      await player.mount(video)
      player.destroy()
      return { callerCloses, closeCounts, owned: owned.length }
    } finally {
      player.destroy()
      parser.destroy()
      window.createImageBitmap = nativeCreate
      ImageBitmap.prototype.close = nativeClose
      nativeClose.call(caller)
    }
  }, fixture)

  expect(evidence.owned).toBeGreaterThan(0)
  expect(evidence.closeCounts).toEqual(Array(evidence.owned).fill(1))
  expect(evidence.callerCloses).toBe(0)
})

test('default Worker parses, caches, reopens and renders under strict CSP', async ({ page }, testInfo) => {
  const [fixture, bundle] = await Promise.all([
    readFixture('11'),
    readFile(resolve('dist/index.min.js'), 'utf8')
  ])
  const policy = "default-src 'none'; script-src 'self' blob:; worker-src blob:; child-src blob:; connect-src data: blob:; img-src 'self' data: blob:"
  await page.route('https://svga-csp.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    await route.fulfill(path === '/svga.js'
      ? { body: bundle, contentType: 'application/javascript' }
      : {
          body: '<!doctype html><title>SVGA strict CSP test</title>',
          contentType: 'text/html',
          headers: { 'Content-Security-Policy': policy }
        })
  })
  await page.goto('https://svga-csp.test/')
  await page.addScriptTag({ url: 'https://svga-csp.test/svga.js' })

  const evidence = await page.evaluate(async ({ data, suffix }) => {
    interface BrowserVideo {
      frames: number
    }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    interface BrowserDb {
      find: (id: IDBValidKey) => Promise<BrowserVideo | undefined>
      insert: (id: IDBValidKey, video: BrowserVideo) => Promise<void>
    }
    interface BrowserPlayer {
      mount: (video: BrowserVideo) => Promise<void>
      start: () => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        DB: new (options: { name: string, version: number, storeName: string }) => BrowserDb
        Parser: new () => BrowserParser
        Player: new (container: HTMLCanvasElement) => BrowserPlayer
      }
    }
    const name = `svga-csp-${suffix}-${Date.now()}`
    const options = { name, version: 1, storeName: 'videos' }
    const parser = new browserWindow.SVGA.Parser()
    try {
      const parsed = await parser.load(`data:application/octet-stream;base64,${data}`)
      const first = new browserWindow.SVGA.DB(options)
      await first.insert('fixture', parsed)
      const reopened = new browserWindow.SVGA.DB(options)
      const cached = await reopened.find('fixture')
      if (!cached) throw new Error('cache reopen missed valid video')

      const canvas = document.createElement('canvas')
      document.body.appendChild(canvas)
      const player = new browserWindow.SVGA.Player(canvas)
      await player.mount(cached)
      player.start()
      const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
      let nonEmptyPixels = 0
      if (pixels) {
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) nonEmptyPixels++
        }
      }
      player.destroy()

      return { frames: cached.frames, nonEmptyPixels }
    } finally {
      parser.destroy()
    }
  }, { data: fixture, suffix: `${testInfo.project.name}-${testInfo.workerIndex}` })

  expect(evidence.frames).toBeGreaterThan(0)
  expect(evidence.nonEmptyPixels).toBeGreaterThan(0)
})

test('Player reuses one offscreen surface and clears pixels between frames', async ({ page }) => {
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async () => {
    interface BrowserPlayer {
      onEnd?: () => void
      mount: (video: unknown) => Promise<void>
      start: () => void
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
    const visible = document.createElement('canvas')
    const player = new browserWindow.SVGA.Player({ container: visible, loop: false })
    const baseFrame = {
      transform: null,
      layout: { x: 0, y: 0, width: 4, height: 4 },
      clipPath: '',
      shapes: []
    }
    await player.mount({
      version: '2.0',
      size: { width: 4, height: 4 },
      fps: 60,
      frames: 2,
      images: Object.create(null),
      replaceElements: Object.assign(Object.create(null), { sprite: source }),
      dynamicElements: Object.create(null),
      sprites: [{ imageKey: 'sprite', frames: [{ ...baseFrame, alpha: 1 }, { ...baseFrame, alpha: 0 }] }]
    })
    const alpha = (): number => visible.getContext('2d')?.getImageData(0, 0, 1, 1).data[3] ?? 0
    const ended = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('playback timeout')), 1000)
      player.onEnd = () => { clearTimeout(timer); resolve() }
    })
    player.start()
    const before = alpha()
    await ended
    const after = alpha()
    player.destroy()
    return { after, before, offscreenConstructions, supportsOffscreen }
  })

  expect(evidence.before).toBe(255)
  expect(evidence.after).toBe(0)
  expect(evidence.offscreenConstructions).toBe(evidence.supportsOffscreen ? 1 : 0)
})

test('built UMD runs lifecycle methods in callback order and clears destroyed players', async ({ page }) => {
  const fixture = await readFixture('11')
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async data => {
    interface BrowserVideo {
      size: { width: number, height: number }
    }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    interface BrowserPlayer {
      currentFrame: number
      totalFrames: number
      videoEntity: BrowserVideo | undefined
      onStart?: () => void
      onResume?: () => void
      onPause?: () => void
      onStop?: () => void
      onProcess?: () => void
      onEnd?: () => void
      mount: (video: BrowserVideo) => Promise<void>
      start: () => void
      resume: () => void
      pause: () => void
      stop: () => void
      clear: () => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        Parser: new (options: { isDisableWebWorker: boolean }) => BrowserParser
        Player: new (options: { container: HTMLCanvasElement, endFrame: number, loop: boolean }) => BrowserPlayer
      }
    }
    const parser = new browserWindow.SVGA.Parser({ isDisableWebWorker: true })
    const video = await parser.load(`data:application/octet-stream;base64,${data}`)
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    const player = new browserWindow.SVGA.Player({ container: canvas, endFrame: 1, loop: false })
    await player.mount(video)
    const callbacks: string[] = []
    player.onStart = () => callbacks.push('start')
    player.onResume = () => callbacks.push('resume')
    player.onPause = () => callbacks.push('pause')
    player.onStop = () => callbacks.push('stop')
    player.onProcess = () => callbacks.push('process')
    await Promise.race([
      new Promise<void>(resolve => {
        player.onEnd = () => {
          callbacks.push('end')
          resolve()
        }
        player.start()
      }),
      new Promise<void>((resolve, reject) => {
        setTimeout(() => reject(new Error('natural playback timeout')), 2000)
      })
    ])

    player.start()
    player.pause()
    player.resume()
    player.stop()

    player.onStart = undefined
    player.onResume = undefined
    player.onPause = undefined
    player.onStop = undefined
    player.onProcess = undefined
    player.onEnd = undefined
    player.start()
    player.pause()
    const context = canvas.getContext('2d')
    const alphaBeforeClear = context
      ? context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)
      : false
    player.clear()
    const alphaAfterClear = context
      ? context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)
      : true
    player.destroy()
    let destroyedRejectsUse = false
    try {
      player.start()
    } catch (error) {
      destroyedRejectsUse = error instanceof Error && error.message === 'destroyed'
    }
    const destroyedState = {
      currentFrame: player.currentFrame,
      totalFrames: player.totalFrames,
      videoEntityMissing: player.videoEntity === undefined
    }
    parser.destroy()
    return { alphaAfterClear, alphaBeforeClear, callbacks, destroyedRejectsUse, destroyedState }
  }, fixture)

  expect(evidence.callbacks).toEqual(['start', 'process', 'end', 'start', 'pause', 'resume', 'stop'])
  expect(evidence.alphaBeforeClear).toBe(true)
  expect(evidence.alphaAfterClear).toBe(false)
  expect(evidence.destroyedRejectsUse).toBe(true)
  expect(evidence.destroyedState).toEqual({
    currentFrame: 0,
    totalFrames: 0,
    videoEntityMissing: true
  })
})

test('built UMD renders replacement and dynamic elements from a retained fixture', async ({ page }) => {
  const fixture = await readFixture('11')
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async data => {
    interface BrowserVideo {
      replaceElements: Record<string, HTMLCanvasElement>
      dynamicElements: Record<string, HTMLCanvasElement>
    }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    interface BrowserPlayer {
      mount: (video: BrowserVideo) => Promise<void>
      start: () => void
      pause: () => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        Parser: new (options: { isDisableWebWorker: boolean }) => BrowserParser
        Player: new (container: HTMLCanvasElement) => BrowserPlayer
      }
    }
    const parser = new browserWindow.SVGA.Parser({ isDisableWebWorker: true })
    const video = await parser.load(`data:application/octet-stream;base64,${data}`)
    const replacement = document.createElement('canvas')
    replacement.width = 94
    replacement.height = 94
    const replacementContext = replacement.getContext('2d')
    if (!replacementContext) throw new Error('replacement context unavailable')
    replacementContext.fillStyle = '#ff0000'
    replacementContext.fillRect(0, 0, replacement.width, replacement.height)
    const dynamic = document.createElement('canvas')
    dynamic.width = 20
    dynamic.height = 20
    const dynamicContext = dynamic.getContext('2d')
    if (!dynamicContext) throw new Error('dynamic context unavailable')
    dynamicContext.fillStyle = '#00ff00'
    dynamicContext.fillRect(0, 0, dynamic.width, dynamic.height)
    video.replaceElements.img_14 = replacement
    video.dynamicElements.img_14 = dynamic

    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    const player = new browserWindow.SVGA.Player(canvas)
    await player.mount(video)
    player.start()
    player.pause()
    const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
    let red = 0
    let green = 0
    if (pixels) {
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] > 200 && pixels[index + 1] < 50) red++
        if (pixels[index + 1] > 200 && pixels[index] < 50) green++
      }
    }
    player.destroy()
    parser.destroy()
    return { green, red }
  }, fixture)

  expect(evidence.red).toBeGreaterThan(100)
  expect(evidence.green).toBeGreaterThan(100)
})

test('built UMD uses frame cache and native IntersectionObserver, then disconnects it', async ({ page }) => {
  const fixture = await readFixture('11')
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async data => {
    interface BrowserVideo {
      replaceElements: Record<string, HTMLCanvasElement>
    }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    interface BrowserPlayer {
      config: { isUseIntersectionObserver: boolean }
      mount: (video: BrowserVideo) => Promise<void>
      setConfig: (options: { isUseIntersectionObserver: boolean }) => void
      start: () => void
      pause: () => void
      clear: () => void
      destroy: () => void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        Parser: new (options: { isDisableWebWorker: boolean }) => BrowserParser
        Player: new (options: { container: HTMLCanvasElement, isCacheFrames: boolean }) => BrowserPlayer
      }
    }
    const waitFor = async (condition: () => boolean): Promise<boolean> => {
      const deadline = performance.now() + 3000
      while (!condition() && performance.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      return condition()
    }
    const NativeIntersectionObserver = IntersectionObserver
    let observerCreations = 0
    let observerDisconnections = 0
    class TrackedIntersectionObserver extends NativeIntersectionObserver {
      constructor (callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options)
        observerCreations++
      }

      override disconnect (): void {
        observerDisconnections++
        super.disconnect()
      }
    }
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: TrackedIntersectionObserver
    })
    const colorCanvas = (color: string): HTMLCanvasElement => {
      const canvas = document.createElement('canvas')
      canvas.width = 94
      canvas.height = 94
      const context = canvas.getContext('2d')
      if (!context) throw new Error('color context unavailable')
      context.fillStyle = color
      context.fillRect(0, 0, canvas.width, canvas.height)
      return canvas
    }
    const colorCounts = (canvas: HTMLCanvasElement): { red: number, blue: number, alpha: number } => {
      const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
      const result = { red: 0, blue: 0, alpha: 0 }
      if (!pixels) return result
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] > 0) result.alpha++
        if (pixels[index] > 200 && pixels[index + 2] < 50) result.red++
        if (pixels[index + 2] > 200 && pixels[index] < 50) result.blue++
      }
      return result
    }

    const parser = new browserWindow.SVGA.Parser({ isDisableWebWorker: true })
    const video = await parser.load(`data:application/octet-stream;base64,${data}`)
    video.replaceElements.img_14 = colorCanvas('#ff0000')
    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.top = '5000px'
    document.body.appendChild(canvas)
    const player = new browserWindow.SVGA.Player({ container: canvas, isCacheFrames: true })
    await player.mount(video)
    player.setConfig({ isUseIntersectionObserver: true })
    const observerWasNative = observerCreations === 1
    const becameNonIntersecting = await waitFor(() => observerCreations === 1)
    await new Promise(resolve => setTimeout(resolve, 100))
    player.start()
    player.pause()
    const hiddenPixels = colorCounts(canvas).alpha

    player.setConfig({ isUseIntersectionObserver: false })
    const observerRemovedByConfig = observerDisconnections === 1 && !player.config.isUseIntersectionObserver
    player.start()
    player.pause()
    await new Promise(resolve => setTimeout(resolve, 100))
    video.replaceElements.img_14 = colorCanvas('#0000ff')
    player.clear()
    player.start()
    player.pause()
    const cachedColors = colorCounts(canvas)
    player.destroy()
    const released = {
      observerMissing: observerDisconnections === 1,
      observerSetting: player.config.isUseIntersectionObserver
    }
    parser.destroy()
    return {
      becameNonIntersecting,
      cachedColors,
      hiddenPixels,
      observerRemovedByConfig,
      observerWasNative,
      released
    }
  }, fixture)

  expect(evidence.observerWasNative).toBe(true)
  expect(evidence.becameNonIntersecting).toBe(true)
  expect(evidence.hiddenPixels).toBe(0)
  expect(evidence.observerRemovedByConfig).toBe(true)
  expect(evidence.cachedColors.red).toBeGreaterThan(100)
  expect(evidence.cachedColors.blue).toBe(0)
  expect(evidence.released).toEqual({ observerMissing: true, observerSetting: false })
})

test('built UMD persists, deletes, and reopens data with real browser IndexedDB', async ({ page }, testInfo) => {
  const fixture = await readFixture('kaola')
  await page.route('https://svga.test/', async route => {
    await route.fulfill({ body: '<!doctype html><title>SVGA browser test</title>', contentType: 'text/html' })
  })
  await page.goto('https://svga.test/')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async ({ data, suffix }) => {
    interface BrowserVideo {
      size: { width: number, height: number }
      frames: number
    }
    interface BrowserParser {
      load: (url: string) => Promise<BrowserVideo>
      destroy: () => void
    }
    interface BrowserDb {
      find: (id: IDBValidKey) => Promise<BrowserVideo | undefined>
      insert: (id: IDBValidKey, video: BrowserVideo) => Promise<void>
      delete: (id: IDBValidKey) => Promise<void>
    }
    const browserWindow = window as unknown as Window & {
      SVGA: {
        DB: new (options: { name: string, version: number, storeName: string }) => BrowserDb
        Parser: new (options: { isDisableWebWorker: boolean }) => BrowserParser
      }
    }
    const deleteDatabase = (name: string): Promise<void> => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error || new Error('delete database failed'))
      request.onblocked = () => reject(new Error('delete database blocked'))
    })
    const rawStore = <T>(
      name: string,
      mode: IDBTransactionMode,
      action: (store: IDBObjectStore) => IDBRequest<T>
    ): Promise<T> => new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onerror = () => reject(request.error || new Error('raw database open failed'))
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('videos', mode)
        const operation = action(transaction.objectStore('videos'))
        transaction.oncomplete = () => { database.close(); resolve(operation.result) }
        transaction.onerror = () => { database.close(); reject(transaction.error || new Error('raw transaction failed')) }
        transaction.onabort = transaction.onerror
      }
    })
    const name = `svga-browser-${suffix}-${Date.now()}`
    const options = { name, version: 1, storeName: 'videos' }
    const parser = new browserWindow.SVGA.Parser({ isDisableWebWorker: true })
    try {
      const video = await parser.load(`data:application/octet-stream;base64,${data}`)
      const first = new browserWindow.SVGA.DB(options)
      await first.insert('fixture', video)
      const inserted = await first.find('fixture')
      const reopened = new browserWindow.SVGA.DB(options)
      const foundAfterNewConnection = await reopened.find('fixture')
      await reopened.delete('fixture')
      const deleted = await first.find('fixture')
      await rawStore(name, 'readwrite', store => store.put({ version: '2.0' }, 'invalid'))
      const invalid = await first.find('invalid')
      const invalidAfterCleanup = await rawStore(name, 'readonly', store => store.get('invalid'))

      await deleteDatabase(name)
      const afterDatabaseReopen = await first.find('fixture')
      await first.insert('reopened', video)
      const insertedAfterReopen = await first.find('reopened')
      await first.delete('reopened')
      const deletedAfterReopen = await first.find('reopened')
      await deleteDatabase(name)
      return {
        afterDatabaseReopenMissing: afterDatabaseReopen === undefined,
        deletedAfterReopenMissing: deletedAfterReopen === undefined,
        deletedMissing: deleted === undefined,
        foundAfterNewConnection: foundAfterNewConnection?.size,
        invalidMissing: invalid === undefined && invalidAfterCleanup === undefined,
        insertedAfterReopen: insertedAfterReopen?.frames,
        insertedSize: inserted?.size
      }
    } finally {
      parser.destroy()
    }
  }, { data: fixture, suffix: `${testInfo.project.name}-${testInfo.workerIndex}` })

  expect(evidence.insertedSize).toEqual({ width: 1280, height: 720 })
  expect(evidence.foundAfterNewConnection).toEqual({ width: 1280, height: 720 })
  expect(evidence.deletedMissing).toBe(true)
  expect(evidence.invalidMissing).toBe(true)
  expect(evidence.afterDatabaseReopenMissing).toBe(true)
  expect(evidence.insertedAfterReopen).toBe(40)
  expect(evidence.deletedAfterReopenMissing).toBe(true)
})
