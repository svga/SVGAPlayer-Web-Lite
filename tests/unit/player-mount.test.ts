import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Video } from '../../src/types'

import {
  FakeCanvas,
  FakeImageBitmap,
  environment,
  internal,
  makeVideo,
  resetPlayerEnvironment,
  runRaf,
} from './helpers/player'

let Player: (typeof import('../../src/player/index'))['Player']

beforeAll(async () => {
  Player = (await import('../../src/player/index')).Player
})
describe('Player mount and playback lifecycle', () => {
  beforeEach(() => {
    resetPlayerEnvironment()
  })

  it('decodes Uint8Array images in Player and waits for every bitmap', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    let finish: ((bitmap: FakeImageBitmap) => void) | undefined
    const createImageBitmap = vi.fn(
      () =>
        new Promise<FakeImageBitmap>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const video = makeVideo({
      images: Object.assign(Object.create(null), { delayed: Uint8Array.from([1, 2]) }),
    })
    let settled = false

    const mounting = player.mount(video).then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    finish?.(new FakeImageBitmap(10, 10))
    await mounting
    expect(player.videoEntity).toBe(video)
  })

  it('rejects broken image bytes instead of hanging', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw Error('decode failed')
      }),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { broken: Uint8Array.from([1]) })
    await expect(player.mount(makeVideo({ images }))).rejects.toThrow('decode failed')
    expect(player.videoEntity).toBeUndefined()
  })

  it.each([
    [16_777_217, 1],
    [4096, 4097],
    [0, 1],
  ])('rejects decoded image dimensions %sx%s', async (width, height) => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => new FakeImageBitmap(width, height)),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { image: Uint8Array.from([1]) })
    await expect(player.mount(makeVideo({ images }))).rejects.toThrow('image:image')
  })

  it('allows a decoded dimension over 4096 when its total pixels remain in budget', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => new FakeImageBitmap(4097, 1)),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { image: Uint8Array.from([1]) })

    await expect(player.mount(makeVideo({ images }))).resolves.toBeUndefined()
  })

  it('stops before a third decode once two images consume the total pixel budget', async () => {
    const first = new FakeImageBitmap(4096, 4096)
    const second = new FakeImageBitmap(4096, 4096)
    const extra = new FakeImageBitmap(1, 1)
    const createImageBitmap = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(extra)
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), {
      first: Uint8Array.of(1),
      second: Uint8Array.of(2),
      extra: Uint8Array.of(3),
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
    const createImageBitmap = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const exactImages = Object.assign(Object.create(null), {
      first: Uint8Array.of(1),
      second: Uint8Array.of(2),
    })

    await expect(player.mount(makeVideo({ images: exactImages }))).resolves.toBeUndefined()
    expect(createImageBitmap).toHaveBeenCalledTimes(2)
  })

  it('continues owned-image cleanup when one close operation throws', async () => {
    const first = new FakeImageBitmap(4096, 4096)
    const second = new FakeImageBitmap(4096, 4096)
    const extra = new FakeImageBitmap(1, 1)
    first.close.mockImplementation(() => {
      throw new Error('close failed')
    })
    vi.stubGlobal(
      'createImageBitmap',
      vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second)
        .mockResolvedValueOnce(extra),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), {
      first: Uint8Array.of(1),
      second: Uint8Array.of(2),
      extra: Uint8Array.of(3),
    })

    await expect(player.mount(makeVideo({ images }))).rejects.toThrow('image pixels')
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
    expect(extra.close).not.toHaveBeenCalled()
  })

  it('waits for partial decode completion and closes a late bitmap after another image fails', async () => {
    let resolveLate: ((bitmap: FakeImageBitmap) => void) | undefined
    const late = new Promise<FakeImageBitmap>((resolve) => {
      resolveLate = resolve
    })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockReturnValueOnce(late).mockRejectedValueOnce(new Error('broken image')),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), {
      late: Uint8Array.of(1),
      broken: Uint8Array.of(2),
    })
    let settled = false
    const mounting = player.mount(makeVideo({ images })).finally(() => {
      settled = true
    })
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
      URL: { createObjectURL: vi.fn(() => 'blob:owned'), revokeObjectURL },
    })
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { image: Uint8Array.of(1) })
    const mounting = player.mount(makeVideo({ images }))
    environment.pendingImages[0].onload?.()

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
      URL: { createObjectURL: vi.fn(() => 'blob:failed'), revokeObjectURL },
    })
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const images = Object.assign(Object.create(null), { image: Uint8Array.of(1) })
    const mounting = player.mount(makeVideo({ images }))

    environment.pendingImages[0].onerror?.()
    environment.pendingImages[0].onerror?.()

    await expect(mounting).rejects.toThrow('image:image')
    expect(revokeObjectURL).toHaveBeenCalledOnce()
  })

  it.each(['remount', 'destroy'] as const)(
    'settles a never-loading fallback image and revokes its URL exactly once on %s',
    async (action) => {
      vi.stubGlobal('createImageBitmap', undefined)
      const revokeObjectURL = vi.fn()
      vi.stubGlobal('window', {
        ...window,
        URL: { createObjectURL: vi.fn(() => 'blob:pending'), revokeObjectURL },
      })
      const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
      const images = Object.assign(Object.create(null), { pending: Uint8Array.of(1) })
      let settled = false
      const pendingMount = player.mount(makeVideo({ images })).finally(() => {
        settled = true
      })
      await vi.waitFor(() => expect(environment.pendingImages).toHaveLength(1))
      const image = environment.pendingImages[0]

      if (action === 'remount') await player.mount(makeVideo())
      else player.destroy()
      await expect(
        Promise.race([
          pendingMount,
          new Promise((_, reject) => setTimeout(() => reject(Error('mount did not settle')), 50)),
        ]),
      ).resolves.toBeUndefined()

      expect(settled).toBe(true)
      expect(revokeObjectURL).toHaveBeenCalledOnce()
      expect(image.onload).toBeNull()
      expect(image.onerror).toBeNull()
      expect(image.removeAttribute).toHaveBeenCalledOnce()

      player.destroy()
      expect(revokeObjectURL).toHaveBeenCalledOnce()
    },
  )

  it('never releases caller-owned replacement or dynamic elements', async () => {
    const replacement = { close: vi.fn(), width: 1, height: 1 }
    const dynamic = { close: vi.fn(), width: 1, height: 1 }
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const video = makeVideo({
      replaceElements: Object.assign(Object.create(null), {
        caller: replacement as unknown as HTMLImageElement,
      }),
      dynamicElements: Object.assign(Object.create(null), {
        caller: dynamic as unknown as HTMLImageElement,
      }),
    })

    await player.mount(video)
    await player.mount(makeVideo())
    player.destroy()

    expect(replacement.close).not.toHaveBeenCalled()
    expect(dynamic.close).not.toHaveBeenCalled()
  })

  it('prevents an older concurrent byte-image mount from overwriting a newer one', async () => {
    const pending: Array<(bitmap: FakeImageBitmap) => void> = []
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => new Promise<FakeImageBitmap>((resolve) => pending.push(resolve))),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const older = makeVideo({
      images: Object.assign(Object.create(null), { old: Uint8Array.of(1) }),
      size: { width: 100, height: 100 },
    })
    const newer = makeVideo({
      images: Object.assign(Object.create(null), { new: Uint8Array.of(2) }),
      size: { width: 200, height: 200 },
    })
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
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<FakeImageBitmap>((resolve) => {
            finish = resolve
          }),
      ),
    )
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
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<FakeImageBitmap>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const video = makeVideo({
      images: Object.assign(Object.create(null), { delayed: Uint8Array.of(1) }),
    })
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
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<FakeImageBitmap>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const video = makeVideo({
      images: Object.assign(Object.create(null), { delayed: Uint8Array.of(1) }),
    })
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
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<FakeImageBitmap>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const video = makeVideo({
      images: Object.assign(Object.create(null), { delayed: Uint8Array.of(1) }),
    })
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
    const activeRequest = environment.rafRequests[environment.rafRequests.length - 1]

    await player.mount(makeVideo({ frames: 2 }))

    expect(activeRequest).toBeDefined()
    expect(environment.rafCancellations).toContain(activeRequest)
    expect(environment.rafCallbacks).toHaveLength(0)
    expect(player.currentFrame).toBe(0)
  })

  it.each([
    [makeVideo({ size: { width: 0, height: 10 } }), /video/],
    [makeVideo({ fps: Number.NaN }), /video/],
    [makeVideo({ frames: 0 }), /video/],
    [makeVideo({ frames: 2, sprites: [{ imageKey: 'short', frames: [] }] }), /video/],
    [
      makeVideo({
        frames: 2,
        sprites: [
          {
            imageKey: 'sparse',
            frames: Array.from({ length: 2 }) as Video['sprites'][number]['frames'],
          },
        ],
      }),
      /video/,
    ],
  ] as Array<[Video, RegExp]>)(
    'rejects invalid manually supplied videos before rendering',
    async (video, message) => {
      const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
      await expect(player.mount(video)).rejects.toThrow(message)
      expect(player.videoEntity).toBeUndefined()
    },
  )

  it('clears with clearRect and does not reset unchanged canvas dimensions', async () => {
    const canvas = new FakeCanvas()
    const player = new Player(canvas as unknown as HTMLCanvasElement)

    await player.mount(makeVideo({ size: { width: 300, height: 150 } }))
    const offscreen = internal(player).__svgaCanvas
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
    expect(environment.rafCallbacks).toHaveLength(0)
    expect(onStart).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('reports progress before and after mounting, including single-frame videos', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)

    expect(player.progress).toBe(0)
    await player.mount(makeVideo({ frames: 4 }))
    expect(player.progress).toBe(0.25)
    await player.mount(makeVideo({ frames: 1 }))
    expect(player.progress).toBe(1)
  })

  it('passes the same bounded progress value to onProcess while playing', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const progressValues: number[] = []
    player.onProcess = (progress) => progressValues.push(progress)
    await player.mount(makeVideo({ frames: 4, fps: 10 }))

    player.start()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 100)

    expect(player.currentFrame).toBe(1)
    expect(player.progress).toBe(0.5)
    expect(progressValues).toEqual([player.progress])
  })

  it('steps to a frame, stops the old timeline, and resumes from that position', async () => {
    const canvas = new FakeCanvas()
    const player = new Player(canvas as unknown as HTMLCanvasElement)
    const onProcess = vi.fn()
    const onResume = vi.fn()
    const onStart = vi.fn()
    const onPause = vi.fn()
    const onStop = vi.fn()
    player.onProcess = onProcess
    player.onResume = onResume
    player.onStart = onStart
    player.onPause = onPause
    player.onStop = onStop
    await player.mount(makeVideo({ frames: 4, fps: 10 }))
    player.start()
    const oldRequest = environment.rafRequests[environment.rafRequests.length - 1]
    canvas.context.drawImage.mockClear()
    onStart.mockClear()

    player.stepToFrame(2)

    expect(environment.rafCancellations).toContain(oldRequest)
    expect(environment.rafCallbacks).toHaveLength(0)
    expect(player.currentFrame).toBe(2)
    expect(player.progress).toBe(0.75)
    expect(canvas.context.drawImage).toHaveBeenCalledOnce()
    expect(onProcess).toHaveBeenCalledOnce()
    expect(onProcess).toHaveBeenLastCalledWith(0.75)
    expect(onStart).not.toHaveBeenCalled()
    expect(onResume).not.toHaveBeenCalled()
    expect(onPause).not.toHaveBeenCalled()
    expect(onStop).not.toHaveBeenCalled()

    player.resume()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 100)

    expect(player.currentFrame).toBe(3)
    expect(player.progress).toBe(1)
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('continues reverse playback from a stepped frame', async () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      playMode: 'fallbacks',
      startFrame: 1,
      endFrame: 3,
    })
    await player.mount(makeVideo({ frames: 4, fps: 10 }))

    player.stepToFrame(2)
    player.resume()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 100)

    expect(player.currentFrame).toBe(1)
    expect(player.progress).toBe(0.5)
  })

  it('continues immediately with one resume event when stepToFrame andPlay is true', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const events: string[] = []
    player.onProcess = () => events.push('process')
    player.onResume = () => events.push('resume')
    player.onStart = () => events.push('start')
    player.onPause = () => events.push('pause')
    player.onStop = () => events.push('stop')
    await player.mount(makeVideo({ frames: 4, fps: 10 }))

    player.stepToFrame(1, true)

    expect(events).toEqual(['process', 'resume'])
    expect(environment.rafCallbacks).toHaveLength(1)
  })

  it('validates stepToFrame arguments against the configured playback range', async () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      startFrame: 1,
      endFrame: 2,
    })

    expect(() => player.stepToFrame(1)).toThrow(/video/)
    await player.mount(makeVideo({ frames: 4 }))

    expect(() => player.stepToFrame(1.5)).toThrow(/frame/)
    expect(() => player.stepToFrame(0)).toThrow(/frame/)
    expect(() => player.stepToFrame(3)).toThrow(/frame/)
    expect(() =>
      (player.stepToFrame as (frame: number, andPlay: unknown) => void)(1, 'true'),
    ).toThrow(/andPlay/)
  })

  it('does not restart after an onProcess callback destroys a stepped player', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    await player.mount(makeVideo())
    player.onProcess = () => player.destroy()

    expect(() => player.stepToFrame(1, true)).not.toThrow()
    expect(environment.rafCallbacks).toHaveLength(0)
    expect(() => player.resume()).toThrow(/destroyed/)
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
    async (action) => {
      const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
      await player.mount(makeVideo())
      player.onStart = () => player[action]()

      expect(() => player.start()).not.toThrow()

      expect(environment.rafCallbacks).toHaveLength(0)
    },
  )

  it('pauses without clearing position and resumes from the current frame', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const onPause = vi.fn()
    const onResume = vi.fn()
    player.onPause = onPause
    player.onResume = onResume
    await player.mount(makeVideo({ frames: 4, fps: 10 }))

    player.start()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 100)
    expect(player.currentFrame).toBe(1)
    player.pause()
    expect(player.currentFrame).toBe(1)
    player.resume()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 200)

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
      fillMode: 'backwards',
    })
    await player.mount(makeVideo({ frames: 5, fps: 10 }))
    player.start()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 100)
    player.pause()
    player.resume()
    const animator = internal(player).__svgaAnimator

    expect(animator.__svgaStart).toBe(0)
    expect(animator.__svgaEnd).toBe(4)
    expect(animator.__svgaDuration).toBe(400)
    expect(animator.__svgaLoopStart).toBe(200)
    expect(animator.__svgaFill).toBe(1)
    expect(animator.__svgaLoop).toBe(1)
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 200)
    expect(player.currentFrame).toBe(2)
  })

  it('measures a reverse loop point from the configured end frame', async () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      startFrame: 1,
      endFrame: 6,
      loopStartFrame: 2,
      loop: 2,
      playMode: 'fallbacks',
    })
    await player.mount(makeVideo({ frames: 7, fps: 10 }))
    player.start()
    const animator = internal(player).__svgaAnimator

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
    const originalRequest = environment.rafRequests[environment.rafRequests.length - 1]

    player.resume()

    expect(onResume).toHaveBeenCalledOnce()
    expect(environment.rafCallbacks).toHaveLength(1)
    expect(environment.rafCallbacks.has(originalRequest)).toBe(true)
    expect(environment.rafCancellations).not.toContain(originalRequest)
    runRaf(originalRequest, 100)
    expect(player.currentFrame).toBe(1)
  })

  it('starts from the beginning when resumed before start', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    const onResume = vi.fn()
    player.onResume = onResume
    await player.mount(makeVideo({ frames: 4, fps: 10 }))

    player.resume()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 100)

    expect(player.currentFrame).toBe(1)
    expect(onResume).toHaveBeenCalledOnce()
    expect(environment.rafCallbacks).toHaveLength(1)
  })

  it.each(['pause', 'stop', 'destroy'] as const)(
    'lets onResume %s the Animator before the outer resume can schedule',
    async (action) => {
      const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
      await player.mount(makeVideo())
      player.start()
      player.pause()
      player.onResume = () => player[action]()

      expect(() => player.resume()).not.toThrow()

      expect(environment.rafCallbacks).toHaveLength(0)
    },
  )

  it('treats loop false as one pass', async () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      loop: false,
    })
    await player.mount(makeVideo({ frames: 2 }))

    player.start()

    expect(internal(player).__svgaAnimator.__svgaLoop).toBe(1)
  })

  it('stop returns to the configured start frame and the next start redraws it', async () => {
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      startFrame: 1,
      endFrame: 3,
    })
    const onStop = vi.fn()
    player.onStop = onStop
    await player.mount(makeVideo({ frames: 4, fps: 10 }))
    player.start()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 100)
    canvas.context.drawImage.mockClear()

    player.stop()
    expect(player.currentFrame).toBe(1)
    player.start()

    expect(player.currentFrame).toBe(1)
    expect(canvas.context.drawImage).toHaveBeenCalledOnce()
    expect(onStop).toHaveBeenCalledOnce()
  })
})
