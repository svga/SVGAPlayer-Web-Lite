import * as assert from 'assert'
import {
  PLAYER_FILL_MODE,
  PLAYER_PLAY_MODE,
  SHAPE_TYPE,
  Video
} from '../../src/types'

type Listener = (event: Event) => void

interface FakeContext2D {
  calls: string[]
  save: () => void
  restore: () => void
  transform: (...args: number[]) => void
  beginPath: () => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  bezierCurveTo: (...args: number[]) => void
  quadraticCurveTo: (...args: number[]) => void
  closePath: () => void
  clip: () => void
  fill: () => void
  stroke: () => void
  arcTo: (...args: number[]) => void
  drawImage: (...args: any[]) => void
  setLineDash: (dash: number[]) => void
  clearRect: (...args: number[]) => void
  globalAlpha: number
  strokeStyle: string
  fillStyle: string
  lineWidth: number
  miterLimit: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
}

class FakeCanvas {
  public width = 100
  public height = 100
  public readonly events: { [type: string]: Listener[] } = {}
  public readonly context2d = createFakeContext2D()
  public webglContext: FakeWebGLRenderingContext | null = null

  public getContext (type: string): any {
    if (type === '2d') return this.context2d
    if (type === 'webgl' || type === 'experimental-webgl') {
      if (!fakeWebGLAvailable) return null
      if (this.webglContext === null) this.webglContext = new FakeWebGLRenderingContext(this)
      return this.webglContext
    }
    return null
  }

  public addEventListener (type: string, listener: Listener): void {
    this.events[type] = this.events[type] ?? []
    this.events[type].push(listener)
  }

  public removeEventListener (type: string, listener: Listener): void {
    this.events[type] = (this.events[type] ?? []).filter(item => item !== listener)
  }

  public dispatchEvent (type: string): void {
    const event = {
      preventDefault: () => {}
    } as Event
    ;(this.events[type] ?? []).forEach(listener => listener(event))
  }

  public toDataURL (): string {
    return 'data:image/png;base64,'
  }
}

class FakeImage {
  public width = 32
  public height = 32
  public onload: (() => void) | null = null
  private value = ''

  public set src (value: string) {
    this.value = value
    setTimeout(() => this.onload?.(), 0)
  }

  public get src (): string {
    return this.value
  }
}

class FakeWorker {
  public onmessage: ((event: { data: Video | Error }) => void) | null = null
  public terminated = false
  public readonly url: string

  constructor (url: string) {
    this.url = url
  }

  public postMessage (data: { url: string }): void {
    parserWorkerPosts.push(data)
    parserWorkerResponders.push((response: Video | Error) => {
      this.onmessage?.({ data: response })
    })
  }

  public terminate (): void {
    this.terminated = true
  }
}

class FakeWebGLRenderingContext {
  public readonly canvas: FakeCanvas
  public readonly calls: string[] = []
  public lost = false
  public readonly VERTEX_SHADER = 35633
  public readonly FRAGMENT_SHADER = 35632
  public readonly COMPILE_STATUS = 35713
  public readonly LINK_STATUS = 35714
  public readonly ARRAY_BUFFER = 34962
  public readonly STATIC_DRAW = 35044
  public readonly DYNAMIC_DRAW = 35048
  public readonly TEXTURE_2D = 3553
  public readonly TEXTURE_WRAP_S = 10242
  public readonly TEXTURE_WRAP_T = 10243
  public readonly CLAMP_TO_EDGE = 33071
  public readonly TEXTURE_MIN_FILTER = 10241
  public readonly TEXTURE_MAG_FILTER = 10240
  public readonly LINEAR = 9729
  public readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL = 37441
  public readonly RGBA = 6408
  public readonly UNSIGNED_BYTE = 5121
  public readonly COLOR_BUFFER_BIT = 16384
  public readonly BLEND = 3042
  public readonly SRC_ALPHA = 770
  public readonly ONE_MINUS_SRC_ALPHA = 771
  public readonly FLOAT = 5126
  public readonly TRIANGLES = 4

  constructor (canvas: FakeCanvas) {
    this.canvas = canvas
  }

  public createShader (): WebGLShader { return {} as WebGLShader }
  public shaderSource (): void {}
  public compileShader (): void {}
  public getShaderParameter (): boolean { return true }
  public getShaderInfoLog (): string { return '' }
  public deleteShader (): void {}
  public createProgram (): WebGLProgram { return {} as WebGLProgram }
  public attachShader (): void {}
  public linkProgram (): void {}
  public getProgramParameter (): boolean { return true }
  public getProgramInfoLog (): string { return '' }
  public deleteProgram (): void { this.calls.push('deleteProgram') }
  public createBuffer (): WebGLBuffer { return {} as WebGLBuffer }
  public deleteBuffer (): void { this.calls.push('deleteBuffer') }
  public getAttribLocation (): number { return 1 }
  public getUniformLocation (): WebGLUniformLocation { return {} as WebGLUniformLocation }
  public bindBuffer (): void {}
  public bufferData (): void {}
  public viewport (): void {}
  public useProgram (): void {}
  public enable (): void {}
  public blendFunc (): void {}
  public uniform2f (): void {}
  public clearColor (): void {}
  public clear (): void {}
  public bindTexture (): void {}
  public enableVertexAttribArray (): void {}
  public vertexAttribPointer (): void {}
  public uniformMatrix3fv (): void {}
  public uniform1f (): void {}
  public drawArrays (): void { this.calls.push('drawArrays') }
  public createTexture (): WebGLTexture { return {} as WebGLTexture }
  public deleteTexture (): void { this.calls.push('deleteTexture') }
  public texParameteri (): void {}
  public pixelStorei (): void {}
  public texImage2D (): void {}
  public isContextLost (): boolean { return this.lost }
  public getExtension (name: string): unknown {
    if (name !== 'WEBGL_lose_context') return null
    return {
      loseContext: () => {
        this.lost = true
        this.canvas.dispatchEvent('webglcontextlost')
      },
      restoreContext: () => {
        this.lost = false
        this.canvas.dispatchEvent('webglcontextrestored')
      }
    }
  }
}

const parserWorkerPosts: Array<{ url: string }> = []
const parserWorkerResponders: Array<(response: Video | Error) => void> = []
let fakeWebGLAvailable = true

function resolveNextParserLoad (response: Video | Error = createVideo({ withImage: true })): void {
  const responder = parserWorkerResponders.shift()
  if (responder === undefined) throw new Error('No pending parser load')
  responder(response)
}

async function nextMicrotask (): Promise<void> {
  await Promise.resolve()
}

function createFakeContext2D (): FakeContext2D {
  const calls: string[] = []
  return {
    calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    transform: (...args: number[]) => calls.push(`transform:${args.join(',')}`),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x, y) => calls.push(`moveTo:${x},${y}`),
    lineTo: (x, y) => calls.push(`lineTo:${x},${y}`),
    bezierCurveTo: (...args) => calls.push(`bezierCurveTo:${args.join(',')}`),
    quadraticCurveTo: (...args) => calls.push(`quadraticCurveTo:${args.join(',')}`),
    closePath: () => calls.push('closePath'),
    clip: () => calls.push('clip'),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke'),
    arcTo: (...args) => calls.push(`arcTo:${args.join(',')}`),
    drawImage: (...args) => calls.push(`drawImage:${args.length}`),
    setLineDash: dash => calls.push(`setLineDash:${dash.join(',')}`),
    clearRect: (...args) => calls.push(`clearRect:${args.join(',')}`),
    globalAlpha: 1,
    strokeStyle: 'transparent',
    fillStyle: 'transparent',
    lineWidth: 1,
    miterLimit: 10,
    lineCap: 'butt',
    lineJoin: 'miter'
  }
}

function installBrowserFakes (): void {
  parserWorkerPosts.length = 0
  parserWorkerResponders.length = 0
  fakeWebGLAvailable = true
  const fakeDocument = {
    createElement: (tag: string): any => {
      if (tag === 'canvas') return new FakeCanvas()
      if (tag === 'img') return new FakeImage()
      if (tag === 'a') return { href: '' }
      return {}
    }
  }
  ;(globalThis as any).document = fakeDocument
  ;(globalThis as any).window = {
    document: fakeDocument,
    OffscreenCanvas: undefined,
    URL: {
      createObjectURL: () => 'blob:fake'
    },
    performance: {
      now: () => Date.now()
    },
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 16),
    SVGAParserMockWorker: undefined
  }
  ;(globalThis as any).self = globalThis.window
  ;(globalThis as any).Worker = FakeWorker
  ;(globalThis as any).Blob = class FakeBlob {
    constructor (public readonly parts: unknown[]) {}
  }
  ;(globalThis as any).HTMLCanvasElement = FakeCanvas
  ;(globalThis as any).Image = FakeImage
  ;(globalThis as any).requestAnimationFrame = globalThis.window.requestAnimationFrame
  ;(globalThis as any).performance = globalThis.window.performance
}

function createVideo (options: {
  withImage?: boolean
  withDynamicElement?: boolean
  withShape?: boolean
  shapeType?: 'path' | 'rect' | 'roundedRect' | 'ellipse'
  withHole?: boolean
  withMask?: boolean
  withDash?: boolean
  withUnsupportedPath?: boolean
} = {}): Video {
  const styles = {
    fill: 'rgba(255, 0, 0, 1)' as const,
    stroke: options.withDash === true ? 'rgba(0, 0, 0, 1)' as const : null,
    strokeWidth: options.withDash === true ? 2 : null,
    lineCap: null,
    lineJoin: null,
    miterLimit: null,
    lineDash: options.withDash === true ? [2, 2] : null
  }
  const path = options.withUnsupportedPath === true
    ? 'M0 0 A10 10 0 0 1 20 20 Z'
    : options.withHole === true
    ? 'M0 0 L10 0 L10 10 L0 10 Z M2 2 L8 2 L8 8 L2 8 Z'
    : 'M0 0 L10 0 L10 10 L0 10 Z'
  const shapeType = options.shapeType ?? 'path'
  const shape = shapeType === 'ellipse'
    ? {
        type: SHAPE_TYPE.ELLIPSE,
        path: { x: 0, y: 0, radiusX: 10, radiusY: 8 },
        styles,
        transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
      }
    : shapeType === 'rect' || shapeType === 'roundedRect'
      ? {
          type: SHAPE_TYPE.RECT,
          path: { x: 0, y: 0, width: 10, height: 12, cornerRadius: shapeType === 'roundedRect' ? 4 : 0 },
          styles,
          transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
        }
      : {
          type: SHAPE_TYPE.SHAPE,
          path: { d: path },
          styles,
          transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
        }

  return {
    version: '2.0',
    size: { width: 100, height: 100 },
    fps: 20,
    frames: 3,
    images: options.withImage === true ? { image: new FakeImage() as any } : {},
    replaceElements: {},
    dynamicElements: options.withDynamicElement === true ? { image: new FakeCanvas() as any } : {},
    sprites: [
      {
        imageKey: 'image',
        frames: [0, 1, 2].map(() => ({
          alpha: 1,
          transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
          nx: 0,
          ny: 0,
          layout: { x: 0, y: 0, width: 32, height: 32 },
          clipPath: options.withMask === true ? 'M0 0 L10 0 L10 10 L0 10 Z' : '',
          maskPath: options.withMask === true
            ? {
                d: 'M0 0 L10 0 L10 10 L0 10 Z',
                transform: undefined,
                styles
              }
            : null,
          shapes: options.withShape === true ? [shape as any] : []
        }))
      }
    ]
  }
}

async function testFacadeEventsAndParserWorker (): Promise<void> {
  installBrowserFakes()
  const { SVGAPlayer } = require('../../src/svga-player') as typeof import('../../src/svga-player')
  const canvas = new FakeCanvas() as any as HTMLCanvasElement
  const player = new SVGAPlayer({
    container: canvas,
    renderMode: 'canvas',
    parserOptions: {
      isDisableWebWorker: false,
      isDisableImageBitmapShim: false
    }
  })
  if (false) {
    // @ts-expect-error constructor requires an options object
    new SVGAPlayer(canvas)
    // @ts-expect-error setConfig is playback-only and does not accept init fields
    player.setConfig({ container: canvas })
  }
  const events: string[] = []
  const offStart = player.on('start', () => events.push('start'))
  player.on('process', payload => events.push(`process:${payload.currentFrame}`))
  player.on('error', (error, errorType, blocking) => {
    events.push(`error:${error.message}:${errorType}:${blocking ? 'blocking' : 'non-blocking'}`)
  })

  await assert.rejects(async () => await player.play(), /load\('default'\) is required/)
  assert.ok(events.some(event => event.includes(':play:blocking')))

  const loadPromise = player.load('https://example.com/fake.svga')
  await nextMicrotask()
  assert.equal(parserWorkerPosts.length, 1)
  assert.equal(parserWorkerPosts[0].url, 'https://example.com/fake.svga')
  resolveNextParserLoad()
  await loadPromise

  await player.play()
  assert.ok(events.includes('start'))

  offStart()
  player.stop()
  events.length = 0
  await player.play()
  assert.ok(!events.includes('start'))
  player.destroy()
}

async function testKeyedLoadPreparePlayAndSwitch (): Promise<void> {
  installBrowserFakes()
  const { SVGAPlayer } = require('../../src/svga-player') as typeof import('../../src/svga-player')
  const player = new SVGAPlayer({
    container: new FakeCanvas() as any as HTMLCanvasElement,
    renderMode: 'canvas'
  })

  await player.load(createVideo({ withImage: true }), 'idle')
  await player.load(createVideo({ withImage: true, withShape: true }), 'gift')
  await player.prepare('idle')
  assert.equal((player as any).preparedKey, 'idle')

  await player.play('idle')
  assert.equal((player as any).activeKey, 'idle')
  await player.play('gift')
  assert.equal((player as any).activeKey, 'gift')
  assert.equal((player as any).preparedKey, 'gift')
  player.destroy()
}

async function testParserQueueVersionAndDelete (): Promise<void> {
  installBrowserFakes()
  const { SVGAPlayer } = require('../../src/svga-player') as typeof import('../../src/svga-player')
  const player = new SVGAPlayer({
    container: new FakeCanvas() as any as HTMLCanvasElement,
    renderMode: 'canvas'
  })

  const first = player.load('https://example.com/a.svga', 'gift')
  const second = player.load('https://example.com/b.svga', 'gift')
  await nextMicrotask()
  assert.equal(parserWorkerPosts.length, 1)
  resolveNextParserLoad(createVideo({ withImage: true }))
  await first
  assert.equal((player as any).slots.has('gift'), false)
  await nextMicrotask()
  assert.equal(parserWorkerPosts.length, 2)
  resolveNextParserLoad(createVideo({ withImage: true, withShape: true }))
  await second
  assert.equal((player as any).slots.get('gift').video.sprites[0].frames[0].shapes.length, 1)

  const failed = player.load('https://example.com/fail.svga', 'bad')
  await nextMicrotask()
  assert.equal(parserWorkerPosts.length, 3)
  resolveNextParserLoad(new Error('parse failed'))
  await assert.rejects(async () => await failed, /parse failed/)

  const recovered = player.load('https://example.com/recovered.svga', 'ok')
  await nextMicrotask()
  assert.equal(parserWorkerPosts.length, 4)
  resolveNextParserLoad(createVideo({ withImage: true }))
  await recovered
  assert.equal((player as any).slots.has('ok'), true)

  const deleted = player.load('https://example.com/delete.svga', 'deleted')
  await nextMicrotask()
  assert.equal(parserWorkerPosts.length, 5)
  player.delete('deleted')
  resolveNextParserLoad(createVideo({ withImage: true }))
  await deleted
  assert.equal((player as any).slots.has('deleted'), false)
  player.destroy()
}

async function testReplaceDeleteAndCache (): Promise<void> {
  installBrowserFakes()
  const { SVGAPlayer } = require('../../src/svga-player') as typeof import('../../src/svga-player')
  const player = new SVGAPlayer({
    container: new FakeCanvas() as any as HTMLCanvasElement,
    renderMode: 'canvas',
    isCacheFrames: true
  })
  const video = createVideo({ withImage: true })
  const image = new FakeImage() as any as HTMLImageElement
  const canvas = new FakeCanvas() as any as HTMLCanvasElement
  const inserted: Array<[IDBValidKey, Video]> = []
  const db = {
    insert: async (id: IDBValidKey, data: Video) => {
      inserted.push([id, data])
    }
  }

  await player.load(video, 'gift')
  await player.prepare('gift')
  player.replace('image', image, { key: 'gift' })
  player.replace('banner', canvas, { key: 'gift', mode: 'dynamic' })
  await nextMicrotask()
  assert.equal(video.replaceElements.image, image)
  assert.equal(video.dynamicElements.banner, canvas)
  assert.equal((player as any).slots.get('gift').dirty, false)

  await player.cache(db as any, { key: 'gift', id: 'gift.svga' })
  assert.equal(inserted[0][0], 'gift.svga')
  assert.equal(inserted[0][1], video)

  await player.play('gift')
  player.delete('gift')
  assert.equal((player as any).slots.has('gift'), false)
  assert.equal((player as any).activeKey, null)
  assert.equal((player as any).preparedKey, null)
  player.delete('missing')
  player.destroy()
}

async function testDeleteDuringPrepareDoesNotRestorePreparedState (): Promise<void> {
  installBrowserFakes()
  const { SVGAPlayer } = require('../../src/svga-player') as typeof import('../../src/svga-player')
  const player = new SVGAPlayer({
    container: new FakeCanvas() as any as HTMLCanvasElement,
    renderMode: 'canvas'
  })
  const video = createVideo({ withImage: true })
  video.images.image = 'base64'

  await player.load(video, 'gift')
  const preparing = player.prepare('gift')
  player.delete('gift')
  await preparing
  assert.equal((player as any).preparedKey, null)
  assert.equal((player as any).slots.has('gift'), false)
  player.destroy()
}

async function testPublicEntrySurface (): Promise<void> {
  installBrowserFakes()
  const entry = require('../../src/index') as Record<string, unknown>
  const removedExports = [
    'Parser',
    'Player',
    'CompiledAnimation',
    'FrameRenderCommand',
    'CompiledResources',
    'RenderCapabilities',
    'RenderMode'
  ]

  assert.equal(typeof entry.SVGAPlayer, 'function')
  assert.equal(entry.default, entry.SVGAPlayer)
  assert.equal(typeof entry.DB, 'function')
  removedExports.forEach(name => {
    assert.equal(Object.prototype.hasOwnProperty.call(entry, name), false)
  })
}

async function testCompilerMetadata (): Promise<void> {
  installBrowserFakes()
  const {
    diffRenderCapabilities,
    RenderCompiler,
    createWebGLRenderCapabilities
  } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const compiler = new RenderCompiler()
  const animation = compiler.compile(createVideo({
    withImage: true,
    withDynamicElement: true,
    withShape: true,
    withHole: true,
    withMask: true,
    withDash: true,
    withUnsupportedPath: true
  }))

  assert.equal(animation.frames.length, 3)
  assert.equal(animation.frames[0][0].type, 'sprite')
  assert.equal(animation.requiredCapabilities.texture.static, true)
  assert.equal(animation.requiredCapabilities.texture.dynamic, true)
  assert.equal(animation.requiredCapabilities.shape.path.fill, true)
  assert.equal(animation.requiredCapabilities.shape.path.stroke, true)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.width, true)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineDash, true)
  assert.equal(animation.requiredCapabilities.masks, true)
  assert.equal(animation.diagnostics.unsupportedPathCommands.length > 0, true)

  assert.equal(
    diffRenderCapabilities(animation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.path.fill'),
    true
  )
  assert.equal(
    diffRenderCapabilities(animation.requiredCapabilities, createWebGLRenderCapabilities()).includes('texture.static'),
    false
  )

  const firstGeometryId = animation.frames[0][0].shapes[0].geometryId
  const secondGeometryId = animation.frames[1][0].shapes[0].geometryId
  assert.equal(firstGeometryId, secondGeometryId)
  assert.equal(animation.geometries[firstGeometryId].type, 'path')

  const rectAnimation = new RenderCompiler().compile(createVideo({ withShape: true, shapeType: 'rect' }))
  const roundedRectAnimation = new RenderCompiler().compile(createVideo({ withShape: true, shapeType: 'roundedRect' }))
  const ellipseAnimation = new RenderCompiler().compile(createVideo({ withShape: true, shapeType: 'ellipse' }))
  assert.equal(rectAnimation.requiredCapabilities.shape.rect.fill, true)
  assert.equal(roundedRectAnimation.requiredCapabilities.shape.roundedRect.fill, true)
  assert.equal(ellipseAnimation.requiredCapabilities.shape.ellipse.fill, true)
}

async function testBackendResolver (): Promise<void> {
  installBrowserFakes()
  const { createBackend } = require('../../src/player/backend') as typeof import('../../src/player/backend')

  const canvasBackend = createBackend(new FakeCanvas() as any as HTMLCanvasElement, 'canvas')
  assert.equal(canvasBackend.type, 'canvas')
  assert.equal(canvasBackend.capabilities.shape.path.fill, true)
  assert.equal(canvasBackend.capabilities.masks, true)

  const webglBackend = createBackend(new FakeCanvas() as any as HTMLCanvasElement, 'webgl')
  assert.equal(webglBackend.type, 'webgl')
  assert.equal(webglBackend.capabilities.texture.static, true)
  assert.equal(webglBackend.capabilities.texture.dynamic, true)
  assert.equal(webglBackend.capabilities.shape.path.fill, false)
  assert.equal(webglBackend.capabilities.masks, false)

  const autoBackend = createBackend(new FakeCanvas() as any as HTMLCanvasElement, 'auto')
  assert.equal(autoBackend.type, 'webgl')

  fakeWebGLAvailable = false
  const fallbackBackend = createBackend(new FakeCanvas() as any as HTMLCanvasElement, 'auto')
  assert.equal(fallbackBackend.type, 'canvas')

  await assert.rejects(
    async () => createBackend(new FakeCanvas() as any as HTMLCanvasElement, 'webgl'),
    /WebGL context is unavailable/
  )
}

async function testCanvasBackendRender (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const { createBackend } = require('../../src/player/backend') as typeof import('../../src/player/backend')
  const canvas = new FakeCanvas()
  const animation = new RenderCompiler().compile(createVideo({
    withImage: true,
    withShape: true,
    withMask: true
  }))
  const backend = createBackend(canvas as any as HTMLCanvasElement, 'canvas', true)
  await backend.prepare(animation)

  backend.renderFrame(animation, 0)
  assert.ok(canvas.context2d.calls.some(call => call.startsWith('drawImage')))
}

async function testWebGLBackendLifecycle (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const { createBackend } = require('../../src/player/backend') as typeof import('../../src/player/backend')
  const canvas = new FakeCanvas()
  const animation = new RenderCompiler().compile(createVideo({
    withImage: true
  }))
  const backend = createBackend(canvas as any as HTMLCanvasElement, 'webgl')
  await backend.prepare(animation)

  backend.renderFrame(animation, 0)
  const gl = canvas.webglContext
  assert.ok(gl !== null)
  const webgl = gl as FakeWebGLRenderingContext
  assert.ok(webgl.calls.includes('drawArrays'))

  const loseContext = webgl.getExtension('WEBGL_lose_context') as {
    loseContext: () => void
    restoreContext: () => void
  }
  loseContext.loseContext()
  backend.renderFrame(animation, 1)
  loseContext.restoreContext()
  await new Promise(resolve => setTimeout(resolve, 0))
  backend.renderFrame(animation, 2)
  assert.ok(webgl.calls.filter(call => call === 'drawArrays').length >= 2)

  backend.destroy()
  assert.equal((canvas.events.webglcontextlost ?? []).length, 0)
  assert.equal((canvas.events.webglcontextrestored ?? []).length, 0)

  const unsupportedAnimation = new RenderCompiler().compile(createVideo({
    withImage: true,
    withShape: true
  }))
  const unsupportedBackend = createBackend(new FakeCanvas() as any as HTMLCanvasElement, 'webgl')
  await unsupportedBackend.prepare(unsupportedAnimation)
  assert.doesNotThrow(() => unsupportedBackend.renderFrame(unsupportedAnimation, 0))

  const shapeOnlyCanvas = new FakeCanvas()
  const shapeOnlyAnimation = new RenderCompiler().compile(createVideo({
    withShape: true
  }))
  const shapeOnlyBackend = createBackend(shapeOnlyCanvas as any as HTMLCanvasElement, 'webgl')
  await shapeOnlyBackend.prepare(shapeOnlyAnimation)
  assert.doesNotThrow(() => shapeOnlyBackend.renderFrame(shapeOnlyAnimation, 0))
  assert.equal(shapeOnlyCanvas.webglContext?.calls.includes('drawArrays'), false)

  const maskedAnimation = new RenderCompiler().compile(createVideo({
    withImage: true,
    withMask: true
  }))
  const maskedCanvas = new FakeCanvas()
  const maskedBackend = createBackend(maskedCanvas as any as HTMLCanvasElement, 'webgl')
  await maskedBackend.prepare(maskedAnimation)
  assert.doesNotThrow(() => maskedBackend.renderFrame(maskedAnimation, 0))
  assert.equal(maskedCanvas.webglContext?.calls.includes('drawArrays'), true)
}

async function testUnsupportedCapabilitiesErrorAndWarning (): Promise<void> {
  installBrowserFakes()
  const {
    SVGAPlayer,
    SVGAPlayerErrorType
  } = require('../../src/svga-player') as typeof import('../../src/svga-player')
  const canvas = new FakeCanvas() as any as HTMLCanvasElement
  const player = new SVGAPlayer({
    container: canvas,
    renderMode: 'webgl'
  })
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  const errors: Array<{
    message: string
    errorType: string
    blocking: boolean
  }> = []
  player.on('error', (error, errorType, blocking) => {
    errors.push({
      message: error.message,
      errorType,
      blocking
    })
  })

  try {
    await player.load(createVideo({
      withImage: true,
      withShape: true,
      withMask: true
    }))
    await player.prepare()
  } finally {
    console.warn = originalWarn
    player.destroy()
  }

  assert.equal(warnings.length, 1)
  assert.equal(String(warnings[0][0]).includes('Unsupported parts will be skipped'), true)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].errorType, SVGAPlayerErrorType.UNSUPPORTED_CAPABILITIES)
  assert.equal(errors[0].blocking, false)
  assert.equal(errors[0].message.includes('shape.path.fill'), true)
  assert.equal(errors[0].message.includes('masks'), true)
}

async function testErrorEventTypesAndBlockingFlag (): Promise<void> {
  installBrowserFakes()
  const {
    SVGAPlayer,
    SVGAPlayerErrorType
  } = require('../../src/svga-player') as typeof import('../../src/svga-player')
  const player = new SVGAPlayer({
    container: new FakeCanvas() as any as HTMLCanvasElement,
    renderMode: 'canvas'
  })
  const errors: Array<{
    errorType: string
    blocking: boolean
  }> = []
  player.on('error', (_error, errorType, blocking) => {
    errors.push({ errorType, blocking })
  })

  assert.throws(() => player.start(), /load\('default'\) is required/)
  assert.throws(() => player.resume(), /play\(\) is required/)
  assert.throws(() => player.setConfig({ startFrame: 2, endFrame: 1 }), /StartFrame should > EndFrame/)
  await assert.rejects(async () => await player.cache({ insert: async () => {} } as any, { id: 'x' }), /load\('default'\) is required/)

  assert.deepEqual(errors.map(error => error.errorType), [
    SVGAPlayerErrorType.START,
    SVGAPlayerErrorType.RESUME,
    SVGAPlayerErrorType.CONFIG,
    SVGAPlayerErrorType.CACHE
  ])
  assert.deepEqual(errors.map(error => error.blocking), [true, true, true, true])
  player.destroy()
}

async function main (): Promise<void> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['public package entry exposes facade only', testPublicEntrySurface],
    ['facade events, state errors, parser worker, load -> async play', testFacadeEventsAndParserWorker],
    ['keyed load, prepare, play, and key switching', testKeyedLoadPreparePlayAndSwitch],
    ['parser queue, failure recovery, stale loads, and delete races', testParserQueueVersionAndDelete],
    ['replace modes, delete cleanup, and cache helper', testReplaceDeleteAndCache],
    ['delete during prepare does not restore stale prepared state', testDeleteDuringPrepareDoesNotRestorePreparedState],
    ['compiler command/capability/path/geometry metadata', testCompilerMetadata],
    ['backend resolver canvas/webgl/auto fallback', testBackendResolver],
    ['CanvasBackend render regression smoke', testCanvasBackendRender],
    ['WebGLBackend context/render/unsupported/cleanup smoke', testWebGLBackendLifecycle],
    ['unsupported capabilities error and warning', testUnsupportedCapabilitiesErrorAndWarning],
    ['error event types and blocking flag', testErrorEventTypesAndBlockingFlag]
  ]

  for (const [name, test] of tests) {
    parserWorkerPosts.length = 0
    await test()
    console.log(`ok - ${name}`)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
