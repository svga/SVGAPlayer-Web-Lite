import { vi } from 'vitest'

import { getPlayerContext } from '../../../src/player/context'
import type { Animator } from '../../../src/player/animator'
import type { Video } from '../../../src/types'

export class FakeContext2D {
  public readonly clearRect = vi.fn()
  public readonly drawImage = vi.fn()
  public readonly save = vi.fn()
  public readonly restore = vi.fn()
  public readonly transform = vi.fn()
  public readonly clip = vi.fn()
  public readonly beginPath = vi.fn()
  public readonly fill = vi.fn()
  public readonly stroke = vi.fn()
  public readonly setLineDash = vi.fn()
  public globalAlpha = 1
}

export class FakeCanvas {
  private canvasWidth = 300
  private canvasHeight = 150
  public widthWrites = 0
  public heightWrites = 0
  public readonly context = new FakeContext2D()
  public readonly toDataURL = vi.fn(() => 'data:image/png;base64,cached')

  public get width(): number {
    return this.canvasWidth
  }
  public set width(value: number) {
    this.canvasWidth = value
    this.widthWrites++
  }

  public get height(): number {
    return this.canvasHeight
  }
  public set height(value: number) {
    this.canvasHeight = value
    this.heightWrites++
  }

  public getContext(): FakeContext2D {
    return this.context
  }
}

export class FakeImage {
  public onload: (() => void) | null = null
  public onerror: (() => void) | null = null
  public width = 1
  public height = 1
  public currentSrc = ''
  public readonly removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.currentSrc = ''
  })

  public set src(value: string) {
    this.currentSrc = value
    environment.pendingImages.push(this)
  }
}

export class FakeImageBitmap {
  public readonly close = vi.fn()

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {}
}

export class FakeIntersectionObserver {
  public readonly disconnect = vi.fn()
  public readonly observedSizes: Array<[number, number]> = []
  public readonly observe = vi.fn((target: Element) => {
    const canvas = target as unknown as FakeCanvas
    this.observedSizes.push([canvas.width, canvas.height])
    const implementation = environment.observeImplementation
    if (implementation) implementation(target)
  })

  constructor(public readonly callback: IntersectionObserverCallback) {
    environment.observers.push(this)
  }
}

export const environment = {
  pendingImages: [] as FakeImage[],
  observers: [] as FakeIntersectionObserver[],
  observeImplementation: undefined as ((target: Element) => void) | undefined,
  rafCallbacks: new Map<number, FrameRequestCallback>(),
  rafRequests: [] as number[],
  rafCancellations: [] as number[],
  nextRafId: 1,
  now: 0,
}

export function requestAnimationFrame(callback: FrameRequestCallback): number {
  const id = environment.nextRafId++
  environment.rafCallbacks.set(id, callback)
  environment.rafRequests.push(id)
  return id
}

export function cancelAnimationFrame(id: number): void {
  environment.rafCallbacks.delete(id)
  environment.rafCancellations.push(id)
}

export function resetPlayerEnvironment(): void {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  environment.pendingImages.length = 0
  environment.observers.length = 0
  environment.rafCallbacks.clear()
  environment.rafRequests = []
  environment.rafCancellations = []
  environment.nextRafId = 1
  environment.now = 0
  environment.observeImplementation = undefined
  vi.stubGlobal('HTMLCanvasElement', FakeCanvas)
  vi.stubGlobal('HTMLImageElement', FakeImage)
  vi.stubGlobal('ImageBitmap', FakeImageBitmap)
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.stubGlobal('document', {
    createElement: (tagName: string) => (tagName === 'img' ? new FakeImage() : new FakeCanvas()),
  })
  vi.stubGlobal('performance', { now: () => environment.now })
  vi.stubGlobal('window', {
    IntersectionObserver: FakeIntersectionObserver,
    OffscreenCanvas: undefined,
    navigator: { userAgent: 'Vitest' },
    performance: { now: () => environment.now },
    requestAnimationFrame,
    cancelAnimationFrame,
    URL: globalThis.URL,
  })
  vi.stubGlobal('createImageBitmap', undefined)
}

export type TestInternals = {
  __svgaFrames: Record<string, FakeImageBitmap>
  __svgaCanvas: FakeCanvas
  __svgaVisible: boolean
  __svgaAnimator: Animator
  __svgaState: string
}

export function internal(player: object): TestInternals {
  return getPlayerContext(player) as unknown as TestInternals
}

export function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    version: '2.0',
    size: { width: 300, height: 150 },
    fps: 10,
    frames: 4,
    images: Object.create(null) as Video['images'],
    replaceElements: Object.create(null) as Video['replaceElements'],
    dynamicElements: Object.create(null) as Video['dynamicElements'],
    sprites: [],
    ...overrides,
  }
}

export function runRaf(requestId: number, timestamp: number): void {
  const callback = environment.rafCallbacks.get(requestId)
  environment.rafCallbacks.delete(requestId)
  environment.now = timestamp
  callback?.(timestamp)
}

export interface RuntimeCapture {
  map?: WeakMap<object, unknown>
  player?: object
}

export function captureConstructorFailure(
  PlayerClass: abstract new (...args: never[]) => object,
  create: () => void,
  capture: RuntimeCapture,
): unknown {
  const set = WeakMap.prototype.set
  let didThrow = false
  let thrown: unknown
  WeakMap.prototype.set = function (key: object, value: unknown): WeakMap<object, unknown> {
    if (key instanceof PlayerClass) {
      capture.map = this as WeakMap<object, unknown>
      capture.player = key
    }
    return set.call(this, key, value)
  }
  try {
    create()
  } catch (error) {
    didThrow = true
    thrown = error
  } finally {
    WeakMap.prototype.set = set
  }
  if (!didThrow) throw new Error('constructor did not throw')
  return thrown
}
