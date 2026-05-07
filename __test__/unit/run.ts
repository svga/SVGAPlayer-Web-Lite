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
    setTimeout(() => this.onmessage?.({ data: createVideo({ withImage: true }) }), 0)
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
  withShape?: boolean
  withHole?: boolean
  withMask?: boolean
  withDash?: boolean
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
  const path = options.withHole === true
    ? 'M0 0 L10 0 L10 10 L0 10 Z M2 2 L8 2 L8 8 L2 8 Z'
    : 'M0 0 L10 0 L10 10 L0 10 Z'

  return {
    version: '2.0',
    size: { width: 100, height: 100 },
    fps: 20,
    frames: 3,
    images: options.withImage === true ? { image: new FakeImage() as any } : {},
    replaceElements: {},
    dynamicElements: {},
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
          shapes: options.withShape === true
            ? [
                {
                  type: SHAPE_TYPE.SHAPE,
                  path: { d: path },
                  styles,
                  transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
                }
              ]
            : []
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
  const events: string[] = []
  const offStart = player.on('start', () => events.push('start'))
  player.on('process', payload => events.push(`process:${payload.currentFrame}`))
  player.on('error', error => events.push(`error:${error.message}`))

  assert.throws(() => player.play(), /compile\(\) is required/)
  assert.ok(events.some(event => event.startsWith('error:')))

  const video = await player.parse('https://example.com/fake.svga')
  assert.equal(parserWorkerPosts.length, 1)
  assert.equal(parserWorkerPosts[0].url, 'https://example.com/fake.svga')
  assert.equal(video.frames, 3)

  await player.compile()
  player.play()
  assert.ok(events.includes('start'))

  offStart()
  player.stop()
  events.length = 0
  player.play()
  assert.ok(!events.includes('start'))
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
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const compiler = new RenderCompiler()
  const result = await compiler.compile(createVideo({
    withShape: true,
    withHole: true,
    withMask: true,
    withDash: true
  }), new FakeCanvas() as any as HTMLCanvasElement, {
    renderMode: 'canvas'
  })

  assert.equal(result.animation.frames.length, 3)
  assert.equal(result.animation.frames[0][0].type, 'sprite')
  assert.equal(result.animation.requiredCapabilities.shapeFill, true)
  assert.equal(result.animation.requiredCapabilities.shapeFillHoles, true)
  assert.equal(result.animation.requiredCapabilities.shapeStroke, true)
  assert.equal(result.animation.requiredCapabilities.lineDash, true)
  assert.equal(result.animation.requiredCapabilities.masks, true)

  const firstGeometryId = result.animation.frames[0][0].shapes[0].geometryId
  const secondGeometryId = result.animation.frames[1][0].shapes[0].geometryId
  assert.equal(firstGeometryId, secondGeometryId)
  assert.equal(result.animation.geometries[firstGeometryId].type, 'path')
}

async function testBackendResolver (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')

  const imageOnly = createVideo({ withImage: true })
  const canvasResult = await new RenderCompiler().compile(imageOnly, new FakeCanvas() as any as HTMLCanvasElement, {
    renderMode: 'canvas'
  })
  assert.equal(canvasResult.animation.backendType, 'canvas')

  const webglResult = await new RenderCompiler().compile(imageOnly, new FakeCanvas() as any as HTMLCanvasElement, {
    renderMode: 'webgl'
  })
  assert.equal(webglResult.animation.backendType, 'webgl')

  const autoResult = await new RenderCompiler().compile(imageOnly, new FakeCanvas() as any as HTMLCanvasElement, {
    renderMode: 'auto'
  })
  assert.equal(autoResult.animation.backendType, 'webgl')

  const fallbackResult = await new RenderCompiler().compile(createVideo({
    withImage: true,
    withShape: true
  }), new FakeCanvas() as any as HTMLCanvasElement, {
    renderMode: 'auto'
  })
  assert.equal(fallbackResult.animation.backendType, 'canvas')

  await assert.rejects(
    async () => await new RenderCompiler().compile(createVideo({
      withImage: true,
      withShape: true
    }), new FakeCanvas() as any as HTMLCanvasElement, {
      renderMode: 'webgl'
    }),
    /Missing capabilities/
  )
}

async function testCanvasBackendRender (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const canvas = new FakeCanvas()
  const result = await new RenderCompiler().compile(createVideo({
    withImage: true,
    withShape: true,
    withMask: true
  }), canvas as any as HTMLCanvasElement, {
    renderMode: 'canvas',
    isCacheFrames: true
  })

  result.backend.renderFrame(result.animation, 0)
  assert.ok(canvas.context2d.calls.some(call => call.startsWith('drawImage')))
}

async function testWebGLBackendLifecycle (): Promise<void> {
  installBrowserFakes()
  const { RenderCompiler } = require('../../src/player/compiler') as typeof import('../../src/player/compiler')
  const canvas = new FakeCanvas()
  const result = await new RenderCompiler().compile(createVideo({
    withImage: true
  }), canvas as any as HTMLCanvasElement, {
    renderMode: 'webgl'
  })

  result.backend.renderFrame(result.animation, 0)
  const gl = canvas.webglContext
  assert.ok(gl !== null)
  const webgl = gl as FakeWebGLRenderingContext
  assert.ok(webgl.calls.includes('drawArrays'))

  const loseContext = webgl.getExtension('WEBGL_lose_context') as {
    loseContext: () => void
    restoreContext: () => void
  }
  loseContext.loseContext()
  result.backend.renderFrame(result.animation, 1)
  loseContext.restoreContext()
  await new Promise(resolve => setTimeout(resolve, 0))
  result.backend.renderFrame(result.animation, 2)
  assert.ok(webgl.calls.filter(call => call === 'drawArrays').length >= 2)

  result.backend.destroy()
  assert.equal((canvas.events.webglcontextlost ?? []).length, 0)
  assert.equal((canvas.events.webglcontextrestored ?? []).length, 0)

  await assert.rejects(
    async () => await new RenderCompiler().compile(createVideo({
      withImage: true,
      withShape: true
    }), new FakeCanvas() as any as HTMLCanvasElement, {
      renderMode: 'webgl'
    }),
    /Missing capabilities/
  )
}

async function main (): Promise<void> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['public package entry exposes facade only', testPublicEntrySurface],
    ['facade events, state errors, parser worker, parse -> compile -> play', testFacadeEventsAndParserWorker],
    ['compiler command/capability/path/geometry metadata', testCompilerMetadata],
    ['backend resolver canvas/webgl/auto fallback', testBackendResolver],
    ['CanvasBackend render regression smoke', testCanvasBackendRender],
    ['WebGLBackend context/render/unsupported/cleanup smoke', testWebGLBackendLifecycle]
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
