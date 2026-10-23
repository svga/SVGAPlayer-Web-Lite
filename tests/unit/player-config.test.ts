import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerConfigOptions } from '../../src/types'
import { Animator } from '../../src/player/animator'
import type { RuntimeCapture } from './helpers/player'
import {
  FakeCanvas,
  FakeImageBitmap,
  captureConstructorFailure,
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
describe('Player configuration and visibility observer', () => {
  beforeEach(() => {
    resetPlayerEnvironment()
  })

  it('removes its runtime and stops its Animator when constructor config validation fails', () => {
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}

    const error = captureConstructorFailure(
      Player,
      () => {
        new Player({ startFrame: -1 })
      },
      capture,
    )

    expect(error).toMatchObject({ message: 'frame' })
    expect(stop).toHaveBeenCalledOnce()
    expect(internal(capture.player as object).__svgaState).toBe('destroyed')
    stop.mockRestore()
  })

  it('disconnects its observer, closes owned cache, and removes its runtime when observe throws', () => {
    const expected = new Error('observe failed')
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}
    const owned = new FakeImageBitmap(1, 1)
    environment.observeImplementation = () => {
      const cache = internal(capture.player as object).__svgaFrames
      cache.owned = owned
      throw expected
    }

    const error = captureConstructorFailure(
      Player,
      () => {
        new Player({ isUseIntersectionObserver: true })
      },
      capture,
    )
    environment.observeImplementation = undefined

    expect(error).toBe(expected)
    expect(stop).toHaveBeenCalledOnce()
    expect(environment.observers[0].disconnect).toHaveBeenCalledOnce()
    expect(owned.close).toHaveBeenCalledOnce()
    expect(internal(capture.player as object).__svgaState).toBe('destroyed')
    stop.mockRestore()
  })

  it('falls back to an HTML canvas when OffscreenCanvas construction throws', () => {
    vi.stubGlobal('window', {
      ...window,
      OffscreenCanvas: class {
        constructor() {
          throw new Error('OffscreenCanvas failed')
        }
      },
    })

    const player = new Player({ isUseIntersectionObserver: true })
    expect(internal(player).__svgaCanvas).toBeInstanceOf(FakeCanvas)
    expect(environment.observers[0].disconnect).not.toHaveBeenCalled()
  })

  it('does not dispatch a no-op destroy override while cleaning a config failure', () => {
    class NoopDestroyPlayer extends Player {
      public override destroy(): void {}
    }
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}

    const error = captureConstructorFailure(
      Player,
      () => {
        new NoopDestroyPlayer({ startFrame: -1 })
      },
      capture,
    )

    expect(error).toMatchObject({ message: 'frame' })
    expect(stop).toHaveBeenCalledOnce()
    expect(internal(capture.player as object).__svgaState).toBe('destroyed')
    stop.mockRestore()
  })

  it('preserves a setConfig override error when destroy is overridden to throw', () => {
    const expected = new Error('setConfig failed')
    const cleanupError = new Error('overridden destroy failed')
    class ThrowingHooksPlayer extends Player {
      public override setConfig(_options: PlayerConfigOptions): void {
        throw expected
      }
      public override destroy(): void {
        throw cleanupError
      }
    }
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}

    const error = captureConstructorFailure(
      Player,
      () => {
        new ThrowingHooksPlayer({})
      },
      capture,
    )

    expect(error).toBe(expected)
    expect(stop).toHaveBeenCalledOnce()
    expect(internal(capture.player as object).__svgaState).toBe('destroyed')
    stop.mockRestore()
  })

  it('preserves an observer error when destroy is overridden to throw', () => {
    const expected = new Error('observe failed')
    const cleanupError = new Error('overridden destroy failed')
    class ThrowingDestroyPlayer extends Player {
      public override destroy(): void {
        throw cleanupError
      }
    }
    const stop = vi.spyOn(Animator.prototype, '__svgaStop')
    const capture: RuntimeCapture = {}
    const owned = new FakeImageBitmap(1, 1)
    environment.observeImplementation = () => {
      const cache = internal(capture.player as object).__svgaFrames
      cache.owned = owned
      throw expected
    }

    const error = captureConstructorFailure(
      Player,
      () => {
        new ThrowingDestroyPlayer({ isUseIntersectionObserver: true })
      },
      capture,
    )
    environment.observeImplementation = undefined

    expect(error).toBe(expected)
    expect(stop).toHaveBeenCalledOnce()
    expect(environment.observers[0].disconnect).toHaveBeenCalledOnce()
    expect(owned.close).toHaveBeenCalledOnce()
    expect(internal(capture.player as object).__svgaState).toBe('destroyed')
    stop.mockRestore()
  })

  it('falls back when OffscreenCanvas has no usable 2D context', () => {
    vi.stubGlobal('window', {
      ...window,
      OffscreenCanvas: class {
        public width = 1
        public height = 1
        public getContext(): null {
          return null
        }
      },
    })

    const player = new Player({})
    expect(internal(player).__svgaCanvas).toBeInstanceOf(FakeCanvas)
  })

  it('uses OffscreenCanvas by default and an HTML canvas when explicitly disabled', () => {
    class FakeOffscreenCanvas extends FakeCanvas {
      constructor(width: number, height: number) {
        super()
        this.width = width
        this.height = height
      }
    }
    vi.stubGlobal('window', { ...window, OffscreenCanvas: FakeOffscreenCanvas })

    const defaultPlayer = new Player({})
    const disabledPlayer = new Player({ isDisableOffscreenCanvas: true })

    expect(internal(defaultPlayer).__svgaCanvas).toBeInstanceOf(FakeOffscreenCanvas)
    expect(internal(disabledPlayer).__svgaCanvas).toBeInstanceOf(FakeCanvas)
    expect(internal(disabledPlayer).__svgaCanvas).not.toBeInstanceOf(FakeOffscreenCanvas)
    expect(defaultPlayer.config.isDisableOffscreenCanvas).toBe(false)
    expect(disabledPlayer.config.isDisableOffscreenCanvas).toBe(true)
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
      isOpenNoExecutionDelay: true,
      isDisableOffscreenCanvas: true,
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
      isOpenNoExecutionDelay: true,
      isDisableOffscreenCanvas: true,
    })
    expect(environment.observers).toHaveLength(1)
    expect(environment.observers[0].disconnect).not.toHaveBeenCalled()
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
      isOpenNoExecutionDelay: true,
      isDisableOffscreenCanvas: true,
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
      isOpenNoExecutionDelay: true,
      isDisableOffscreenCanvas: true,
    })
  })

  it('ignores explicitly undefined configuration properties', () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      loop: 3,
      startFrame: 1,
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
    expect(() => {
      ;(first as unknown as { loop: number }).loop = 9
    }).toThrow()
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
    { isOpenNoExecutionDelay: 'true' as unknown as boolean },
    { isDisableOffscreenCanvas: 1 as unknown as boolean },
  ] satisfies PlayerConfigOptions[])('rejects every invalid non-frame option: %j', (options) => {
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
    [{ startFrame: 2, endFrame: 6, loopStartFrame: 7 }, /frame/],
  ] as Array<[PlayerConfigOptions, RegExp]>)(
    'rejects invalid merged frame configuration before rebuilding the observer: %j',
    (options, message) => {
      const player = new Player({
        container: new FakeCanvas() as unknown as HTMLCanvasElement,
        startFrame: 1,
        endFrame: 8,
        loopStartFrame: 1,
        isUseIntersectionObserver: true,
      })
      const previousConfig = { ...player.config }
      const observerCount = environment.observers.length

      expect(() => player.setConfig(options)).toThrow(message)
      expect(player.config).toEqual(previousConfig)
      expect(environment.observers).toHaveLength(observerCount)
    },
  )

  it('disconnects the observer and restores visible state when disabled', () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isUseIntersectionObserver: true,
    })
    const observer = environment.observers[0]
    observer.callback(
      [{ intersectionRatio: 0 }] as IntersectionObserverEntry[],
      observer as unknown as IntersectionObserver,
    )

    player.setConfig({ isUseIntersectionObserver: false })

    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect(internal(player).__svgaVisible).toBe(true)
    expect(player.config.isUseIntersectionObserver).toBe(false)
  })

  it('does not replace its observer for unrelated configuration changes', () => {
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isUseIntersectionObserver: true,
    })
    const observer = environment.observers[0]

    player.setConfig({ loop: 2 })
    observer.callback(
      [{ intersectionRatio: 0 }] as IntersectionObserverEntry[],
      observer as unknown as IntersectionObserver,
    )

    expect(environment.observers).toHaveLength(1)
    expect(observer.disconnect).not.toHaveBeenCalled()
    expect(internal(player).__svgaVisible).toBe(false)
  })

  it('recreates the render canvas and closes cached frames when OffscreenCanvas use changes', async () => {
    const cached = new FakeImageBitmap(10, 10)
    const created: FakeOffscreenCanvas[] = []
    class FakeOffscreenCanvas extends FakeCanvas {
      public readonly transferToImageBitmap = vi.fn(() => cached)

      constructor(width: number, height: number) {
        super()
        this.width = width
        this.height = height
        created.push(this)
      }
    }
    vi.stubGlobal('window', { ...window, OffscreenCanvas: FakeOffscreenCanvas })
    const player = new Player({
      container: new FakeCanvas() as unknown as HTMLCanvasElement,
      isCacheFrames: true,
    })
    await player.mount(makeVideo({ size: { width: 10, height: 10 }, frames: 1 }))
    player.start()
    expect(Object.keys(internal(player).__svgaFrames)).toEqual(['0'])
    const original = internal(player).__svgaCanvas

    player.setConfig({ isDisableOffscreenCanvas: true })

    const disabled = internal(player).__svgaCanvas
    expect(disabled).toBeInstanceOf(FakeCanvas)
    expect(disabled).not.toBeInstanceOf(FakeOffscreenCanvas)
    expect(disabled).not.toBe(original)
    expect(cached.close).toHaveBeenCalledOnce()
    expect(Object.keys(internal(player).__svgaFrames)).toEqual([])

    player.setConfig({ isDisableOffscreenCanvas: false })

    expect(internal(player).__svgaCanvas).toBeInstanceOf(FakeOffscreenCanvas)
    expect(created).toHaveLength(2)
  })

  it('validates partial frame updates against the mounted video range', async () => {
    const player = new Player(new FakeCanvas() as unknown as HTMLCanvasElement)
    await player.mount(makeVideo({ frames: 4 }))

    expect(() => player.setConfig({ startFrame: 4 })).toThrow(/frame/)
    expect(() => player.setConfig({ loopStartFrame: 4 })).toThrow(/frame/)
  })

  it.each([true, 0, 2])('rejects a zero-length loop segment for loop %j', async (loop) => {
    const player = new Player({ loop })
    await player.mount(makeVideo({ frames: 4 }))

    expect(() => player.setConfig({ loopStartFrame: 3 })).toThrow(/loop/)
  })

  it('rejects a zero-length configured range while looping', () => {
    expect(
      () =>
        new Player({
          loop: true,
          startFrame: 3,
          endFrame: 3,
          loopStartFrame: 3,
        }),
    ).toThrow(/loop/)
  })

  it('redraws the advanced current frame immediately when visibility returns', async () => {
    const canvas = new FakeCanvas()
    const player = new Player({
      container: canvas as unknown as HTMLCanvasElement,
      isUseIntersectionObserver: true,
      loop: false,
    })
    await player.mount(makeVideo({ frames: 4, fps: 10 }))
    const observer = environment.observers[0]
    observer.callback(
      [{ intersectionRatio: 0 }] as IntersectionObserverEntry[],
      observer as unknown as IntersectionObserver,
    )
    canvas.context.drawImage.mockClear()

    player.start()
    runRaf(environment.rafRequests[environment.rafRequests.length - 1], 300)
    expect(player.currentFrame).toBe(3)
    expect(canvas.context.drawImage).not.toHaveBeenCalled()
    observer.callback(
      [{ intersectionRatio: 1 }] as IntersectionObserverEntry[],
      observer as unknown as IntersectionObserver,
    )

    expect(canvas.context.drawImage).toHaveBeenCalledOnce()
  })
})
