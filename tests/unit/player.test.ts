import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerConfigOptions, Video } from '../../src/types'
import { PLAYER_FILL_MODE, PLAYER_PLAY_MODE } from '../../src/types'
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
    pendingImages.length = 0
    observers.length = 0
    rafCallbacks.clear()
    rafRequests = []
    rafCancellations = []
    nextRafId = 1
    now = 0
    observeImplementation = undefined
  })

  it('removes its runtime and stops its Animator when constructor config validation fails', () => {
    const stop = vi.spyOn(Animator.prototype, 'stop')
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
    const stop = vi.spyOn(Animator.prototype, 'stop')
    const capture: RuntimeCapture = {}
    const owned = new FakeImageBitmap(1, 1)
    observeImplementation = () => {
      const cache = (capture.player as unknown as { cacheFrames: Record<string, FakeImageBitmap> }).cacheFrames
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

  it('disconnects its observer and removes its runtime when OffscreenCanvas construction throws', () => {
    const expected = new Error('OffscreenCanvas failed')
    const stop = vi.spyOn(Animator.prototype, 'stop')
    const capture: RuntimeCapture = {}
    const originalWindow = window
    vi.stubGlobal('window', {
      ...originalWindow,
      OffscreenCanvas: class {
        constructor () { throw expected }
      }
    })

    const error = captureConstructorFailure(() => {
      new Player({ isUseIntersectionObserver: true })
    }, capture)
    vi.stubGlobal('window', originalWindow)

    expect(error).toBe(expected)
    expect(stop).toHaveBeenCalledOnce()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(capture.map?.has(capture.player as object)).toBe(false)
    stop.mockRestore()
  })

  it('does not dispatch a no-op destroy override while cleaning a config failure', () => {
    class NoopDestroyPlayer extends Player {
      public override destroy (): void {}
    }
    const stop = vi.spyOn(Animator.prototype, 'stop')
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
    const stop = vi.spyOn(Animator.prototype, 'stop')
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
    const stop = vi.spyOn(Animator.prototype, 'stop')
    const capture: RuntimeCapture = {}
    const owned = new FakeImageBitmap(1, 1)
    observeImplementation = () => {
      const cache = (capture.player as unknown as { cacheFrames: Record<string, FakeImageBitmap> }).cacheFrames
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

  it('preserves an OffscreenCanvas error when destroy is overridden to throw', () => {
    const expected = new Error('OffscreenCanvas failed')
    const cleanupError = new Error('overridden destroy failed')
    class ThrowingDestroyPlayer extends Player {
      public override destroy (): void { throw cleanupError }
    }
    const stop = vi.spyOn(Animator.prototype, 'stop')
    const capture: RuntimeCapture = {}
    const originalWindow = window
    vi.stubGlobal('window', {
      ...originalWindow,
      OffscreenCanvas: class {
        constructor () { throw expected }
      }
    })

    const error = captureConstructorFailure(() => {
      new ThrowingDestroyPlayer({ isUseIntersectionObserver: true })
    }, capture)
    vi.stubGlobal('window', originalWindow)

    expect(error).toBe(expected)
    expect(stop).toHaveBeenCalledOnce()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(capture.map?.has(capture.player as object)).toBe(false)
    stop.mockRestore()
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
    expect(observers).toHaveLength(2)
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
  })

  it('applies every valid partial option when constructed without a container', () => {
    const player = new Player({
      loop: 3,
      fillMode: PLAYER_FILL_MODE.BACKWARDS,
      playMode: PLAYER_PLAY_MODE.FALLBACKS,
      startFrame: 1,
      endFrame: 3,
      loopStartFrame: 2,
      isCacheFrames: true,
      isUseIntersectionObserver: true,
      isOpenNoExecutionDelay: true
    })

    expect(player.config).toMatchObject({
      loop: 3,
      fillMode: PLAYER_FILL_MODE.BACKWARDS,
      playMode: PLAYER_PLAY_MODE.FALLBACKS,
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
    expect((player as unknown as { isBeIntersection: boolean }).isBeIntersection).toBe(true)
    expect(player.config.isUseIntersectionObserver).toBe(false)
  })

  it('ignores queued callbacks from a replaced observer', () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isUseIntersectionObserver: true
    })
    const staleObserver = observers[0]

    player.setConfig({ loop: 2 })
    staleObserver.callback(
      [{ intersectionRatio: 0 }] as IntersectionObserverEntry[],
      staleObserver as unknown as IntersectionObserver
    )

    expect((player as unknown as { isBeIntersection: boolean }).isBeIntersection).toBe(true)
  })

  it('validates partial frame updates against the mounted video range', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    await player.mount(makeVideo({ frames: 4 }))

    expect(() => player.setConfig({ startFrame: 4 })).toThrow(/frame/)
    expect(() => player.setConfig({ loopStartFrame: 4 })).toThrow(/frame/)
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

  it.each([[4097, 1], [4096, 4097], [0, 1]])('rejects decoded image dimensions %sx%s', async (width, height) => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => new FakeImageBitmap(width, height)))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { image: Uint8Array.from([1]) })
    await expect(player.mount(makeVideo({ images }))).rejects.toThrow('image:image')
  })

  it('prevents an older concurrent byte-image mount from overwriting a newer one', async () => {
    const pending: Array<(bitmap: FakeImageBitmap) => void> = []
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<FakeImageBitmap>(resolve => pending.push(resolve))))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const older = makeVideo({ images: Object.assign(Object.create(null), { old: Uint8Array.of(1) }), size: { width: 100, height: 100 } })
    const newer = makeVideo({ images: Object.assign(Object.create(null), { new: Uint8Array.of(2) }), size: { width: 200, height: 200 } })
    const olderMount = player.mount(older)
    const newerMount = player.mount(newer)
    pending[1](new FakeImageBitmap(1, 1))
    await newerMount
    pending[0](new FakeImageBitmap(1, 1))
    await olderMount
    expect(player.videoEntity).toBe(newer)
  })

  it('revalidates configuration changed while byte-image decoding before mount commits', async () => {
    let finish: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<FakeImageBitmap>(resolve => { finish = resolve })))
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { delayed: Uint8Array.of(1) })
    const mounting = player.mount(makeVideo({ frames: 2, images }))
    player.setConfig({ startFrame: 2 })
    finish?.(new FakeImageBitmap(1, 1))
    await expect(mounting).rejects.toThrow(/frame/)
    expect(player.videoEntity).toBeUndefined()
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
    const offscreen = (player as unknown as { ofsCanvas: FakeCanvas }).ofsCanvas
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
      fillMode: PLAYER_FILL_MODE.BACKWARDS
    })
    await player.mount(makeVideo({ frames: 5, fps: 10 }))
    player.start()
    runRaf(rafRequests[rafRequests.length - 1], 100)
    player.pause()
    player.resume()
    const animator = (player as unknown as { animator: Animator }).animator

    expect(animator.startValue).toBe(0)
    expect(animator.endValue).toBe(4)
    expect(animator.duration).toBe(400)
    expect(animator.loopStart).toBe(200)
    expect(animator.fillRule).toBe(1)
    expect(animator.loop).toBe(1)
    runRaf(rafRequests[rafRequests.length - 1], 200)
    expect(player.currentFrame).toBe(2)
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

    expect((player as unknown as { animator: Animator }).animator.loop).toBe(1)
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
    const offscreen = (player as unknown as { ofsCanvas: FakeCanvas }).ofsCanvas

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
    ;(player as unknown as { drawFrame: (frame: number) => void }).drawFrame(1)
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

    const cache = (player as unknown as { cacheFrames: Record<string, FakeImageBitmap> }).cacheFrames
    expect(Object.getPrototypeOf(cache)).toBeNull()
    expect(Object.keys(cache)).toEqual(['1'])
    expect(cache[1]).toBe(tiny)
    expect(large.close).toHaveBeenCalledOnce()
    expect(tiny.close).not.toHaveBeenCalled()
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
    const offscreen = (player as unknown as { ofsCanvas: FakeCanvas }).ofsCanvas

    player.start()

    expect(Object.keys((player as unknown as { cacheFrames: object }).cacheFrames)).toHaveLength(0)
    expect(offscreen.toDataURL).not.toHaveBeenCalled()
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
    expect(Object.keys((player as unknown as { cacheFrames: object }).cacheFrames)).toHaveLength(0)
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
    expect(Object.keys((player as unknown as { cacheFrames: object }).cacheFrames)).toHaveLength(0)
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
    expect(Object.keys((player as unknown as { cacheFrames: object }).cacheFrames)).toHaveLength(0)
  })
})
