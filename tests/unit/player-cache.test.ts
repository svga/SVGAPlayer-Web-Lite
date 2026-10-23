import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FakeCanvas,
  FakeImageBitmap,
  FakeIntersectionObserver,
  cancelAnimationFrame,
  environment,
  internal,
  makeVideo,
  requestAnimationFrame,
  resetPlayerEnvironment,
  runRaf,
} from './helpers/player'

let Player: (typeof import('../../src/player/index'))['Player']

beforeAll(async () => {
  Player = (await import('../../src/player/index')).Player
})
describe('Player frame cache and destruction', () => {
  beforeEach(() => {
    resetPlayerEnvironment()
  })

  it('uses async ImageBitmap caching, never toDataURL, and evicts over 64 MiB by LRU', async () => {
    const created: FakeImageBitmap[] = []
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (canvas: FakeCanvas) => {
        const bitmap = new FakeImageBitmap(canvas.width, canvas.height)
        created.push(bitmap)
        return bitmap
      }),
    )
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      loop: 1,
    })
    await player.mount(makeVideo({ size: { width: 3000, height: 3000 }, frames: 2, fps: 1 }))
    const offscreen = internal(player).__svgaCanvas

    player.start()
    await Promise.resolve()
    await Promise.resolve()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(created).toHaveLength(2)
    expect(created[0].close).toHaveBeenCalledOnce()
    expect(created[1].close).not.toHaveBeenCalled()
    canvas.context.drawImage.mockClear()
    player.stepToFrame(1)
    expect(canvas.context.drawImage).toHaveBeenCalledWith(created[1], 0, 0)
    expect(offscreen.toDataURL).not.toHaveBeenCalled()
  })

  it('sums mixed bitmap sizes in a null-prototype 64 MiB LRU', async () => {
    const large = new FakeImageBitmap(4096, 4096)
    const tiny = new FakeImageBitmap(1, 1)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValueOnce(large).mockResolvedValueOnce(tiny),
    )
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      loop: 1,
    })
    await player.mount(makeVideo({ size: { width: 10, height: 10 }, frames: 2, fps: 1 }))

    player.start()
    await Promise.resolve()
    await Promise.resolve()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 1000)
    await Promise.resolve()
    await Promise.resolve()

    const cache = internal(player).__svgaFrames
    expect(Object.getPrototypeOf(cache)).toBeNull()
    expect(Object.keys(cache)).toEqual(['1'])
    expect(cache[1]).toBe(tiny)
    expect(large.close).toHaveBeenCalledOnce()
    expect(tiny.close).not.toHaveBeenCalled()
  })

  it('evicts and accounts for an LRU entry before best-effort close', async () => {
    const first = new FakeImageBitmap(3000, 3000)
    const second = new FakeImageBitmap(3000, 3000)
    first.close.mockImplementation(() => {
      throw new Error('close failed')
    })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
    )
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      loop: 1,
    })
    await player.mount(makeVideo({ size: { width: 3000, height: 3000 }, frames: 2, fps: 1 }))

    player.start()
    await Promise.resolve()
    await Promise.resolve()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 1000)
    await Promise.resolve()
    await Promise.resolve()

    const cache = internal(player).__svgaFrames
    expect(Object.keys(cache)).toEqual(['1'])
    expect(cache[1]).toBe(second)
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).not.toHaveBeenCalled()
  })

  it('closes a new async bitmap when the frame cache cannot store it and clears pending state', async () => {
    const first = new FakeImageBitmap(10, 10)
    const second = new FakeImageBitmap(10, 10)
    const createImageBitmap = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
    })
    await player.mount(makeVideo({ size: { width: 10, height: 10 }, frames: 1 }))
    const cache = internal(player).__svgaFrames
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
    first.close.mockImplementation(() => {
      throw new Error('close failed')
    })
    second.close.mockImplementation(() => {
      throw new Error('close failed')
    })
    const createImageBitmap = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
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

      constructor(width: number, height: number) {
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
      performance: { now: () => environment.now },
      requestAnimationFrame,
      cancelAnimationFrame,
      URL: globalThis.URL,
    })
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      isCacheFrames: true,
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
      isCacheFrames: true,
    })
    await player.mount(makeVideo({ frames: 1 }))
    const offscreen = internal(player).__svgaCanvas

    player.start()

    expect(Object.keys(internal(player).__svgaFrames)).toHaveLength(0)
    expect(offscreen.toDataURL).not.toHaveBeenCalled()
  })

  it('reuses one OffscreenCanvas on Firefox across every frame', async () => {
    let constructions = 0
    class FakeOffscreenCanvas extends FakeCanvas {
      constructor(width: number, height: number) {
        super()
        constructions++
        this.width = width
        this.height = height
      }
    }
    vi.stubGlobal('window', {
      ...window,
      OffscreenCanvas: FakeOffscreenCanvas,
      navigator: { userAgent: 'Firefox' },
    })
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    await player.mount(makeVideo({ frames: 2, fps: 10 }))

    player.start()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 100)

    expect(constructions).toBe(1)
  })

  it('closes decoded images and owned cached frames on replacement', async () => {
    const decoded = new FakeImageBitmap(20, 20)
    const cached = new FakeImageBitmap(20, 20)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValueOnce(decoded).mockResolvedValueOnce(cached),
    )
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
    })
    await player.mount(
      makeVideo({
        size: { width: 20, height: 20 },
        frames: 1,
        images: Object.assign(Object.create(null), { image: Uint8Array.of(1) }),
      }),
    )
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
    vi.stubGlobal(
      'createImageBitmap',
      vi
        .fn()
        .mockResolvedValueOnce(existing)
        .mockImplementationOnce(
          () =>
            new Promise<FakeImageBitmap>((resolve) => {
              resolvePending = resolve
            }),
        ),
    )
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      loop: 1,
    })
    await player.mount(makeVideo({ size: { width: 20, height: 20 }, frames: 2, fps: 1 }))
    player.start()
    await Promise.resolve()
    await Promise.resolve()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 1000)

    player.setConfig({ isCacheFrames: false })
    const pending = new FakeImageBitmap(20, 20)
    resolvePending?.(pending)
    await Promise.resolve()
    await Promise.resolve()

    expect(existing.close).toHaveBeenCalledOnce()
    expect(pending.close).toHaveBeenCalledOnce()
    expect(Object.keys(internal(player).__svgaFrames)).toHaveLength(0)
  })

  it('continues cached-frame cleanup when one close operation throws', () => {
    const first = new FakeImageBitmap(1, 1)
    const second = new FakeImageBitmap(1, 1)
    first.close.mockImplementation(() => {
      throw new Error('close failed')
    })
    const player = new Player({ isCacheFrames: true })
    const cache = internal(player).__svgaFrames
    cache.first = first
    cache.second = second

    expect(() => player.setConfig({ isCacheFrames: false })).not.toThrow()
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
    expect(Object.keys(cache)).toHaveLength(0)
  })

  it('clears frame cache and sizes a replacement container before observing it', async () => {
    const owned = new FakeImageBitmap(20, 20)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => owned),
    )
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
    })
    await player.mount(makeVideo({ size: { width: 20, height: 20 }, frames: 1 }))
    player.start()
    await Promise.resolve()
    await Promise.resolve()
    const replacement = new FakeCanvas()

    player.setConfig({
      container: replacement as unknown as HTMLCanvasElement,
      isUseIntersectionObserver: true,
    })

    expect(owned.close).toHaveBeenCalledOnce()
    expect(Object.keys(internal(player).__svgaFrames)).toHaveLength(0)
    expect([replacement.width, replacement.height]).toEqual([20, 20])
    expect(environment.observers[0].observe).toHaveBeenCalledWith(replacement)
    expect(environment.observers[0].observedSizes).toEqual([[20, 20]])
  })

  it('does not cancel an in-flight mount when frame caching is toggled', async () => {
    let finish: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<FakeImageBitmap>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
    })
    const video = makeVideo({
      images: Object.assign(Object.create(null), { delayed: Uint8Array.of(1) }),
    })
    const mounting = player.mount(video)

    player.setConfig({ isCacheFrames: false })
    finish?.(new FakeImageBitmap(1, 1))
    await mounting

    expect(player.videoEntity).toBe(video)
  })

  it('exposes lifecycle state and playback status', async () => {
    let resolveBitmap: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<FakeImageBitmap>((resolve) => {
            resolveBitmap = resolve
          }),
      ),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    expect(player.state).toBe('idle')
    expect(player.isPlaying).toBe(false)

    const mounting = player.mount(
      makeVideo({
        images: Object.assign(Object.create(null), { image: Uint8Array.of(1) }),
      }),
    )
    expect(player.state).toBe('loading')
    resolveBitmap?.(new FakeImageBitmap(1, 1))
    await mounting
    expect(player.state).toBe('ready')

    player.start()
    expect(player.state).toBe('playing')
    expect(player.isPlaying).toBe(true)

    player.pause()
    expect(player.state).toBe('paused')
    expect(player.isPlaying).toBe(false)

    player.stepToFrame(1)
    expect(player.state).toBe('paused')

    player.stop()
    expect(player.state).toBe('ready')
    expect(player.isPlaying).toBe(false)

    player.destroy()
    expect(player.state).toBe('destroyed')
    expect(player.isPlaying).toBe(false)
  })

  it('is idempotently destroyed, releases resources, and rejects later playback calls', async () => {
    const decoded = new FakeImageBitmap(20, 20)
    const cached = new FakeImageBitmap(20, 20)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValueOnce(decoded).mockResolvedValueOnce(cached),
    )
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      isCacheFrames: true,
      isUseIntersectionObserver: true,
    })
    await player.mount(
      makeVideo({
        size: { width: 20, height: 20 },
        frames: 2,
        images: Object.assign(Object.create(null), { image: Uint8Array.of(1) }),
      }),
    )
    player.start()
    await Promise.resolve()
    await Promise.resolve()
    const observer = environment.observers[0]

    player.destroy()
    player.destroy()

    expect(decoded.close).toHaveBeenCalledOnce()
    expect(cached.close).toHaveBeenCalledOnce()
    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect(player.config.isUseIntersectionObserver).toBe(false)
    expect(player.state).toBe('destroyed')
    expect(player.videoEntity).toBeUndefined()
    expect(environment.rafCallbacks).toHaveLength(0)
    expect(canvas.context.clearRect).toHaveBeenCalled()
    expect(() => player.start()).toThrow(/destroyed/)
    expect(() => player.resume()).toThrow(/destroyed/)
    expect(() => player.pause()).toThrow(/destroyed/)
    expect(() => player.stop()).toThrow(/destroyed/)
    await expect(player.mount(makeVideo())).rejects.toThrow(/destroyed/)
  })

  it('closes an async cached bitmap that resolves after destroy', async () => {
    let resolveBitmap: ((bitmap: FakeImageBitmap) => void) | undefined
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<FakeImageBitmap>((resolve) => {
            resolveBitmap = resolve
          }),
      ),
    )
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
    })
    await player.mount(makeVideo({ frames: 1 }))
    player.start()
    player.destroy()
    const lateBitmap = new FakeImageBitmap(300, 150)

    resolveBitmap?.(lateBitmap)
    await Promise.resolve()
    await Promise.resolve()

    expect(lateBitmap.close).toHaveBeenCalledOnce()
    expect(Object.keys(internal(player).__svgaFrames)).toHaveLength(0)
  })
})
