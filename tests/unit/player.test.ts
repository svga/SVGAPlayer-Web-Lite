import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerConfigOptions, Video } from '../../src/types'
import { Animator } from '../../src/player/animator'

class FakeContext2D {
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

class FakeCanvas {
  private canvasWidth = 300
  private canvasHeight = 150
  public widthWrites = 0
  public heightWrites = 0
  public readonly context = new FakeContext2D()
  public readonly toDataURL = vi.fn(() => 'data:image/png;base64,cached')

  public get width (): number { return this.canvasWidth }
  public set width (value: number) {
    this.canvasWidth = value
    this.widthWrites++
  }

  public get height (): number { return this.canvasHeight }
  public set height (value: number) {
    this.canvasHeight = value
    this.heightWrites++
  }

  public getContext (): FakeContext2D { return this.context }
}

class FakeImage {
  public onload: (() => void) | null = null
  public onerror: (() => void) | null = null
  public width = 1
  public height = 1
  public currentSrc = ''
  public readonly removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.currentSrc = ''
  })

  public set src (value: string) {
    this.currentSrc = value
    pendingImages.push(this)
  }
}

class FakeImageBitmap {
  public readonly close = vi.fn()

  constructor (
    public readonly width: number,
    public readonly height: number
  ) {}
}

class FakeIntersectionObserver {
  public readonly disconnect = vi.fn()
  public readonly observedSizes: Array<[number, number]> = []
  public readonly observe = vi.fn((target: Element) => {
    const canvas = target as unknown as FakeCanvas
    this.observedSizes.push([canvas.width, canvas.height])
    if (observeImplementation) observeImplementation(target)
  })

  constructor (public readonly callback: IntersectionObserverCallback) {
    observers.push(this)
  }
}

const pendingImages: FakeImage[] = []
const observers: FakeIntersectionObserver[] = []
let observeImplementation: ((target: Element) => void) | undefined
const rafCallbacks = new Map<number, FrameRequestCallback>()
let rafRequests: number[] = []
let rafCancellations: number[] = []
let nextRafId = 1
let now = 0

function requestAnimationFrame (callback: FrameRequestCallback): number {
  const id = nextRafId++
  rafCallbacks.set(id, callback)
  rafRequests.push(id)
  return id
}

function cancelAnimationFrame (id: number): void {
  rafCallbacks.delete(id)
  rafCancellations.push(id)
}

vi.stubGlobal('HTMLCanvasElement', FakeCanvas)
vi.stubGlobal('HTMLImageElement', FakeImage)
vi.stubGlobal('ImageBitmap', FakeImageBitmap)
vi.stubGlobal('Image', FakeImage)
vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
vi.stubGlobal('document', {
  createElement: (tagName: string) => tagName === 'img' ? new FakeImage() : new FakeCanvas()
})
vi.stubGlobal('performance', { now: () => now })
vi.stubGlobal('window', {
  IntersectionObserver: FakeIntersectionObserver,
  OffscreenCanvas: undefined,
  navigator: { userAgent: 'Vitest' },
  performance: { now: () => now },
  requestAnimationFrame,
  cancelAnimationFrame,
  URL: globalThis.URL
})

let Player: typeof import('../../src/player/index')['Player']

beforeAll(async () => {
  Player = (await import('../../src/player/index')).Player
})

function makeVideo (overrides: Partial<Video> = {}): Video {
  return {
    version: '2.0',
    size: { width: 300, height: 150 },
    fps: 10,
    frames: 4,
    images: Object.create(null) as Video['images'],
    replaceElements: Object.create(null) as Video['replaceElements'],
    dynamicElements: Object.create(null) as Video['dynamicElements'],
    sprites: [],
    ...overrides
  }
}

function runRaf (requestId: number, timestamp: number): void {
  const callback = rafCallbacks.get(requestId)
  rafCallbacks.delete(requestId)
  now = timestamp
  callback?.(timestamp)
}

interface RuntimeCapture {
  map?: WeakMap<object, unknown>
  player?: object
}

function captureConstructorFailure (create: () => void, capture: RuntimeCapture): unknown {
  const set = WeakMap.prototype.set
  let didThrow = false
  let thrown: unknown
  WeakMap.prototype.set = function (key: object, value: unknown): WeakMap<object, unknown> {
    if (key instanceof Player) {
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

describe('Player configuration and visibility observer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    pendingImages.length = 0
    observers.length = 0
    rafCallbacks.clear()
    rafRequests = []
    rafCancellations = []
    nextRafId = 1
    now = 0
    observeImplementation = undefined
    vi.stubGlobal('HTMLCanvasElement', FakeCanvas)
    vi.stubGlobal('HTMLImageElement', FakeImage)
    vi.stubGlobal('ImageBitmap', FakeImageBitmap)
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    vi.stubGlobal('document', {
      createElement: (tagName: string) => tagName === 'img' ? new FakeImage() : new FakeCanvas()
    })
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('window', {
      IntersectionObserver: FakeIntersectionObserver,
      OffscreenCanvas: undefined,
      navigator: { userAgent: 'Vitest' },
      performance: { now: () => now },
      requestAnimationFrame,
      cancelAnimationFrame,
      URL: globalThis.URL
    })
  })

  it('removes its runtime and stops its Animator when constructor config validation fails', () => {
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}

    const error = captureConstructorFailure(() => {
      new Player({ startFrame: -1 })
    }, capture)

    expect(error).toMatchObject({ message: 'frame' })
    expect(stop).toHaveBeenCalledOnce()
    expect(capture.map?.has(capture.player as object)).toBe(false)
    stop.mockRestore()
  })

  it('disconnects its observer, closes owned cache, and removes its runtime when observe throws', () => {
    const expected = new Error('observe failed')
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}
    const owned = new FakeImageBitmap(1, 1)
    observeImplementation = () => {
      const cache = (capture.player as unknown as { __svgaFrames: Record<string, FakeImageBitmap> }).__svgaFrames
      cache.owned = owned
      throw expected
    }

    const error = captureConstructorFailure(() => {
      new Player({ isUseIntersectionObserver: true })
    }, capture)
    observeImplementation = undefined

    expect(error).toBe(expected)
    expect(stop).toHaveBeenCalledOnce()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(owned.close).toHaveBeenCalledOnce()
    expect(capture.map?.has(capture.player as object)).toBe(false)
    stop.mockRestore()
  })

  it('falls back to an HTML canvas when OffscreenCanvas construction throws', () => {
    vi.stubGlobal('window', {
      ...window,
      OffscreenCanvas: class {
        constructor () { throw new Error('OffscreenCanvas failed') }
      }
    })

    const player = new Player({ isUseIntersectionObserver: true })
    expect((player as unknown as { __svgaCanvas: unknown }).__svgaCanvas).toBeInstanceOf(FakeCanvas)
    expect(observers[0].disconnect).not.toHaveBeenCalled()
  })

  it('does not dispatch a no-op destroy override while cleaning a config failure', () => {
    class NoopDestroyPlayer extends Player {
      public override destroy (): void {}
    }
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}

    const error = captureConstructorFailure(() => {
      new NoopDestroyPlayer({ startFrame: -1 })
    }, capture)

    expect(error).toMatchObject({ message: 'frame' })
    expect(stop).toHaveBeenCalledOnce()
    expect(capture.map?.has(capture.player as object)).toBe(false)
    stop.mockRestore()
  })

  it('preserves a setConfig override error when destroy is overridden to throw', () => {
    const expected = new Error('setConfig failed')
    const cleanupError = new Error('overridden destroy failed')
    class ThrowingHooksPlayer extends Player {
      public override setConfig (_options: PlayerConfigOptions): void { throw expected }
      public override destroy (): void { throw cleanupError }
    }
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}

    const error = captureConstructorFailure(() => {
      new ThrowingHooksPlayer({})
    }, capture)

    expect(error).toBe(expected)
    expect(stop).toHaveBeenCalledOnce()
    expect(capture.map?.has(capture.player as object)).toBe(false)
    stop.mockRestore()
  })

  it('preserves an observer error when destroy is overridden to throw', () => {
    const expected = new Error('observe failed')
    const cleanupError = new Error('overridden destroy failed')
    class ThrowingDestroyPlayer extends Player {
      public override destroy (): void { throw cleanupError }
    }
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}
    const owned = new FakeImageBitmap(1, 1)
    observeImplementation = () => {
      const cache = (capture.player as unknown as { __svgaFrames: Record<string, FakeImageBitmap> }).__svgaFrames
      cache.owned = owned
      throw expected
    }

    const error = captureConstructorFailure(() => {
      new ThrowingDestroyPlayer({ isUseIntersectionObserver: true })
    }, capture)
    observeImplementation = undefined

    expect(error).toBe(expected)
    expect(stop).toHaveBeenCalledOnce()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(owned.close).toHaveBeenCalledOnce()
    expect(capture.map?.has(capture.player as object)).toBe(false)
    stop.mockRestore()
  })

  it('falls back when OffscreenCanvas has no usable 2D context', () => {
    vi.stubGlobal('window', {
      ...window,
      OffscreenCanvas: class {
        public width = 1
        public height = 1
        public getContext (): null { return null }
      }
    })

    const player = new Player({})
    expect((player as unknown as { __svgaCanvas: unknown }).__svgaCanvas).toBeInstanceOf(FakeCanvas)
  })

  it('merges partial configuration without resetting unspecified values', () => {
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      loop: 3,
      startFrame: 2,
      endFrame: 7,
      loopStartFrame: 3,
      isCacheFrames: true,
      isUseIntersectionObserver: true,
      isOpenNoExecutionDelay: true
    })

    player.setConfig({ loop: 4 })

    expect(player.config).toMatchObject({
      container: canvas,
      loop: 4,
      startFrame: 2,
      endFrame: 7,
      loopStartFrame: 3,
      isCacheFrames: true,
      isUseIntersectionObserver: true,
      isOpenNoExecutionDelay: true
    })
    expect(observers).toHaveLength(1)
    expect(observers[0].disconnect).not.toHaveBeenCalled()
  })

  it('applies every valid partial option when constructed without a container', () => {
    const player = new Player({
      loop: 3,
      fillMode: 'backwards',
      playMode: 'fallbacks',
      startFrame: 1,
      endFrame: 3,
      loopStartFrame: 2,
      isCacheFrames: true,
      isUseIntersectionObserver: true,
      isOpenNoExecutionDelay: true
    })

    expect(player.config).toMatchObject({
      loop: 3,
      fillMode: 'backwards',
      playMode: 'fallbacks',
      startFrame: 1,
      endFrame: 3,
      loopStartFrame: 2,
      isCacheFrames: true,
      isUseIntersectionObserver: true,
      isOpenNoExecutionDelay: true
    })
  })

  it('ignores explicitly undefined configuration properties', () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      loop: 3,
      startFrame: 1
    })

    player.setConfig({ loop: undefined, startFrame: undefined })

    expect(player.config.loop).toBe(3)
    expect(player.config.startFrame).toBe(1)
  })

  it('ignores configuration keys that are not owned by the public config', () => {
    const player = new Player({ loop: 3 })
    const options = { loop: 4, unknown: 'unsafe' } as PlayerConfigOptions

    player.setConfig(options)

    expect(player.config.loop).toBe(4)
    expect(Object.prototype.hasOwnProperty.call(player.config, 'unknown')).toBe(false)
  })

  it('returns frozen readonly snapshots that cannot mutate private configuration', () => {
    const player = new Player({ loop: 3 })
    const first = player.config

    expect(Object.isFrozen(first)).toBe(true)
    expect(() => { (first as unknown as { loop: number }).loop = 9 }).toThrow()
    player.setConfig({ loop: 4 })

    expect(first.loop).toBe(3)
    expect(player.config.loop).toBe(4)
    expect(player.config).not.toBe(first)
  })

  it.each([
    { container: {} as HTMLCanvasElement },
    { loop: -1 },
    { loop: 1.5 },
    { loop: Number.POSITIVE_INFINITY },
    { fillMode: 'invalid' as PlayerConfigOptions['fillMode'] },
    { playMode: 'backwards' as PlayerConfigOptions['playMode'] },
    { isCacheFrames: 1 as unknown as boolean },
    { isUseIntersectionObserver: null as unknown as boolean },
    { isOpenNoExecutionDelay: 'true' as unknown as boolean }
  ] satisfies PlayerConfigOptions[])('rejects every invalid non-frame option: %j', options => {
    const player = new Player({ loop: 2 })
    const previous = player.config

    expect(() => player.setConfig(options)).toThrow()
    expect(player.config).toEqual(previous)
  })

  it.each([
    [{ startFrame: -1 }, /frame/],
    [{ endFrame: 1.5 }, /frame/],
    [{ loopStartFrame: Number.NaN }, /frame/],
    [{ startFrame: 4, endFrame: 3 }, /start>end/],
    [{ startFrame: 2, endFrame: 6, loopStartFrame: 1 }, /frame/],
    [{ startFrame: 2, endFrame: 6, loopStartFrame: 7 }, /frame/]
  ] as Array<[PlayerConfigOptions, RegExp]>)(
    'rejects invalid merged frame configuration before rebuilding the observer: %j',
    (options, message) => {
      const player = new Player({
        container: new FakeCanvas() as unknown as HTMLCanvasElement,
        startFrame: 1,
        endFrame: 8,
        loopStartFrame: 1,
        isUseIntersectionObserver: true
      })
      const previousConfig = { ...player.config }
      const observerCount = observers.length

      expect(() => player.setConfig(options)).toThrow(message)
      expect(player.config).toEqual(previousConfig)
      expect(observers).toHaveLength(observerCount)
    }
  )

  it('disconnects the observer and restores visible state when disabled', () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isUseIntersectionObserver: true
    })
    const observer = observers[0]
    observer.callback([{ intersectionRatio: 0 }] as IntersectionObserverEntry[], observer as unknown as IntersectionObserver)

    player.setConfig({ isUseIntersectionObserver: false })

    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect((player as unknown as { __svgaVisible: boolean }).__svgaVisible).toBe(true)
    expect(player.config.isUseIntersectionObserver).toBe(false)
  })

  it('does not replace its observer for unrelated configuration changes', () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isUseIntersectionObserver: true
    })
    const observer = observers[0]

    player.setConfig({ loop: 2 })
    observer.callback(
      [{ intersectionRatio: 0 }] as IntersectionObserverEntry[],
      observer as unknown as IntersectionObserver
    )

    expect(observers).toHaveLength(1)
    expect(observer.disconnect).not.toHaveBeenCalled()
    expect((player as unknown as { __svgaVisible: boolean }).__svgaVisible).toBe(false)
  })

  it('validates partial frame updates against the mounted video range', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    await player.mount(makeVideo({ frames: 4 }))

    expect(() => player.setConfig({ startFrame: 4 })).toThrow(/frame/)
    expect(() => player.setConfig({ loopStartFrame: 4 })).toThrow(/frame/)
  })

  it.each([true, 0, 2])('rejects a zero-length loop segment for loop %j', async loop => {
    const player = new Player({ loop })
    await player.mount(makeVideo({ frames: 4 }))

    expect(() => player.setConfig({ loopStartFrame: 3 })).toThrow(/loop/)
  })

  it('rejects a zero-length configured range while looping', () => {
    expect(() => new Player({
      loop: true,
      startFrame: 3,
      endFrame: 3,
      loopStartFrame: 3
    })).toThrow(/loop/)
  })

  it('redraws the advanced current frame immediately when visibility returns', async () => {
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      isUseIntersectionObserver: true,
      loop: false
    })
    await player.mount(makeVideo({ frames: 4, fps: 10 }))
    const observer = observers[0]
    observer.callback([{ intersectionRatio: 0 }] as IntersectionObserverEntry[], observer as unknown as IntersectionObserver)
    canvas.context.drawImage.mockClear()

    player.start()
    runRaf(rafRequests[rafRequests.length - 1], 300)
    expect(player.currentFrame).toBe(3)
    expect(canvas.context.drawImage).not.toHaveBeenCalled()
    observer.callback([{ intersectionRatio: 1 }] as IntersectionObserverEntry[], observer as unknown as IntersectionObserver)

    expect(canvas.context.drawImage).toHaveBeenCalledOnce()
  })
})

describe('Player mount and playback lifecycle', () => {
  beforeEach(() => {
    pendingImages.length = 0
    observers.length = 0
    rafCallbacks.clear()
    rafRequests = []
    rafCancellations = []
    nextRafId = 1
    now = 0
    vi.unstubAllGlobals()
    vi.stubGlobal('HTMLCanvasElement', FakeCanvas)
    vi.stubGlobal('HTMLImageElement', FakeImage)
    vi.stubGlobal('ImageBitmap', FakeImageBitmap)
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    vi.stubGlobal('document', {
      createElement: (tagName: string) => tagName === 'img' ? new FakeImage() : new FakeCanvas()
    })
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('window', {
      IntersectionObserver: FakeIntersectionObserver,
      OffscreenCanvas: undefined,
      navigator: { userAgent: 'Vitest' },
      performance: { now: () => now },
      requestAnimationFrame,
      cancelAnimationFrame,
      URL: globalThis.URL
    })
  })

  it('decodes Uint8Array images in Player and waits for every bitmap', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    let finish: ((bitmap: FakeImageBitmap) => void) | undefined
    const createImageBitmap = vi.fn(() => new Promise<FakeImageBitmap>(resolve => { finish = resolve }))
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const video = makeVideo({ images: Object.assign(Object.create(null), { delayed: Uint8Array.from([1, 2]) }) })
    let settled = false

    const mounting = player.mount(video).then(() => { settled = true })
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    finish?.(new FakeImageBitmap(10, 10))
    await mounting
    expect(player.videoEntity).toBe(video)
  })

  it('rejects broken image bytes instead of hanging', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw Error('decode failed') }))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { broken: Uint8Array.from([1]) })
    await expect(player.mount(makeVideo({ images }))).rejects.toThrow('decode failed')
    expect(player.videoEntity).toBeUndefined()
  })

  it.each([[16_777_217, 1], [4096, 4097], [0, 1]])('rejects decoded image dimensions %sx%s', async (width, height) => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => new FakeImageBitmap(width, height)))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { image: Uint8Array.from([1]) })
    await expect(player.mount(makeVideo({ images }))).rejects.toThrow('image:image')
  })

  it('allows a decoded dimension over 4096 when its total pixels remain in budget', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => new FakeImageBitmap(4097, 1)))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { image: Uint8Array.from([1]) })

    await expect(player.mount(makeVideo({ images }))).resolves.toBeUndefined()
  })

  it('stops before a third decode once two images consume the total pixel budget', async () => {
    const first = new FakeImageBitmap(4096, 4096)
    const second = new FakeImageBitmap(4096, 4096)
    const extra = new FakeImageBitmap(1, 1)
    const createImageBitmap = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(extra)
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), {
      first: Uint8Array.of(1), second: Uint8Array.of(2), extra: Uint8Array.of(3)
    })

    await expect(player.mount(makeVideo({ images }))).rejects.toThrow(/pixels/)
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
    expect(extra.close).not.toHaveBeenCalled()
    expect(createImageBitmap).toHaveBeenCalledTimes(2)
  })

  it('accepts the exact total image budget when no images remain', async () => {
    const first = new FakeImageBitmap(4096, 4096)
    const second = new FakeImageBitmap(4096, 4096)
    const createImageBitmap = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const exactImages = Object.assign(Object.create(null), {
      first: Uint8Array.of(1), second: Uint8Array.of(2)
    })

    await expect(player.mount(makeVideo({ images: exactImages }))).resolves.toBeUndefined()
    expect(createImageBitmap).toHaveBeenCalledTimes(2)
  })

  it('continues owned-image cleanup when one close operation throws', async () => {
    const first = new FakeImageBitmap(4096, 4096)
    const second = new FakeImageBitmap(4096, 4096)
    const extra = new FakeImageBitmap(1, 1)
    first.close.mockImplementation(() => { throw new Error('close failed') })
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(extra))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), {
      first: Uint8Array.of(1), second: Uint8Array.of(2), extra: Uint8Array.of(3)
    })

    await expect(player.mount(makeVideo({ images }))).rejects.toThrow('image pixels')
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
    expect(extra.close).not.toHaveBeenCalled()
  })

  it('waits for partial decode completion and closes a late bitmap after another image fails', async () => {
    let resolveLate: ((bitmap: FakeImageBitmap) => void) | undefined
    const late = new Promise<FakeImageBitmap>(resolve => { resolveLate = resolve })
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockReturnValueOnce(late)
      .mockRejectedValueOnce(new Error('broken image')))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { late: Uint8Array.of(1), broken: Uint8Array.of(2) })
    let settled = false
    const mounting = player.mount(makeVideo({ images })).finally(() => { settled = true })
    const bitmap = new FakeImageBitmap(10, 10)

    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    resolveLate?.(bitmap)
    await expect(mounting).rejects.toThrow('broken image')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('keeps fallback object URLs alive until remount and revokes each exactly once', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const revokeObjectURL = vi.fn()
    const originalWindow = window
    vi.stubGlobal('window', {
      ...originalWindow,
      URL: { createObjectURL: vi.fn(() => 'blob:owned'), revokeObjectURL }
    })
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { image: Uint8Array.of(1) })
    const mounting = player.mount(makeVideo({ images }))
    pendingImages[0].onload?.()

    await mounting
    expect(revokeObjectURL).not.toHaveBeenCalled()
    await player.mount(makeVideo())
    player.destroy()

    expect(revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('revokes a failed fallback object URL exactly once', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('window', {
      ...window,
      URL: { createObjectURL: vi.fn(() => 'blob:failed'), revokeObjectURL }
    })
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { image: Uint8Array.of(1) })
    const mounting = player.mount(makeVideo({ images }))

    pendingImages[0].onerror?.()
    pendingImages[0].onerror?.()

    await expect(mounting).rejects.toThrow('image:image')
    expect(revokeObjectURL).toHaveBeenCalledOnce()
  })

  it.each(['remount', 'destroy'] as const)(
    'settles a never-loading fallback image and revokes its URL exactly once on %s',
    async action => {
      vi.stubGlobal('createImageBitmap', undefined)
      const revokeObjectURL = vi.fn()
      vi.stubGlobal('window', {
        ...window,
        URL: { createObjectURL: vi.fn(() => 'blob:pending'), revokeObjectURL }
      })
      const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
      const images = Object.assign(Object.create(null), { pending: Uint8Array.of(1) })
      let settled = false
      const pendingMount = player.mount(makeVideo({ images })).finally(() => { settled = true })
      await vi.waitFor(() => expect(pendingImages).toHaveLength(1))
      const image = pendingImages[0]

      if (action === 'remount') await player.mount(makeVideo())
      else player.destroy()
      await expect(Promise.race([
        pendingMount,
        new Promise((_, reject) => setTimeout(() => reject(Error('mount did not settle')), 50))
      ])).resolves.toBeUndefined()

      expect(settled).toBe(true)
      expect(revokeObjectURL).toHaveBeenCalledOnce()
      expect(image.onload).toBeNull()
      expect(image.onerror).toBeNull()
      expect(image.removeAttribute).toHaveBeenCalledOnce()

      player.destroy()
      expect(revokeObjectURL).toHaveBeenCalledOnce()
    }
  )

  it('never releases caller-owned replacement or dynamic elements', async () => {
    const replacement = { close: vi.fn(), width: 1, height: 1 }
    const dynamic = { close: vi.fn(), width: 1, height: 1 }
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const video = makeVideo({
      replaceElements: Object.assign(Object.create(null), { caller: replacement as unknown as HTMLImageElement }),
      dynamicElements: Object.assign(Object.create(null), { caller: dynamic as unknown as HTMLImageElement })
    })

    await player.mount(video)
    await player.mount(makeVideo())
    player.destroy()

    expect(replacement.close).not.toHaveBeenCalled()
    expect(dynamic.close).not.toHaveBeenCalled()
  })

  it('prevents an older concurrent byte-image mount from overwriting a newer one', async () => {
    const pending: Array<(bitmap: FakeImageBitmap) => void> = []
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<FakeImageBitmap>(resolve => pending.push(resolve))))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const older = makeVideo({ images: Object.assign(Object.create(null), { old: Uint8Array.of(1) }), size: { width: 100, height: 100 } })
    const newer = makeVideo({ images: Object.assign(Object.create(null), { new: Uint8Array.of(2) }), size: { width: 200, height: 200 } })
    const olderMount = player.mount(older)
    const newerMount = player.mount(newer)
    const newerBitmap = new FakeImageBitmap(1, 1)
    const olderBitmap = new FakeImageBitmap(1, 1)
    pending[1](newerBitmap)
    await newerMount
    pending[0](olderBitmap)
    await olderMount
    expect(player.videoEntity).toBe(newer)
    expect(olderBitmap.close).toHaveBeenCalledOnce()
    expect(newerBitmap.close).not.toHaveBeenCalled()
  })

  it('revalidates configuration changed while byte-image decoding before mount commits', async () => {
    let finish: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<FakeImageBitmap>(resolve => { finish = resolve })))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { delayed: Uint8Array.of(1) })
    const mounting = player.mount(makeVideo({ frames: 2, images }))
    player.setConfig({ startFrame: 2 })
    const decoded = new FakeImageBitmap(1, 1)
    finish?.(decoded)
    await expect(mounting).rejects.toThrow(/frame/)
    expect(player.videoEntity).toBeUndefined()
    expect(decoded.close).toHaveBeenCalledOnce()
  })

  it('revalidates mutable video structure after delayed image decoding before mount commits', async () => {
    let finish: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<FakeImageBitmap>(resolve => { finish = resolve })))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const video = makeVideo({ images: Object.assign(Object.create(null), { delayed: Uint8Array.of(1) }) })
    const mounting = player.mount(video)
    await vi.waitFor(() => expect(finish).toBeDefined())
    video.size.width = 0
    video.frames = 2
    video.sprites = [{ imageKey: 'mutated', frames: [] }]
    const decoded = new FakeImageBitmap(1, 1)

    finish?.(decoded)

    await expect(mounting).rejects.toThrow(/video/)
    expect(player.videoEntity).toBeUndefined()
    expect(decoded.close).toHaveBeenCalledOnce()
  })

  it('derives the final frame range again after delayed image decoding', async () => {
    let finish: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<FakeImageBitmap>(resolve => { finish = resolve })))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const video = makeVideo({ images: Object.assign(Object.create(null), { delayed: Uint8Array.of(1) }) })
    const mounting = player.mount(video)
    await vi.waitFor(() => expect(finish).toBeDefined())
    video.frames = 2
    const decoded = new FakeImageBitmap(1, 1)
    finish?.(decoded)

    await expect(mounting).resolves.toBeUndefined()
    expect(player.videoEntity).toBe(video)
    expect(player.totalFrames).toBe(1)
  })

  it('rejects an image collection changed during delayed decoding', async () => {
    let finish: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<FakeImageBitmap>(resolve => { finish = resolve })))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const video = makeVideo({ images: Object.assign(Object.create(null), { delayed: Uint8Array.of(1) }) })
    const mounting = player.mount(video)
    await vi.waitFor(() => expect(finish).toBeDefined())
    video.images.added = Uint8Array.of(2)
    const decoded = new FakeImageBitmap(1, 1)
    finish?.(decoded)

    await expect(mounting).rejects.toThrow(/video/)
    expect(player.videoEntity).toBeUndefined()
    expect(decoded.close).toHaveBeenCalledOnce()
  })

  it('stops an active timeline when a replacement video is mounted', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    await player.mount(makeVideo())
    player.start()
    const activeRequest = rafRequests[rafRequests.length - 1]

    await player.mount(makeVideo({ frames: 2 }))

    expect(activeRequest).toBeDefined()
    expect(rafCancellations).toContain(activeRequest)
    expect(rafCallbacks).toHaveLength(0)
    expect(player.currentFrame).toBe(0)
  })

  it.each([
    [makeVideo({ size: { width: 0, height: 10 } }), /video/],
    [makeVideo({ fps: Number.NaN }), /video/],
    [makeVideo({ frames: 0 }), /video/],
    [makeVideo({ frames: 2, sprites: [{ imageKey: 'short', frames: [] }] }), /video/],
    [makeVideo({
      frames: 2,
      sprites: [{
        imageKey: 'sparse',
        frames: Array.from({ length: 2 }) as Video['sprites'][number]['frames']
      }]
    }), /video/]
  ] as Array<[Video, RegExp]>)(
    'rejects invalid manually supplied videos before rendering',
    async (video, message) => {
      const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
      await expect(player.mount(video)).rejects.toThrow(message)
      expect(player.videoEntity).toBeUndefined()
    }
  )

  it('clears with clearRect and does not reset unchanged canvas dimensions', async () => {
    const canvas = new FakeCanvas()
    const player = new Player(canvas as unknown as HTMLCanvasElement)

    await player.mount(makeVideo({ size: { width: 300, height: 150 } }))
    const offscreen = (player as unknown as { __svgaCanvas: FakeCanvas }).__svgaCanvas
    player.start()

    expect(canvas.context.clearRect).toHaveBeenCalled()
    expect(offscreen.context.clearRect).toHaveBeenCalled()
    expect(canvas.widthWrites).toBe(0)
    expect(canvas.heightWrites).toBe(0)
  })

  it('draws the configured start frame when starting a single-frame video', async () => {
    const canvas = new FakeCanvas()
    const player = new Player(canvas as unknown as HTMLCanvasElement)
    const onStart = vi.fn()
    const onEnd = vi.fn()
    player.onStart = onStart
    player.onEnd = onEnd
    await player.mount(makeVideo({ frames: 1 }))
    canvas.context.drawImage.mockClear()

    player.start()

    expect(player.currentFrame).toBe(0)
    expect(canvas.context.drawImage).toHaveBeenCalledOnce()
    expect(rafCallbacks).toHaveLength(0)
    expect(onStart).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('fires onStart before onEnd for a single-frame video', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const events: string[] = []
    player.onStart = () => events.push('start')
    player.onEnd = () => events.push('end')
    await player.mount(makeVideo({ frames: 1 }))

    player.start()

    expect(events).toEqual(['start', 'end'])
  })

  it.each(['pause', 'stop', 'destroy'] as const)(
    'lets onStart %s the Animator before the outer start can schedule',
    async action => {
      const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
      await player.mount(makeVideo())
      player.onStart = () => player[action]()

      expect(() => player.start()).not.toThrow()

      expect(rafCallbacks).toHaveLength(0)
    }
  )

  it('pauses without clearing position and resumes from the current frame', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const onPause = vi.fn()
    const onResume = vi.fn()
    player.onPause = onPause
    player.onResume = onResume
    await player.mount(makeVideo({ frames: 4, fps: 10 }))

    player.start()
    runRaf(rafRequests[rafRequests.length - 1], 100)
    expect(player.currentFrame).toBe(1)
    player.pause()
    expect(player.currentFrame).toBe(1)
    player.resume()
    runRaf(rafRequests[rafRequests.length - 1], 200)

    expect(player.currentFrame).toBe(2)
    expect(onPause).toHaveBeenCalledOnce()
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('resume keeps the original range, loop point, fill rule, and elapsed position', async () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      startFrame: 0,
      endFrame: 4,
      loopStartFrame: 2,
      loop: false,
      fillMode: 'backwards'
    })
    await player.mount(makeVideo({ frames: 5, fps: 10 }))
    player.start()
    runRaf(rafRequests[rafRequests.length - 1], 100)
    player.pause()
    player.resume()
    const animator = (player as unknown as { __svgaAnimator: Animator }).__svgaAnimator

    expect(animator.__svgaStart).toBe(0)
    expect(animator.__svgaEnd).toBe(4)
    expect(animator.__svgaDuration).toBe(400)
    expect(animator.__svgaLoopStart).toBe(200)
    expect(animator.__svgaFill).toBe(1)
    expect(animator.__svgaLoop).toBe(1)
    runRaf(rafRequests[rafRequests.length - 1], 200)
    expect(player.currentFrame).toBe(2)
  })

  it('measures a reverse loop point from the configured end frame', async () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      startFrame: 1,
      endFrame: 6,
      loopStartFrame: 2,
      loop: 2,
      playMode: 'fallbacks'
    })
    await player.mount(makeVideo({ frames: 7, fps: 10 }))
    player.start()
    const animator = (player as unknown as { __svgaAnimator: Animator }).__svgaAnimator

    expect(animator.__svgaStart).toBe(6)
    expect(animator.__svgaEnd).toBe(1)
    expect(animator.__svgaDuration).toBe(500)
    expect(animator.__svgaLoopStart).toBe(400)
  })

  it('keeps one running timeline when resume is called repeatedly', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const onResume = vi.fn()
    player.onResume = onResume
    await player.mount(makeVideo({ frames: 4, fps: 10 }))
    player.start()
    const originalRequest = rafRequests[rafRequests.length - 1]

    player.resume()

    expect(onResume).toHaveBeenCalledOnce()
    expect(rafCallbacks).toHaveLength(1)
    expect(rafCallbacks.has(originalRequest)).toBe(true)
    expect(rafCancellations).not.toContain(originalRequest)
    runRaf(originalRequest, 100)
    expect(player.currentFrame).toBe(1)
  })

  it('starts from the beginning when resumed before start', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const onResume = vi.fn()
    player.onResume = onResume
    await player.mount(makeVideo({ frames: 4, fps: 10 }))

    player.resume()
    runRaf(rafRequests[rafRequests.length - 1], 100)

    expect(player.currentFrame).toBe(1)
    expect(onResume).toHaveBeenCalledOnce()
    expect(rafCallbacks).toHaveLength(1)
  })

  it.each(['pause', 'stop', 'destroy'] as const)(
    'lets onResume %s the Animator before the outer resume can schedule',
    async action => {
      const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
      await player.mount(makeVideo())
      player.start()
      player.pause()
      player.onResume = () => player[action]()

      expect(() => player.resume()).not.toThrow()

      expect(rafCallbacks).toHaveLength(0)
    }
  )

  it('treats loop false as one pass', async () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      loop: false
    })
    await player.mount(makeVideo({ frames: 2 }))

    player.start()

    expect((player as unknown as { __svgaAnimator: Animator }).__svgaAnimator.__svgaLoop).toBe(1)
  })

  it('stop returns to the configured start frame and the next start redraws it', async () => {
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      startFrame: 1,
      endFrame: 3
    })
    const onStop = vi.fn()
    player.onStop = onStop
    await player.mount(makeVideo({ frames: 4, fps: 10 }))
    player.start()
    runRaf(rafRequests[rafRequests.length - 1], 100)
    canvas.context.drawImage.mockClear()

    player.stop()
    expect(player.currentFrame).toBe(1)
    player.start()

    expect(player.currentFrame).toBe(1)
    expect(canvas.context.drawImage).toHaveBeenCalledOnce()
    expect(onStop).toHaveBeenCalledOnce()
  })
})

describe('Player frame cache and destruction', () => {
  beforeEach(() => {
    pendingImages.length = 0
    observers.length = 0
    rafCallbacks.clear()
    rafRequests = []
    rafCancellations = []
    nextRafId = 1
    now = 0
    vi.unstubAllGlobals()
    vi.stubGlobal('HTMLCanvasElement', FakeCanvas)
    vi.stubGlobal('HTMLImageElement', FakeImage)
    vi.stubGlobal('ImageBitmap', FakeImageBitmap)
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    vi.stubGlobal('document', {
      createElement: (tagName: string) => tagName === 'img' ? new FakeImage() : new FakeCanvas()
    })
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('window', {
      IntersectionObserver: FakeIntersectionObserver,
      OffscreenCanvas: undefined,
      navigator: { userAgent: 'Vitest' },
      performance: { now: () => now },
      requestAnimationFrame,
      cancelAnimationFrame,
      URL: globalThis.URL
    })
    vi.stubGlobal('createImageBitmap', undefined)
  })

  it('uses async ImageBitmap caching, never toDataURL, and evicts over 64 MiB by LRU', async () => {
    const created: FakeImageBitmap[] = []
    vi.stubGlobal('createImageBitmap', vi.fn(async (canvas: FakeCanvas) => {
      const bitmap = new FakeImageBitmap(canvas.width, canvas.height)
      created.push(bitmap)
      return bitmap
    }))
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      loop: 1
    })
    await player.mount(makeVideo({ size: { width: 3000, height: 3000 }, frames: 2, fps: 1 }))
    const offscreen = (player as unknown as { __svgaCanvas: FakeCanvas }).__svgaCanvas

    player.start()
    await Promise.resolve()
    await Promise.resolve()
    runRaf(rafRequests[rafRequests.length - 1], 1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(created).toHaveLength(2)
    expect(created[0].close).toHaveBeenCalledOnce()
    expect(created[1].close).not.toHaveBeenCalled()
    canvas.context.drawImage.mockClear()
    ;(player as unknown as { __svgaDraw: (frame: number) => void }).__svgaDraw(1)
    expect(canvas.context.drawImage).toHaveBeenCalledWith(
      created[1], 0, 0
    )
    expect(offscreen.toDataURL).not.toHaveBeenCalled()
  })

  it('sums mixed bitmap sizes in a null-prototype 64 MiB LRU', async () => {
    const large = new FakeImageBitmap(4096, 4096)
    const tiny = new FakeImageBitmap(1, 1)
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockResolvedValueOnce(large)
      .mockResolvedValueOnce(tiny))
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      loop: 1
    })
    await player.mount(makeVideo({ size: { width: 10, height: 10 }, frames: 2, fps: 1 }))

    player.start()
    await Promise.resolve()
    await Promise.resolve()
    runRaf(rafRequests[rafRequests.length - 1], 1000)
    await Promise.resolve()
    await Promise.resolve()

    const cache = (player as unknown as { __svgaFrames: Record<string, FakeImageBitmap> }).__svgaFrames
    expect(Object.getPrototypeOf(cache)).toBeNull()
    expect(Object.keys(cache)).toEqual(['1'])
    expect(cache[1]).toBe(tiny)
    expect(large.close).toHaveBeenCalledOnce()
    expect(tiny.close).not.toHaveBeenCalled()
  })

  it('evicts and accounts for an LRU entry before best-effort close', async () => {
    const first = new FakeImageBitmap(3000, 3000)
    const second = new FakeImageBitmap(3000, 3000)
    first.close.mockImplementation(() => { throw new Error('close failed') })
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second))
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      loop: 1
    })
    await player.mount(makeVideo({ size: { width: 3000, height: 3000 }, frames: 2, fps: 1 }))

    player.start()
    await Promise.resolve()
    await Promise.resolve()
    runRaf(rafRequests[rafRequests.length - 1], 1000)
    await Promise.resolve()
    await Promise.resolve()

    const cache = (player as unknown as { __svgaFrames: Record<string, FakeImageBitmap> }).__svgaFrames
    expect(Object.keys(cache)).toEqual(['1'])
    expect(cache[1]).toBe(second)
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).not.toHaveBeenCalled()
  })

  it('closes a new async bitmap when the frame cache cannot store it and clears pending state', async () => {
    const first = new FakeImageBitmap(10, 10)
    const second = new FakeImageBitmap(10, 10)
    const createImageBitmap = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true
    })
    await player.mount(makeVideo({ size: { width: 10, height: 10 }, frames: 1 }))
    const cache = (player as unknown as { __svgaFrames: Record<string, FakeImageBitmap> }).__svgaFrames
    Object.preventExtensions(cache)

    player.start()
    await Promise.resolve()
    await Promise.resolve()
    player.start()
    await Promise.resolve()
    await Promise.resolve()

    expect(createImageBitmap).toHaveBeenCalledTimes(2)
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
    expect(Object.keys(cache)).toEqual([])
  })

  it('clears pending state in finally when rejecting an oversized bitmap whose close throws', async () => {
    const first = new FakeImageBitmap(4097, 4097)
    const second = new FakeImageBitmap(4097, 4097)
    first.close.mockImplementation(() => { throw new Error('close failed') })
    second.close.mockImplementation(() => { throw new Error('close failed') })
    const createImageBitmap = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true
    })
    await player.mount(makeVideo({ size: { width: 10, height: 10 }, frames: 1 }))

    player.start()
    await Promise.resolve()
    await Promise.resolve()
    player.start()
    await Promise.resolve()
    await Promise.resolve()

    expect(createImageBitmap).toHaveBeenCalledTimes(2)
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
  })

  it('prefers transferToImageBitmap when the offscreen canvas supports it', async () => {
    const cachedBitmap = new FakeImageBitmap(10, 10)
    const transferToImageBitmap = vi.fn(() => cachedBitmap)
    class FakeOffscreenCanvas extends FakeCanvas {
      public readonly transferToImageBitmap = transferToImageBitmap

      constructor (width: number, height: number) {
        super()
        this.width = width
        this.height = height
      }
    }
    const createBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createBitmap)
    vi.stubGlobal('window', {
      IntersectionObserver: FakeIntersectionObserver,
      OffscreenCanvas: FakeOffscreenCanvas,
      navigator: { userAgent: 'Vitest' },
      performance: { now: () => now },
      requestAnimationFrame,
      cancelAnimationFrame,
      URL: globalThis.URL
    })
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      isCacheFrames: true
    })
    await player.mount(makeVideo({ size: { width: 10, height: 10 }, frames: 1 }))

    player.start()
    player.start()

    expect(transferToImageBitmap).toHaveBeenCalledOnce()
    expect(createBitmap).not.toHaveBeenCalled()
    expect(canvas.context.drawImage).toHaveBeenCalledWith(cachedBitmap, 0, 0)
  })

  it('skips frame caching when neither ImageBitmap path is supported', async () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true
    })
    await player.mount(makeVideo({ frames: 1 }))
    const offscreen = (player as unknown as { __svgaCanvas: FakeCanvas }).__svgaCanvas

    player.start()

    expect(Object.keys((player as unknown as { __svgaFrames: object }).__svgaFrames)).toHaveLength(0)
    expect(offscreen.toDataURL).not.toHaveBeenCalled()
  })

  it('reuses one OffscreenCanvas on Firefox across every frame', async () => {
    let constructions = 0
    class FakeOffscreenCanvas extends FakeCanvas {
      constructor (width: number, height: number) {
        super()
        constructions++
        this.width = width
        this.height = height
      }
    }
    vi.stubGlobal('window', {
      ...window,
      OffscreenCanvas: FakeOffscreenCanvas,
      navigator: { userAgent: 'Firefox' }
    })
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    await player.mount(makeVideo({ frames: 2, fps: 10 }))

    player.start()
    runRaf(rafRequests[rafRequests.length - 1], 100)

    expect(constructions).toBe(1)
  })

  it('closes decoded images and owned cached frames on replacement', async () => {
    const decoded = new FakeImageBitmap(20, 20)
    const cached = new FakeImageBitmap(20, 20)
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockResolvedValueOnce(decoded)
      .mockResolvedValueOnce(cached))
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true
    })
    await player.mount(makeVideo({
      size: { width: 20, height: 20 },
      frames: 1,
      images: Object.assign(Object.create(null), { image: Uint8Array.of(1) })
    }))
    player.start()
    await Promise.resolve()
    await Promise.resolve()

    await player.mount(makeVideo({ frames: 1 }))

    expect(decoded.close).toHaveBeenCalledOnce()
    expect(cached.close).toHaveBeenCalledOnce()
  })

  it('closes cached and pending owned frames when frame caching is disabled', async () => {
    const existing = new FakeImageBitmap(20, 20)
    let resolvePending: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockResolvedValueOnce(existing)
      .mockImplementationOnce(() => new Promise<FakeImageBitmap>(resolve => {
        resolvePending = resolve
      })))
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      loop: 1
    })
    await player.mount(makeVideo({ size: { width: 20, height: 20 }, frames: 2, fps: 1 }))
    player.start()
    await Promise.resolve()
    await Promise.resolve()
    runRaf(rafRequests[rafRequests.length - 1], 1000)

    player.setConfig({ isCacheFrames: false })
    const pending = new FakeImageBitmap(20, 20)
    resolvePending?.(pending)
    await Promise.resolve()
    await Promise.resolve()

    expect(existing.close).toHaveBeenCalledOnce()
    expect(pending.close).toHaveBeenCalledOnce()
    expect(Object.keys((player as unknown as { __svgaFrames: object }).__svgaFrames)).toHaveLength(0)
  })

  it('continues cached-frame cleanup when one close operation throws', () => {
    const first = new FakeImageBitmap(1, 1)
    const second = new FakeImageBitmap(1, 1)
    first.close.mockImplementation(() => { throw new Error('close failed') })
    const player = new Player({ isCacheFrames: true })
    const cache = (player as unknown as { __svgaFrames: Record<string, FakeImageBitmap> }).__svgaFrames
    cache.first = first
    cache.second = second

    expect(() => player.setConfig({ isCacheFrames: false })).not.toThrow()
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
    expect(Object.keys(cache)).toHaveLength(0)
  })

  it('clears frame cache and sizes a replacement container before observing it', async () => {
    const owned = new FakeImageBitmap(20, 20)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => owned))
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true
    })
    await player.mount(makeVideo({ size: { width: 20, height: 20 }, frames: 1 }))
    player.start()
    await Promise.resolve()
    await Promise.resolve()
    const replacement = new FakeCanvas()

    player.setConfig({
      container: replacement as unknown as HTMLCanvasElement,
      isUseIntersectionObserver: true
    })

    expect(owned.close).toHaveBeenCalledOnce()
    expect(Object.keys((player as unknown as { __svgaFrames: object }).__svgaFrames)).toHaveLength(0)
    expect([replacement.width, replacement.height]).toEqual([20, 20])
    expect(observers[0].observe).toHaveBeenCalledWith(replacement)
    expect(observers[0].observedSizes).toEqual([[20, 20]])
  })

  it('does not cancel an in-flight mount when frame caching is toggled', async () => {
    let finish: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<FakeImageBitmap>(resolve => { finish = resolve })))
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true
    })
    const video = makeVideo({ images: Object.assign(Object.create(null), { delayed: Uint8Array.of(1) }) })
    const mounting = player.mount(video)

    player.setConfig({ isCacheFrames: false })
    finish?.(new FakeImageBitmap(1, 1))
    await mounting

    expect(player.videoEntity).toBe(video)
  })

  it('is idempotently destroyed, releases resources, and rejects later playback calls', async () => {
    const decoded = new FakeImageBitmap(20, 20)
    const cached = new FakeImageBitmap(20, 20)
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockResolvedValueOnce(decoded)
      .mockResolvedValueOnce(cached))
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      isUseIntersectionObserver: true
    })
    await player.mount(makeVideo({
      size: { width: 20, height: 20 },
      frames: 2,
      images: Object.assign(Object.create(null), { image: Uint8Array.of(1) })
    }))
    player.start()
    await Promise.resolve()
    await Promise.resolve()
    const observer = observers[0]

    player.destroy()
    player.destroy()

    expect(decoded.close).toHaveBeenCalledOnce()
    expect(cached.close).toHaveBeenCalledOnce()
    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect(player.config.isUseIntersectionObserver).toBe(false)
    expect(player.videoEntity).toBeUndefined()
    expect(rafCallbacks).toHaveLength(0)
    expect(canvas.context.clearRect).toHaveBeenCalled()
    expect(() => player.start()).toThrow(/destroyed/)
    expect(() => player.resume()).toThrow(/destroyed/)
    expect(() => player.pause()).toThrow(/destroyed/)
    expect(() => player.stop()).toThrow(/destroyed/)
  })

  it('closes an async cached bitmap that resolves after destroy', async () => {
    let resolveBitmap: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<FakeImageBitmap>(resolve => {
      resolveBitmap = resolve
    })))
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true
    })
    await player.mount(makeVideo({ frames: 1 }))
    player.start()
    player.destroy()
    const lateBitmap = new FakeImageBitmap(300, 150)

    resolveBitmap?.(lateBitmap)
    await Promise.resolve()
    await Promise.resolve()

    expect(lateBitmap.close).toHaveBeenCalledOnce()
    expect(Object.keys((player as unknown as { __svgaFrames: object }).__svgaFrames)).toHaveLength(0)
  })
})
