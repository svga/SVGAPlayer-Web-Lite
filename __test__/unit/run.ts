import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import { Root } from 'protobufjs'
import SVGA_PROTO from '../../src/parser/svga-proto'
import { VideoEntity } from '../../src/parser/video-entity'
import {
  Movie,
  PLAYER_FILL_MODE,
  PLAYER_PLAY_MODE,
  SHAPE_TYPE,
  Transform,
  Video
} from '../../src/types'

type Listener = (event: Event) => void
type TestRgba = `rgba(${number}, ${number}, ${number}, ${number})`

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
  public getAttribLocation (_program: WebGLProgram, name: string): number {
    return name === 'a_texCoord' ? 2 : 1
  }
  public getUniformLocation (): WebGLUniformLocation { return {} as WebGLUniformLocation }
  public bindBuffer (): void {}
  public bufferData (_target: number, data: BufferSource): void {
    this.calls.push(`bufferData:${data.byteLength}`)
  }
  public viewport (): void {}
  public useProgram (): void {}
  public enable (): void {}
  public blendFunc (): void {}
  public uniform2f (): void {}
  public clearColor (): void {}
  public clear (): void {}
  public bindTexture (): void {}
  public enableVertexAttribArray (): void {}
  public disableVertexAttribArray (): void { this.calls.push('disableVertexAttribArray') }
  public vertexAttribPointer (): void {}
  public uniformMatrix3fv (_location: WebGLUniformLocation, _transpose: boolean, value: Float32List): void {
    this.calls.push(`uniformMatrix3fv:${Array.from(value).join(',')}`)
  }
  public uniform1f (): void {}
  public uniform4f (
    _location: WebGLUniformLocation,
    red: number,
    green: number,
    blue: number,
    alpha: number
  ): void {
    this.calls.push('uniform4f')
    this.calls.push(`uniform4f:${red},${green},${blue},${alpha}`)
  }
  public drawArrays (_mode: number, _first: number, count: number): void {
    this.calls.push('drawArrays')
    this.calls.push(`drawArrays:${count}`)
  }
  public createTexture (): WebGLTexture { return {} as WebGLTexture }
  public deleteTexture (): void { this.calls.push('deleteTexture') }
  public texParameteri (): void {}
  public pixelStorei (): void {}
  public texImage2D (): void { this.calls.push('texImage2D') }
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

function decodeMovieFixture (fixturePath: string): Movie {
  const message = Root.fromJSON(SVGA_PROTO).lookupType('com.opensource.svga.MovieEntity')
  const buffer = fs.readFileSync(fixturePath)
  return message.decode(zlib.inflateSync(buffer)) as unknown as Movie
}

function loadRectFillFixtureVideo (): Video {
  const fixturePath = path.resolve(process.cwd(), '__test__/svga/rect-fill.svga')
  return new VideoEntity(decodeMovieFixture(fixturePath), {})
}

function loadRectStrokeFixtureVideo (): Video {
  const fixturePath = path.resolve(process.cwd(), '__test__/svga/rect-stroke.svga')
  return new VideoEntity(decodeMovieFixture(fixturePath), {})
}

function loadRoundedRectFillFixtureVideo (): Video {
  const fixturePath = path.resolve(process.cwd(), '__test__/svga/rounded-rect-fill.svga')
  return new VideoEntity(decodeMovieFixture(fixturePath), {})
}

function loadRoundedRectStrokeFixtureVideo (): Video {
  const fixturePath = path.resolve(process.cwd(), '__test__/svga/rounded-rect-stroke.svga')
  return new VideoEntity(decodeMovieFixture(fixturePath), {})
}

function loadEllipseFillFixtureVideo (): Video {
  const fixturePath = path.resolve(process.cwd(), '__test__/svga/ellipse-fill.svga')
  return new VideoEntity(decodeMovieFixture(fixturePath), {})
}

function loadEllipseStrokeFixtureVideo (): Video {
  const fixturePath = path.resolve(process.cwd(), '__test__/svga/ellipse-stroke.svga')
  return new VideoEntity(decodeMovieFixture(fixturePath), {})
}

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
  withStroke?: boolean
  withoutFill?: boolean
  strokeWidth?: number
  cornerRadius?: number
  withLineCap?: boolean
  withLineJoin?: boolean
  withMiterLimit?: boolean
  withUnsupportedPath?: boolean
  alpha?: number
  spriteTransform?: Transform
  shapeTransform?: Transform
  fillColor?: TestRgba
  strokeColor?: TestRgba
  ellipseRadiusX?: number
  ellipseRadiusY?: number
} = {}): Video {
  const hasStroke = options.withDash === true || options.withStroke === true
  const styles = {
    fill: options.withoutFill === true ? null : options.fillColor ?? 'rgba(255, 0, 0, 1)' as const,
    stroke: hasStroke ? options.strokeColor ?? 'rgba(0, 0, 0, 1)' as const : null,
    strokeWidth: hasStroke ? options.strokeWidth ?? 2 : null,
    lineCap: options.withLineCap === true ? 'round' as const : null,
    lineJoin: options.withLineJoin === true ? 'round' as const : null,
    miterLimit: options.withMiterLimit === true ? 4 : null,
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
        path: {
          x: 0,
          y: 0,
          radiusX: options.ellipseRadiusX ?? 10,
          radiusY: options.ellipseRadiusY ?? 8
        },
        styles,
        transform: options.shapeTransform ?? { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
      }
    : shapeType === 'rect' || shapeType === 'roundedRect'
      ? {
          type: SHAPE_TYPE.RECT,
          path: {
            x: 0,
            y: 0,
            width: 10,
            height: 12,
            cornerRadius: shapeType === 'roundedRect' ? options.cornerRadius ?? 4 : 0
          },
          styles,
          transform: options.shapeTransform ?? { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
        }
      : {
          type: SHAPE_TYPE.SHAPE,
          path: { d: path },
          styles,
          transform: options.shapeTransform ?? { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
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
          alpha: options.alpha ?? 1,
          transform: options.spriteTransform ?? { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
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

  const loadPromise = player.load({ source: 'https://example.com/fake.svga' })
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

  await player.load({ source: createVideo({ withImage: true }), key: 'idle' })
  await player.load({ source: createVideo({ withImage: true, withShape: true }), key: 'gift' })
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

  const first = player.load({ source: 'https://example.com/a.svga', key: 'gift' })
  const second = player.load({ source: 'https://example.com/b.svga', key: 'gift' })
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

  const failed = player.load({ source: 'https://example.com/fail.svga', key: 'bad' })
  await nextMicrotask()
  assert.equal(parserWorkerPosts.length, 3)
  resolveNextParserLoad(new Error('parse failed'))
  await assert.rejects(async () => await failed, /parse failed/)

  const recovered = player.load({ source: 'https://example.com/recovered.svga', key: 'ok' })
  await nextMicrotask()
  assert.equal(parserWorkerPosts.length, 4)
  resolveNextParserLoad(createVideo({ withImage: true }))
  await recovered
  assert.equal((player as any).slots.has('ok'), true)

  const deleted = player.load({ source: 'https://example.com/delete.svga', key: 'deleted' })
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
  const {
    SVGAPlayer,
    setSVGAPlayerCacheStoreLoaderForTest
  } = require('../../src/svga-player') as typeof import('../../src/svga-player')
  const player = new SVGAPlayer({
    container: new FakeCanvas() as any as HTMLCanvasElement,
    renderMode: 'canvas',
    isCacheFrames: true
  })
  const video = createVideo({ withImage: true })
  const image = new FakeImage() as any as HTMLImageElement
  const icon = new FakeImage() as any as HTMLImageElement
  const canvas = new FakeCanvas() as any as HTMLCanvasElement
  const inserted: Array<[IDBValidKey, Video]> = []
  const db = {
    insert: async (id: IDBValidKey, data: Video) => {
      inserted.push([id, data])
    }
  }

  await player.load({ source: video, key: 'gift' })
  await player.prepare('gift')
  player.replace({ key: 'gift', element: { image, icon } })
  player.replace({ key: 'gift', mode: 'dynamic', element: { banner: canvas } })
  await nextMicrotask()
  assert.equal(video.replaceElements.image, image)
  assert.equal(video.replaceElements.icon, icon)
  assert.equal(video.dynamicElements.banner, canvas)
  assert.equal((player as any).slots.get('gift').dirty, false)

  setSVGAPlayerCacheStoreLoaderForTest(async () => db)
  await player.cache({ key: 'gift', id: 'gift.svga' })
  setSVGAPlayerCacheStoreLoaderForTest(null)
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

  await player.load({ source: video, key: 'gift' })
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
    'RenderMode',
    'DB'
  ]

  assert.equal(typeof entry.SVGAPlayer, 'function')
  assert.equal(entry.default, entry.SVGAPlayer)
  assert.equal(typeof (entry.SVGAPlayer as any).prototype.snapshot, 'function')
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
  assert.equal(
    diffRenderCapabilities(rectAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.rect.fill'),
    false
  )
  assert.equal(
    diffRenderCapabilities(roundedRectAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.roundedRect.fill'),
    false
  )
  assert.equal(
    diffRenderCapabilities(ellipseAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.ellipse.fill'),
    false
  )
}

async function testRectFillFixtureDecodeAndCompile (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const video = loadRectFillFixtureVideo()
  const shape = video.sprites[0].frames[0].shapes[0]
  assert.equal(Object.keys(video.images).length, 0)
  assert.equal(shape.type, SHAPE_TYPE.RECT)
  if (shape.type !== SHAPE_TYPE.RECT) throw new Error('rect-fill fixture did not decode a RECT shape')
  assert.equal(shape.path.cornerRadius, 0)
  assert.equal(shape.styles.fill, 'rgba(255, 0, 0, 1)')
  assert.equal(shape.styles.stroke, null)
  assert.equal(shape.styles.strokeWidth, null)
  assert.equal(shape.styles.lineCap, null)
  assert.equal(shape.styles.lineJoin, null)
  assert.equal(shape.styles.miterLimit, null)

  const animation = new RenderCompiler().compile(video)
  assert.equal(animation.requiredCapabilities.shape.rect.fill, true)
  assert.equal(animation.requiredCapabilities.shape.rect.stroke, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.width, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineCap, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineJoin, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.miterLimit, false)
}

async function testRectStrokeFixtureDecodeAndCompile (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const video = loadRectStrokeFixtureVideo()
  const shape = video.sprites[0].frames[0].shapes[0]
  assert.equal(Object.keys(video.images).length, 0)
  assert.equal(shape.type, SHAPE_TYPE.RECT)
  if (shape.type !== SHAPE_TYPE.RECT) throw new Error('rect-stroke fixture did not decode a RECT shape')
  assert.equal(shape.path.cornerRadius, 0)
  assert.equal(shape.styles.fill, null)
  assert.equal(shape.styles.stroke, 'rgba(0, 0, 0, 1)')
  assert.equal(shape.styles.strokeWidth, 10)
  assert.equal(shape.styles.lineCap, null)
  assert.equal(shape.styles.lineJoin, null)
  assert.equal(shape.styles.miterLimit, null)
  assert.deepEqual(shape.styles.lineDash, [])

  const animation = new RenderCompiler().compile(video)
  assert.equal(animation.requiredCapabilities.shape.rect.fill, false)
  assert.equal(animation.requiredCapabilities.shape.rect.stroke, true)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.width, true)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineCap, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineJoin, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.miterLimit, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineDash, false)
}

async function testRoundedRectFillFixtureDecodeAndCompile (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const video = loadRoundedRectFillFixtureVideo()
  const shape = video.sprites[0].frames[0].shapes[0]
  assert.equal(Object.keys(video.images).length, 0)
  assert.equal(shape.type, SHAPE_TYPE.RECT)
  if (shape.type !== SHAPE_TYPE.RECT) throw new Error('rounded-rect-fill fixture did not decode a RECT shape')
  assert.equal(shape.path.cornerRadius > 0, true)
  assert.equal(shape.styles.fill, 'rgba(0, 114, 255, 1)')
  assert.equal(shape.styles.stroke, null)
  assert.equal(shape.styles.strokeWidth, null)
  assert.equal(shape.styles.lineCap, null)
  assert.equal(shape.styles.lineJoin, null)
  assert.equal(shape.styles.miterLimit, null)

  const animation = new RenderCompiler().compile(video)
  assert.equal(animation.requiredCapabilities.shape.roundedRect.fill, true)
  assert.equal(animation.requiredCapabilities.shape.roundedRect.stroke, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.width, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineCap, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineJoin, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.miterLimit, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineDash, false)
}

async function testRoundedRectStrokeFixtureDecodeAndCompile (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const video = loadRoundedRectStrokeFixtureVideo()
  const shape = video.sprites[0].frames[0].shapes[0]
  assert.equal(Object.keys(video.images).length, 0)
  assert.equal(shape.type, SHAPE_TYPE.RECT)
  if (shape.type !== SHAPE_TYPE.RECT) throw new Error('rounded-rect-stroke fixture did not decode a RECT shape')
  assert.equal(shape.path.cornerRadius > 0, true)
  assert.equal(shape.styles.fill, null)
  assert.equal(shape.styles.stroke, 'rgba(0, 0, 0, 1)')
  assert.equal(shape.styles.strokeWidth, 10)
  assert.equal(shape.styles.lineCap, null)
  assert.equal(shape.styles.lineJoin, null)
  assert.equal(shape.styles.miterLimit, null)
  assert.deepEqual(shape.styles.lineDash, [])

  const animation = new RenderCompiler().compile(video)
  assert.equal(animation.requiredCapabilities.shape.roundedRect.fill, false)
  assert.equal(animation.requiredCapabilities.shape.roundedRect.stroke, true)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.width, true)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineCap, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineJoin, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.miterLimit, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineDash, false)
}

async function testEllipseFillFixtureDecodeAndCompile (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const video = loadEllipseFillFixtureVideo()
  const shape = video.sprites[0].frames[0].shapes[0]
  assert.equal(Object.keys(video.images).length, 0)
  assert.equal(shape.type, SHAPE_TYPE.ELLIPSE)
  if (shape.type !== SHAPE_TYPE.ELLIPSE) throw new Error('ellipse-fill fixture did not decode an ELLIPSE shape')
  assert.equal(shape.path.radiusX > 0, true)
  assert.equal(shape.path.radiusY > 0, true)
  assert.equal(shape.styles.fill, 'rgba(51, 216, 89, 1)')
  assert.equal(shape.styles.stroke, null)
  assert.equal(shape.styles.strokeWidth, null)
  assert.equal(shape.styles.lineCap, null)
  assert.equal(shape.styles.lineJoin, null)
  assert.equal(shape.styles.miterLimit, null)

  const animation = new RenderCompiler().compile(video)
  assert.equal(animation.requiredCapabilities.shape.ellipse.fill, true)
  assert.equal(animation.requiredCapabilities.shape.ellipse.stroke, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.width, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineCap, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineJoin, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.miterLimit, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineDash, false)
}

async function testEllipseStrokeFixtureDecodeAndCompile (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const video = loadEllipseStrokeFixtureVideo()
  const shape = video.sprites[0].frames[0].shapes[0]
  assert.equal(Object.keys(video.images).length, 0)
  assert.equal(shape.type, SHAPE_TYPE.ELLIPSE)
  if (shape.type !== SHAPE_TYPE.ELLIPSE) throw new Error('ellipse-stroke fixture did not decode an ELLIPSE shape')
  assert.equal(shape.path.radiusX > 0, true)
  assert.equal(shape.path.radiusY > 0, true)
  assert.equal(shape.styles.fill, null)
  assert.equal(shape.styles.stroke, 'rgba(0, 0, 0, 1)')
  assert.equal(shape.styles.strokeWidth, 8)
  assert.equal(shape.styles.lineCap, null)
  assert.equal(shape.styles.lineJoin, null)
  assert.equal(shape.styles.miterLimit, null)
  assert.deepEqual(shape.styles.lineDash, [])

  const animation = new RenderCompiler().compile(video)
  assert.equal(animation.requiredCapabilities.shape.ellipse.fill, false)
  assert.equal(animation.requiredCapabilities.shape.ellipse.stroke, true)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.width, true)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineCap, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineJoin, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.miterLimit, false)
  assert.equal(animation.requiredCapabilities.shape.strokeStyle.lineDash, false)
}

async function testBackendResolver (): Promise<void> {
  installBrowserFakes()
  const { createBackend } = require('../../src/player/backend') as typeof import('../../src/player/backend')

  const canvasBackend = createBackend(new FakeCanvas() as any as HTMLCanvasElement, 'canvas')
  assert.equal(canvasBackend.type, 'canvas')
  assert.equal(canvasBackend.capabilities.shape.path.fill, true)
  assert.equal(canvasBackend.capabilities.masks, true)
  assert.equal(canvasBackend.capabilities.snapshot, true)

  const webglBackend = createBackend(new FakeCanvas() as any as HTMLCanvasElement, 'webgl')
  assert.equal(webglBackend.type, 'webgl')
  assert.equal(webglBackend.capabilities.texture.static, true)
  assert.equal(webglBackend.capabilities.texture.dynamic, true)
  assert.equal(webglBackend.capabilities.shape.rect.fill, true)
  assert.equal(webglBackend.capabilities.shape.rect.stroke, true)
  assert.equal(webglBackend.capabilities.shape.roundedRect.fill, true)
  assert.equal(webglBackend.capabilities.shape.roundedRect.stroke, true)
  assert.equal(webglBackend.capabilities.shape.ellipse.fill, true)
  assert.equal(webglBackend.capabilities.shape.ellipse.stroke, true)
  assert.equal(webglBackend.capabilities.shape.path.fill, false)
  assert.equal(webglBackend.capabilities.shape.path.stroke, false)
  assert.equal(webglBackend.capabilities.shape.strokeStyle.width, true)
  assert.equal(webglBackend.capabilities.shape.strokeStyle.lineCap, false)
  assert.equal(webglBackend.capabilities.shape.strokeStyle.lineJoin, false)
  assert.equal(webglBackend.capabilities.shape.strokeStyle.miterLimit, false)
  assert.equal(webglBackend.capabilities.shape.strokeStyle.lineDash, false)
  assert.equal(webglBackend.capabilities.masks, false)
  assert.equal(webglBackend.capabilities.snapshot, true)

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

async function testPlayerSnapshot (): Promise<void> {
  installBrowserFakes()
  const { SVGAPlayer } = require('../../src/svga-player') as typeof import('../../src/svga-player')

  const canvas = new FakeCanvas() as any as HTMLCanvasElement
  const canvasPlayer = new SVGAPlayer({
    container: canvas,
    renderMode: 'canvas'
  })
  await canvasPlayer.load({ source: createVideo({ withImage: true }) })
  await canvasPlayer.prepare()
  assert.equal(canvasPlayer.snapshot(), canvas)
  canvasPlayer.destroy()

  const webglCanvas = new FakeCanvas() as any as HTMLCanvasElement
  const webglPlayer = new SVGAPlayer({
    container: webglCanvas,
    renderMode: 'webgl'
  })
  await webglPlayer.load({ source: createVideo({ withImage: true }) })
  await webglPlayer.play()
  const activeKey = (webglPlayer as any).activeKey
  const preparedKey = (webglPlayer as any).preparedKey
  const currentFrame = webglPlayer.currentFrame
  const snapshot = webglPlayer.snapshot()
  assert.equal(snapshot, webglCanvas)
  assert.equal((webglPlayer as any).activeKey, activeKey)
  assert.equal((webglPlayer as any).preparedKey, preparedKey)
  assert.equal(webglPlayer.currentFrame, currentFrame)
  webglPlayer.stop()
  webglPlayer.destroy()

  const unsupportedCanvas = new FakeCanvas() as any as HTMLCanvasElement
  const unsupportedPlayer = new SVGAPlayer({
    container: unsupportedCanvas,
    renderMode: 'canvas'
  })
  ;(unsupportedPlayer as any).backend.snapshot = undefined
  assert.equal(unsupportedPlayer.snapshot(), null)
  unsupportedPlayer.destroy()
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

  const pathOnlyCanvas = new FakeCanvas()
  const pathOnlyAnimation = new RenderCompiler().compile(createVideo({
    withShape: true
  }))
  const pathOnlyBackend = createBackend(pathOnlyCanvas as any as HTMLCanvasElement, 'webgl')
  await pathOnlyBackend.prepare(pathOnlyAnimation)
  assert.doesNotThrow(() => pathOnlyBackend.renderFrame(pathOnlyAnimation, 0))
  assert.equal(pathOnlyCanvas.webglContext?.calls.includes('drawArrays'), false)

  const rectOnlyCanvas = new FakeCanvas()
  const rectOnlyAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'rect'
  }))
  const rectOnlyBackend = createBackend(rectOnlyCanvas as any as HTMLCanvasElement, 'webgl')
  await rectOnlyBackend.prepare(rectOnlyAnimation)
  assert.doesNotThrow(() => rectOnlyBackend.renderFrame(rectOnlyAnimation, 0))
  assert.equal(rectOnlyCanvas.webglContext?.calls.includes('drawArrays'), true)
  assert.equal(rectOnlyCanvas.webglContext?.calls.includes('uniform4f'), true)
  assert.equal(rectOnlyCanvas.webglContext?.calls.includes('disableVertexAttribArray'), true)

  const strokeOnlyCanvas = new FakeCanvas()
  const strokeOnlyAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'rect',
    withStroke: true,
    withoutFill: true
  }))
  const strokeOnlyBackend = createBackend(strokeOnlyCanvas as any as HTMLCanvasElement, 'webgl')
  await strokeOnlyBackend.prepare(strokeOnlyAnimation)
  assert.doesNotThrow(() => strokeOnlyBackend.renderFrame(strokeOnlyAnimation, 0))
  assert.equal(strokeOnlyCanvas.webglContext?.calls.includes('drawArrays:24'), true)

  const fillStrokeCanvas = new FakeCanvas()
  const fillStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'rect',
    withStroke: true
  }))
  const fillStrokeBackend = createBackend(fillStrokeCanvas as any as HTMLCanvasElement, 'webgl')
  await fillStrokeBackend.prepare(fillStrokeAnimation)
  assert.doesNotThrow(() => fillStrokeBackend.renderFrame(fillStrokeAnimation, 0))
  const solidDraws = fillStrokeCanvas.webglContext?.calls.filter(call => call.startsWith('drawArrays:')) ?? []
  assert.deepEqual(solidDraws.slice(-2), ['drawArrays:6', 'drawArrays:24'])

  const dashedRectCanvas = new FakeCanvas()
  const dashedRectAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'rect',
    withDash: true,
    withoutFill: true
  }))
  const dashedRectBackend = createBackend(dashedRectCanvas as any as HTMLCanvasElement, 'webgl')
  await dashedRectBackend.prepare(dashedRectAnimation)
  assert.doesNotThrow(() => dashedRectBackend.renderFrame(dashedRectAnimation, 0))
  assert.equal(dashedRectCanvas.webglContext?.calls.includes('drawArrays'), false)

  const degenerateStrokeCanvas = new FakeCanvas()
  const degenerateStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'rect',
    withStroke: true,
    withoutFill: true,
    strokeWidth: 20
  }))
  const degenerateStrokeBackend = createBackend(degenerateStrokeCanvas as any as HTMLCanvasElement, 'webgl')
  await degenerateStrokeBackend.prepare(degenerateStrokeAnimation)
  assert.doesNotThrow(() => degenerateStrokeBackend.renderFrame(degenerateStrokeAnimation, 0))
  assert.equal(degenerateStrokeCanvas.webglContext?.calls.includes('drawArrays'), false)

  const roundedRectOnlyCanvas = new FakeCanvas()
  const roundedRectOnlyAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'roundedRect'
  }))
  const roundedRectOnlyBackend = createBackend(roundedRectOnlyCanvas as any as HTMLCanvasElement, 'webgl')
  await roundedRectOnlyBackend.prepare(roundedRectOnlyAnimation)
  assert.doesNotThrow(() => roundedRectOnlyBackend.renderFrame(roundedRectOnlyAnimation, 0))
  assert.equal(roundedRectOnlyCanvas.webglContext?.calls.includes('drawArrays'), true)

  const roundedStrokeOnlyCanvas = new FakeCanvas()
  const roundedStrokeOnlyAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'roundedRect',
    withStroke: true,
    withoutFill: true
  }))
  const roundedStrokeOnlyBackend = createBackend(roundedStrokeOnlyCanvas as any as HTMLCanvasElement, 'webgl')
  await roundedStrokeOnlyBackend.prepare(roundedStrokeOnlyAnimation)
  assert.doesNotThrow(() => roundedStrokeOnlyBackend.renderFrame(roundedStrokeOnlyAnimation, 0))
  assert.equal(roundedStrokeOnlyCanvas.webglContext?.calls.includes('drawArrays'), true)

  const roundedFillStrokeCanvas = new FakeCanvas()
  const roundedFillStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'roundedRect',
    withStroke: true
  }))
  const roundedFillStrokeBackend = createBackend(roundedFillStrokeCanvas as any as HTMLCanvasElement, 'webgl')
  await roundedFillStrokeBackend.prepare(roundedFillStrokeAnimation)
  assert.doesNotThrow(() => roundedFillStrokeBackend.renderFrame(roundedFillStrokeAnimation, 0))
  const roundedSolidDraws = roundedFillStrokeCanvas.webglContext?.calls.filter(call => call.startsWith('drawArrays:')) ?? []
  assert.equal(roundedSolidDraws.length >= 2, true)
  assert.equal(roundedSolidDraws[roundedSolidDraws.length - 2] < roundedSolidDraws[roundedSolidDraws.length - 1], true)

  const clampedRoundedCanvas = new FakeCanvas()
  const clampedRoundedAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'roundedRect',
    cornerRadius: 100
  }))
  const clampedRoundedBackend = createBackend(clampedRoundedCanvas as any as HTMLCanvasElement, 'webgl')
  await clampedRoundedBackend.prepare(clampedRoundedAnimation)
  assert.doesNotThrow(() => clampedRoundedBackend.renderFrame(clampedRoundedAnimation, 0))
  assert.equal(clampedRoundedCanvas.webglContext?.calls.includes('drawArrays'), true)

  const degenerateRoundedStrokeCanvas = new FakeCanvas()
  const degenerateRoundedStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'roundedRect',
    withStroke: true,
    withoutFill: true,
    strokeWidth: 20
  }))
  const degenerateRoundedStrokeBackend = createBackend(degenerateRoundedStrokeCanvas as any as HTMLCanvasElement, 'webgl')
  await degenerateRoundedStrokeBackend.prepare(degenerateRoundedStrokeAnimation)
  assert.doesNotThrow(() => degenerateRoundedStrokeBackend.renderFrame(degenerateRoundedStrokeAnimation, 0))
  assert.equal(degenerateRoundedStrokeCanvas.webglContext?.calls.includes('drawArrays'), false)

  const dashedRoundedCanvas = new FakeCanvas()
  const dashedRoundedAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'roundedRect',
    withDash: true,
    withoutFill: true
  }))
  const dashedRoundedBackend = createBackend(dashedRoundedCanvas as any as HTMLCanvasElement, 'webgl')
  await dashedRoundedBackend.prepare(dashedRoundedAnimation)
  assert.doesNotThrow(() => dashedRoundedBackend.renderFrame(dashedRoundedAnimation, 0))
  assert.equal(dashedRoundedCanvas.webglContext?.calls.includes('drawArrays'), false)

  const joinedRoundedCanvas = new FakeCanvas()
  const joinedRoundedAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'roundedRect',
    withStroke: true,
    withoutFill: true,
    withLineJoin: true
  }))
  const joinedRoundedBackend = createBackend(joinedRoundedCanvas as any as HTMLCanvasElement, 'webgl')
  await joinedRoundedBackend.prepare(joinedRoundedAnimation)
  assert.doesNotThrow(() => joinedRoundedBackend.renderFrame(joinedRoundedAnimation, 0))
  assert.equal(joinedRoundedCanvas.webglContext?.calls.includes('drawArrays'), false)

  const ellipseOnlyCanvas = new FakeCanvas()
  const ellipseOnlyAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse'
  }))
  const ellipseOnlyBackend = createBackend(ellipseOnlyCanvas as any as HTMLCanvasElement, 'webgl')
  await ellipseOnlyBackend.prepare(ellipseOnlyAnimation)
  assert.doesNotThrow(() => ellipseOnlyBackend.renderFrame(ellipseOnlyAnimation, 0))
  assert.equal(ellipseOnlyCanvas.webglContext?.calls.includes('drawArrays:48'), true)
  assert.equal(ellipseOnlyCanvas.webglContext?.calls.includes('texImage2D'), false)

  const ellipseStrokeOnlyCanvas = new FakeCanvas()
  const ellipseStrokeOnlyAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withStroke: true,
    withoutFill: true
  }))
  const ellipseStrokeOnlyBackend = createBackend(ellipseStrokeOnlyCanvas as any as HTMLCanvasElement, 'webgl')
  await ellipseStrokeOnlyBackend.prepare(ellipseStrokeOnlyAnimation)
  assert.doesNotThrow(() => ellipseStrokeOnlyBackend.renderFrame(ellipseStrokeOnlyAnimation, 0))
  assert.equal(ellipseStrokeOnlyCanvas.webglContext?.calls.includes('drawArrays:96'), true)
  assert.equal(ellipseStrokeOnlyCanvas.webglContext?.calls.includes('texImage2D'), false)

  const ellipseFillStrokeCanvas = new FakeCanvas()
  const ellipseFillStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withStroke: true
  }))
  const ellipseFillStrokeBackend = createBackend(ellipseFillStrokeCanvas as any as HTMLCanvasElement, 'webgl')
  await ellipseFillStrokeBackend.prepare(ellipseFillStrokeAnimation)
  assert.doesNotThrow(() => ellipseFillStrokeBackend.renderFrame(ellipseFillStrokeAnimation, 0))
  const ellipseSolidDraws = ellipseFillStrokeCanvas.webglContext?.calls.filter(call => call.startsWith('drawArrays:')) ?? []
  assert.deepEqual(ellipseSolidDraws.slice(-2), ['drawArrays:48', 'drawArrays:96'])

  const ellipseAlphaColorCanvas = new FakeCanvas()
  const ellipseAlphaColorAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withStroke: true,
    alpha: 0.5,
    fillColor: 'rgba(128, 64, 32, 0.25)',
    strokeColor: 'rgba(10, 20, 30, 0.75)'
  }))
  const ellipseAlphaColorBackend = createBackend(ellipseAlphaColorCanvas as any as HTMLCanvasElement, 'webgl')
  await ellipseAlphaColorBackend.prepare(ellipseAlphaColorAnimation)
  assert.doesNotThrow(() => ellipseAlphaColorBackend.renderFrame(ellipseAlphaColorAnimation, 0))
  const ellipseColors = ellipseAlphaColorCanvas.webglContext?.calls
    .filter(call => call.startsWith('uniform4f:'))
    .map(call => call.slice('uniform4f:'.length).split(',').map(Number)) ?? []
  assert.equal(ellipseColors.length >= 2, true)
  assert.deepEqual(ellipseColors[ellipseColors.length - 2], [128 / 255, 64 / 255, 32 / 255, 0.125])
  assert.deepEqual(ellipseColors[ellipseColors.length - 1], [10 / 255, 20 / 255, 30 / 255, 0.375])

  const ellipseTransformCanvas = new FakeCanvas()
  const ellipseTransformAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    spriteTransform: { a: 2, b: 0, c: 0, d: 3, tx: 5, ty: 7 },
    shapeTransform: { a: 1, b: 0, c: 0, d: 1, tx: 11, ty: 13 }
  }))
  const ellipseTransformBackend = createBackend(ellipseTransformCanvas as any as HTMLCanvasElement, 'webgl')
  await ellipseTransformBackend.prepare(ellipseTransformAnimation)
  assert.doesNotThrow(() => ellipseTransformBackend.renderFrame(ellipseTransformAnimation, 0))
  assert.equal(
    ellipseTransformCanvas.webglContext?.calls.includes('uniformMatrix3fv:2,0,0,0,3,0,27,46,1'),
    true
  )

  const degenerateEllipseFillCanvas = new FakeCanvas()
  const degenerateEllipseFillAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    ellipseRadiusX: 0
  }))
  const degenerateEllipseFillBackend = createBackend(degenerateEllipseFillCanvas as any as HTMLCanvasElement, 'webgl')
  await degenerateEllipseFillBackend.prepare(degenerateEllipseFillAnimation)
  assert.doesNotThrow(() => degenerateEllipseFillBackend.renderFrame(degenerateEllipseFillAnimation, 0))
  assert.equal(degenerateEllipseFillCanvas.webglContext?.calls.includes('drawArrays'), false)

  const degenerateEllipseStrokeCanvas = new FakeCanvas()
  const degenerateEllipseStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withStroke: true,
    withoutFill: true,
    strokeWidth: 20
  }))
  const degenerateEllipseStrokeBackend = createBackend(degenerateEllipseStrokeCanvas as any as HTMLCanvasElement, 'webgl')
  await degenerateEllipseStrokeBackend.prepare(degenerateEllipseStrokeAnimation)
  assert.doesNotThrow(() => degenerateEllipseStrokeBackend.renderFrame(degenerateEllipseStrokeAnimation, 0))
  assert.equal(degenerateEllipseStrokeCanvas.webglContext?.calls.includes('drawArrays'), false)

  const unparseableEllipseFillCanvas = new FakeCanvas()
  const unparseableEllipseFillAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    fillColor: 'not-a-color' as TestRgba
  }))
  const unparseableEllipseFillBackend = createBackend(unparseableEllipseFillCanvas as any as HTMLCanvasElement, 'webgl')
  await unparseableEllipseFillBackend.prepare(unparseableEllipseFillAnimation)
  assert.doesNotThrow(() => unparseableEllipseFillBackend.renderFrame(unparseableEllipseFillAnimation, 0))
  assert.equal(unparseableEllipseFillCanvas.webglContext?.calls.includes('drawArrays'), false)

  const dashedEllipseCanvas = new FakeCanvas()
  const dashedEllipseAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withDash: true,
    withoutFill: true
  }))
  const dashedEllipseBackend = createBackend(dashedEllipseCanvas as any as HTMLCanvasElement, 'webgl')
  await dashedEllipseBackend.prepare(dashedEllipseAnimation)
  assert.doesNotThrow(() => dashedEllipseBackend.renderFrame(dashedEllipseAnimation, 0))
  assert.equal(dashedEllipseCanvas.webglContext?.calls.includes('drawArrays'), false)

  const joinedEllipseCanvas = new FakeCanvas()
  const joinedEllipseAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withStroke: true,
    withoutFill: true,
    withLineJoin: true
  }))
  const joinedEllipseBackend = createBackend(joinedEllipseCanvas as any as HTMLCanvasElement, 'webgl')
  await joinedEllipseBackend.prepare(joinedEllipseAnimation)
  assert.doesNotThrow(() => joinedEllipseBackend.renderFrame(joinedEllipseAnimation, 0))
  assert.equal(joinedEllipseCanvas.webglContext?.calls.includes('drawArrays'), false)

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
    await player.load({ source: createVideo({
      withImage: true,
      withShape: true,
      withMask: true
    }) })
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

async function testRoundedRectFixturesDoNotWarnInWebGL (): Promise<void> {
  installBrowserFakes()
  const { SVGAPlayer } = require('../../src/svga-player') as typeof import('../../src/svga-player')
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }

  const player = new SVGAPlayer({
    container: new FakeCanvas() as any as HTMLCanvasElement,
    renderMode: 'webgl'
  })

  try {
    await player.load({ source: loadRoundedRectFillFixtureVideo(), key: 'fill' })
    await player.prepare('fill')
    await player.load({ source: loadRoundedRectStrokeFixtureVideo(), key: 'stroke' })
    await player.prepare('stroke')
    await player.load({ source: loadEllipseFillFixtureVideo(), key: 'ellipse-fill' })
    await player.prepare('ellipse-fill')
    await player.load({ source: loadEllipseStrokeFixtureVideo(), key: 'ellipse-stroke' })
    await player.prepare('ellipse-stroke')
  } finally {
    console.warn = originalWarn
    player.destroy()
  }

  assert.equal(warnings.length, 0)
}

async function testUnsupportedStrokeCapabilities (): Promise<void> {
  installBrowserFakes()
  const {
    diffRenderCapabilities,
    RenderCompiler,
    createWebGLRenderCapabilities
  } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')

  const dashedRectAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'rect',
    withDash: true,
    withoutFill: true
  }))
  const roundedRectStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'roundedRect',
    withStroke: true,
    withoutFill: true
  }))
  const roundedRectJoinedStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'roundedRect',
    withStroke: true,
    withoutFill: true,
    withLineJoin: true
  }))
  const ellipseStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withStroke: true,
    withoutFill: true
  }))
  const dashedEllipseAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withDash: true,
    withoutFill: true
  }))
  const ellipseJoinedStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withStroke: true,
    withoutFill: true,
    withLineJoin: true
  }))
  const ellipseCappedStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withStroke: true,
    withoutFill: true,
    withLineCap: true
  }))
  const ellipseMiterStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    shapeType: 'ellipse',
    withStroke: true,
    withoutFill: true,
    withMiterLimit: true
  }))
  const pathStrokeAnimation = new RenderCompiler().compile(createVideo({
    withShape: true,
    withStroke: true,
    withoutFill: true
  }))

  assert.deepEqual(
    diffRenderCapabilities(dashedRectAnimation.requiredCapabilities, createWebGLRenderCapabilities()),
    ['shape.strokeStyle.lineDash']
  )
  assert.equal(
    diffRenderCapabilities(roundedRectStrokeAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.roundedRect.stroke'),
    false
  )
  assert.equal(
    diffRenderCapabilities(ellipseStrokeAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.ellipse.stroke'),
    false
  )
  assert.deepEqual(
    diffRenderCapabilities(dashedEllipseAnimation.requiredCapabilities, createWebGLRenderCapabilities()),
    ['shape.strokeStyle.lineDash']
  )
  assert.equal(
    diffRenderCapabilities(roundedRectJoinedStrokeAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.strokeStyle.lineJoin'),
    true
  )
  assert.equal(
    diffRenderCapabilities(ellipseJoinedStrokeAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.strokeStyle.lineJoin'),
    true
  )
  assert.equal(
    diffRenderCapabilities(ellipseCappedStrokeAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.strokeStyle.lineCap'),
    true
  )
  assert.equal(
    diffRenderCapabilities(ellipseMiterStrokeAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.strokeStyle.miterLimit'),
    true
  )
  assert.equal(
    diffRenderCapabilities(pathStrokeAnimation.requiredCapabilities, createWebGLRenderCapabilities()).includes('shape.path.stroke'),
    true
  )
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
  await assert.rejects(async () => await player.cache({ id: 'x' }), /load\('default'\) is required/)

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
    ['rect-fill fixture decodes and compiles cleanly', testRectFillFixtureDecodeAndCompile],
    ['rect-stroke fixture decodes and compiles cleanly', testRectStrokeFixtureDecodeAndCompile],
    ['rounded-rect-fill fixture decodes and compiles cleanly', testRoundedRectFillFixtureDecodeAndCompile],
    ['rounded-rect-stroke fixture decodes and compiles cleanly', testRoundedRectStrokeFixtureDecodeAndCompile],
    ['ellipse-fill fixture decodes and compiles cleanly', testEllipseFillFixtureDecodeAndCompile],
    ['ellipse-stroke fixture decodes and compiles cleanly', testEllipseStrokeFixtureDecodeAndCompile],
    ['backend resolver canvas/webgl/auto fallback', testBackendResolver],
    ['CanvasBackend render regression smoke', testCanvasBackendRender],
    ['player snapshot returns current backend surface', testPlayerSnapshot],
    ['WebGLBackend context/render/unsupported/cleanup smoke', testWebGLBackendLifecycle],
    ['unsupported capabilities error and warning', testUnsupportedCapabilitiesErrorAndWarning],
    ['rounded-rect and ellipse fixtures do not warn in WebGL', testRoundedRectFixturesDoNotWarnInWebGL],
    ['unsupported stroke capabilities stay precise', testUnsupportedStrokeCapabilities],
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
