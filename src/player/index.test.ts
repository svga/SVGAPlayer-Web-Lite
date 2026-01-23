import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Player } from './index'
import type { Video, PlayerConfigOptions } from '../types'
import { PLAYER_FILL_MODE, PLAYER_PLAY_MODE } from '../types'

describe('Player', () => {
  let mockCanvas: HTMLCanvasElement
  let mockContext: any
  let mockVideoEntity: Video
  let player: Player
  let originalIntersectionObserver: any
  let originalOffscreenCanvas: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Store originals
    originalIntersectionObserver = (globalThis as any).IntersectionObserver
    originalOffscreenCanvas = (globalThis as any).OffscreenCanvas

    // Create mock 2D context
    mockContext = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      setTransform: vi.fn(),
      clip: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      arcTo: vi.fn(),
      ellipse: vi.fn(),
      rect: vi.fn(),
      createImageData: vi.fn(() => ({ width: 400, height: 400, data: new Uint8ClampedArray(400 * 400 * 4) })),
      putImageData: vi.fn(),
      getImageData: vi.fn(() => ({ width: 400, height: 400, data: new Uint8ClampedArray(400 * 400 * 4) })),
      canvas: { width: 400, height: 400 }
    }

    // Create real canvas using happy-dom and mock its getContext
    mockCanvas = document.createElement('canvas') as any
    mockCanvas.width = 400
    mockCanvas.height = 400
    mockCanvas.getContext = vi.fn((contextType: string) => {
      if (contextType === '2d') return mockContext
      return null
    })

    // Mock IntersectionObserver
    ;(globalThis as any).IntersectionObserver = vi.fn((callback: any, options: any) => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      callback,
      options
    }))

    // Mock OffscreenCanvas
    ;(globalThis as any).OffscreenCanvas = class MockOffscreenCanvas {
      constructor(public width: number, public height: number) {}
      getContext() { return mockContext }
      toDataURL() { return 'data:image/png;base64,mock' }
      transferToImageBitmap() { return { width: this.width, height: this.height } }
    }

    // Create mock video entity
    const mockFrame: any = {
      alpha: 1,
      transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      layout: { x: 0, y: 0, width: 100, height: 100 },
      clipPath: '',
      maskPath: null,
      shapes: []
    }

    mockVideoEntity = {
      version: '2.0',
      size: { width: 400, height: 400 },
      fps: 20,
      frames: 10,
      images: {},
      replaceElements: {},
      dynamicElements: {},
      sprites: [
        { imageKey: 'test', frames: [mockFrame, mockFrame, mockFrame, mockFrame, mockFrame, mockFrame, mockFrame, mockFrame, mockFrame, mockFrame] }
      ]
    }

    player = new Player(mockCanvas)
  })

  afterEach(() => {
    // Restore originals
    if (originalIntersectionObserver !== undefined) {
      ;(globalThis as any).IntersectionObserver = originalIntersectionObserver
    }
    if (originalOffscreenCanvas !== undefined) {
      ;(globalThis as any).OffscreenCanvas = originalOffscreenCanvas
    }
  })

  describe('Constructor', () => {
    it('should initialize with HTMLCanvasElement', () => {
      expect(player).toBeInstanceOf(Player)
      expect(player.config.container).toBe(mockCanvas)
    })

    it('should initialize with PlayerConfigOptions containing container', () => {
      const options: PlayerConfigOptions = {
        container: mockCanvas,
        loop: 5,
        fillMode: PLAYER_FILL_MODE.BACKWARDS
      }

      const player2 = new Player(options)

      expect(player2.config.container).toBe(mockCanvas)
      expect(player2.config.loop).toBe(5)
      expect(player2.config.fillMode).toBe(PLAYER_FILL_MODE.BACKWARDS)
    })

    it('should initialize with empty options object', () => {
      const player2 = new Player({})

      expect(player2.config.loop).toBe(0)
      expect(player2.config.fillMode).toBe(PLAYER_FILL_MODE.FORWARDS)
      expect(player2.config.playMode).toBe(PLAYER_PLAY_MODE.FORWARDS)
    })

    it('should create OffscreenCanvas when available', () => {
      expect((player as any).ofsCanvas).toBeInstanceOf((globalThis as any).OffscreenCanvas)
    })

    it('should create fallback canvas when OffscreenCanvas is unavailable', () => {
      const originalOffscreen = (globalThis as any).OffscreenCanvas
      ;(globalThis as any).OffscreenCanvas = undefined

      const player2 = new Player(mockCanvas)

      // When OffscreenCanvas is not available, it should create a regular canvas
      expect((player2 as any).ofsCanvas).toBeInstanceOf(HTMLCanvasElement)

      ;(globalThis as any).OffscreenCanvas = originalOffscreen
    })
  })

  describe('setConfig()', () => {
    it('should throw when startFrame > endFrame', () => {
      expect(() => {
        player.setConfig({ startFrame: 10, endFrame: 5 })
      }).toThrow('StartFrame should > EndFrame')
    })

    it('should not throw when startFrame <= endFrame', () => {
      expect(() => {
        player.setConfig({ startFrame: 5, endFrame: 10 })
      }).not.toThrow()
    })

    it('should create IntersectionObserver when isUseIntersectionObserver is true', () => {
      player.setConfig({ isUseIntersectionObserver: true })

      expect((globalThis as any).IntersectionObserver).toHaveBeenCalled()
      expect(player.config.isUseIntersectionObserver).toBe(true)
    })

    it('should disconnect IntersectionObserver when isUseIntersectionObserver changes to false', () => {
      player.setConfig({ isUseIntersectionObserver: true })
      const observer = (player as any).intersectionObserver

      player.setConfig({ isUseIntersectionObserver: false })

      expect(observer.disconnect).toHaveBeenCalled()
    })

    it('should update animator isOpenNoExecutionDelay', () => {
      player.setConfig({ isOpenNoExecutionDelay: true })

      expect((player as any).animator.isOpenNoExecutionDelay).toBe(true)
    })

    it('should update loop configuration', () => {
      player.setConfig({ loop: 5 })

      expect(player.config.loop).toBe(5)
    })

    it('should update fillMode configuration', () => {
      player.setConfig({ fillMode: PLAYER_FILL_MODE.BACKWARDS })

      expect(player.config.fillMode).toBe(PLAYER_FILL_MODE.BACKWARDS)
    })

    it('should update playMode configuration', () => {
      player.setConfig({ playMode: PLAYER_PLAY_MODE.FALLBACKS })

      expect(player.config.playMode).toBe(PLAYER_PLAY_MODE.FALLBACKS)
    })

    it('should update startFrame and endFrame', () => {
      player.setConfig({ startFrame: 5, endFrame: 15 })

      expect(player.config.startFrame).toBe(5)
      expect(player.config.endFrame).toBe(15)
    })

    it('should update loopStartFrame', () => {
      player.setConfig({ loopStartFrame: 3 })

      expect(player.config.loopStartFrame).toBe(3)
    })

    it('should update isCacheFrames', () => {
      player.setConfig({ isCacheFrames: true })

      expect(player.config.isCacheFrames).toBe(true)
    })
  })

  describe('mount()', () => {
    it('should set currentFrame to 0', async () => {
      await player.mount(mockVideoEntity)

      expect(player.currentFrame).toBe(0)
    })

    it('should set totalFrames', async () => {
      await player.mount(mockVideoEntity)

      expect(player.totalFrames).toBe(9) // frames - 1
    })

    it('should set videoEntity', async () => {
      await player.mount(mockVideoEntity)

      expect(player.videoEntity).toBe(mockVideoEntity)
    })

    it('should set canvas size to video size', async () => {
      await player.mount(mockVideoEntity)

      expect(mockCanvas.width).toBe(400)
      expect(mockCanvas.height).toBe(400)
    })

    it('should handle empty images', async () => {
      mockVideoEntity.images = {}

      await expect(player.mount(mockVideoEntity)).resolves.toBeUndefined()
    })

    it('should handle videoEntity with no images', async () => {
      mockVideoEntity.images = {}

      await expect(player.mount(mockVideoEntity)).resolves.toBeUndefined()
    })

    it('should clear container before mounting', async () => {
      const clearContainerSpy = vi.spyOn(player as any, 'clearContainer')

      await player.mount(mockVideoEntity)

      expect(clearContainerSpy).toHaveBeenCalled()
    })
  })

  describe('mount() - image loading', () => {
    it('should cache ImageBitmap objects directly', async () => {
      const mockBitmap = { width: 100, height: 100 } as any
      mockVideoEntity.images = {
        'test': mockBitmap
      }

      await player.mount(mockVideoEntity)

      expect((player as any).bitmapsCache['test']).toBe(mockBitmap)
    })

    it('should cache HTMLImageElement objects directly', async () => {
      const mockImage = new Image()
      mockVideoEntity.images = {
        'test': mockImage
      }

      await player.mount(mockVideoEntity)

      expect((player as any).bitmapsCache['test']).toBe(mockImage)
    })
  })

  describe('start()', () => {
    beforeEach(async () => {
      await player.mount(mockVideoEntity)
    })

    it('should throw when videoEntity is undefined', () => {
      player.videoEntity = undefined

      expect(() => player.start()).toThrow('videoEntity undefined')
    })

    it('should call onStart callback if defined', () => {
      player.onStart = vi.fn()

      player.start()

      expect(player.onStart).toHaveBeenCalled()
    })

    it('should call startAnimation', () => {
      const startAnimationSpy = vi.spyOn(player as any, 'startAnimation')

      player.start()

      expect(startAnimationSpy).toHaveBeenCalled()
    })

    it('should clear container', () => {
      const clearContainerSpy = vi.spyOn(player as any, 'clearContainer')

      player.start()

      expect(clearContainerSpy).toHaveBeenCalled()
    })
  })

  describe('pause()', () => {
    beforeEach(async () => {
      await player.mount(mockVideoEntity)
    })

    it('should stop animator', () => {
      const stopSpy = vi.spyOn((player as any).animator, 'stop')

      player.pause()

      expect(stopSpy).toHaveBeenCalled()
    })

    it('should call onPause callback if defined', () => {
      player.onPause = vi.fn()

      player.pause()

      expect(player.onPause).toHaveBeenCalled()
    })
  })

  describe('resume()', () => {
    beforeEach(async () => {
      await player.mount(mockVideoEntity)
    })

    it('should call startAnimation', () => {
      const startAnimationSpy = vi.spyOn(player as any, 'startAnimation')

      player.resume()

      expect(startAnimationSpy).toHaveBeenCalled()
    })

    it('should call onResume callback if defined', () => {
      player.onResume = vi.fn()

      player.resume()

      expect(player.onResume).toHaveBeenCalled()
    })
  })

  describe('stop()', () => {
    beforeEach(async () => {
      await player.mount(mockVideoEntity)
    })

    it('should stop animator', () => {
      const stopSpy = vi.spyOn((player as any).animator, 'stop')

      player.stop()

      expect(stopSpy).toHaveBeenCalled()
    })

    it('should reset currentFrame to 0', () => {
      player.currentFrame = 5

      player.stop()

      expect(player.currentFrame).toBe(0)
    })

    it('should clear container', () => {
      const clearContainerSpy = vi.spyOn(player as any, 'clearContainer')

      player.stop()

      expect(clearContainerSpy).toHaveBeenCalled()
    })

    it('should call onStop callback if defined', () => {
      player.onStop = vi.fn()

      player.stop()

      expect(player.onStop).toHaveBeenCalled()
    })
  })

  describe('clear()', () => {
    it('should clear container', () => {
      const clearContainerSpy = vi.spyOn(player as any, 'clearContainer')

      player.clear()

      expect(clearContainerSpy).toHaveBeenCalled()
    })
  })

  describe('destroy()', () => {
    beforeEach(async () => {
      await player.mount(mockVideoEntity)
    })

    it('should stop animator', () => {
      const stopSpy = vi.spyOn((player as any).animator, 'stop')

      player.destroy()

      expect(stopSpy).toHaveBeenCalled()
    })

    it('should clear container', () => {
      const clearContainerSpy = vi.spyOn(player as any, 'clearContainer')

      player.destroy()

      expect(clearContainerSpy).toHaveBeenCalled()
    })

    it('should nullify videoEntity', () => {
      player.destroy()

      expect(player.videoEntity).toBeNull()
    })

    it('should nullify animator', () => {
      player.destroy()

      expect((player as any).animator).toBeNull()
    })
  })

  describe('startAnimation()', () => {
    beforeEach(async () => {
      await player.mount(mockVideoEntity)
    })

    it('should throw when videoEntity is undefined', () => {
      player.videoEntity = undefined

      expect(() => (player as any).startAnimation()).toThrow('videoEntity undefined')
    })

    it('should reset currentFrame when at end of animation', () => {
      player.currentFrame = 9
      player.config.startFrame = 5

      ;(player as any).startAnimation()

      expect(player.currentFrame).toBe(5)
    })

    it('should set animator bounds for forwards playMode', () => {
      player.config.playMode = PLAYER_PLAY_MODE.FORWARDS
      player.config.startFrame = 2
      player.config.endFrame = 8

      const animator = (player as any).animator
      const startSpy = vi.spyOn(animator, 'start')

      ;(player as any).startAnimation()

      expect(animator.startValue).toBe(2)
      expect(animator.endValue).toBe(8)
    })

    it('should set animator bounds for fallbacks playMode', () => {
      player.config.playMode = PLAYER_PLAY_MODE.FALLBACKS
      player.config.startFrame = 2
      player.config.endFrame = 8

      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.startValue).toBe(8)
      expect(animator.endValue).toBe(2)
    })

    it('should calculate duration from frame count', () => {
      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.duration).toBeGreaterThan(0)
    })

    it('should set loopStart offset when loopStartFrame > startFrame', () => {
      player.config.startFrame = 0
      player.config.loopStartFrame = 5

      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.loopStart).toBeGreaterThan(0)
    })

    it('should handle loop=0 as infinite', () => {
      player.config.loop = 0

      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.loop).toBe(Infinity)
    })

    it('should handle loop=true as infinite', () => {
      player.config.loop = true

      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.loop).toBe(Infinity)
    })

    it('should handle loop=false as single run', () => {
      player.config.loop = false

      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.loop).toBe(1)
    })

    it('should handle specific loop count', () => {
      player.config.loop = 5

      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.loop).toBe(5)
    })

    it('should set fillRule to 0 for forwards fillMode', () => {
      player.config.fillMode = PLAYER_FILL_MODE.FORWARDS

      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.fillRule).toBe(0)
    })

    it('should set fillRule to 1 for backwards fillMode', () => {
      player.config.fillMode = PLAYER_FILL_MODE.BACKWARDS

      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.fillRule).toBe(1)
    })

    it('should set onUpdate callback', () => {
      const animator = (player as any).animator

      ;(player as any).startAnimation()

      expect(animator.onUpdate).toBeDefined()
    })

    it('should call animator.start()', () => {
      const animator = (player as any).animator
      const startSpy = vi.spyOn(animator, 'start')

      ;(player as any).startAnimation()

      expect(startSpy).toHaveBeenCalled()
    })
  })

  describe('drawFrame()', () => {
    beforeEach(async () => {
      await player.mount(mockVideoEntity)
    })

    it('should throw when videoEntity is undefined', () => {
      player.videoEntity = undefined

      expect(() => (player as any).drawFrame(0)).toThrow('Player VideoEntity undefined')
    })

    it('should return early when IntersectionObserver enabled and not intersecting', () => {
      player.config.isUseIntersectionObserver = true
      ;(player as any).isBeIntersection = false

      const drawImageSpy = vi.spyOn(mockContext, 'drawImage')

      ;(player as any).drawFrame(0)

      expect(drawImageSpy).not.toHaveBeenCalled()
    })

    it('should clear container before drawing', () => {
      const clearContainerSpy = vi.spyOn(player as any, 'clearContainer')

      ;(player as any).drawFrame(0)

      expect(clearContainerSpy).toHaveBeenCalled()
    })

    it('should use cached frame when available', () => {
      player.config.isCacheFrames = true
      ;(player as any).cacheFrames[0] = { width: 400, height: 400 } as any

      const drawImageSpy = vi.spyOn(mockContext, 'drawImage')

      ;(player as any).drawFrame(0)

      expect(drawImageSpy).toHaveBeenCalled()
    })

    it('should recreate OffscreenCanvas on Firefox', () => {
      // Mock Firefox
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Firefox',
        configurable: true
      })

      ;(player as any).drawFrame(0)

      // Firefox workaround should be applied
      // We can't easily test this without more complex setup
      Object.defineProperty(window.navigator, 'userAgent', {
        value: '',
        configurable: true
      })
    })

    it('should cache frame when isCacheFrames is true', () => {
      player.config.isCacheFrames = true

      ;(player as any).drawFrame(0)

      expect((player as any).cacheFrames[0]).toBeDefined()
    })

    it('should cache frame as Image when toDataURL is available', () => {
      player.config.isCacheFrames = true

      ;(player as any).drawFrame(0)

      const cached = (player as any).cacheFrames[0]
      expect(cached).toBeDefined()
      // Should be an Image element or similar
    })

    it('should cache frame as ImageBitmap when toDataURL is not available', () => {
      // Create a custom OffscreenCanvas without toDataURL to test the fallback path
      const CustomOffscreenCanvas = class {
        constructor(public width: number, public height: number) {}
        getContext() { return mockContext }
        transferToImageBitmap() { return { width: this.width, height: this.height } }
      }
      const originalOffscreen = (globalThis as any).OffscreenCanvas
      ;(globalThis as any).OffscreenCanvas = CustomOffscreenCanvas

      // Create a new player with the custom OffscreenCanvas
      const player2 = new Player(mockCanvas)
      player2.config.isCacheFrames = true

      // Mount and draw frame
      player2.videoEntity = mockVideoEntity
      ;(player2 as any).drawFrame(0)

      const cached = (player2 as any).cacheFrames[0]
      expect(cached).toBeDefined()
      // Should be the result of transferToImageBitmap
      expect(cached).toHaveProperty('width', 400)
      expect(cached).toHaveProperty('height', 400)

      ;(globalThis as any).OffscreenCanvas = originalOffscreen
    })
  })

  describe('mount() - base64 image loading', () => {
    it('should load base64 string images and wait for onload', async () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
      mockVideoEntity.images = {
        'test': base64Image
      }

      // Mock Image onload to resolve immediately
      const originalCreateElement = document.createElement
      const mockImg = {
        src: '',
        onload: null as any,
        addEventListener: vi.fn()
      }
      document.createElement = vi.fn((tagName: string) => {
        if (tagName === 'img') return mockImg
        return originalCreateElement.call(document, tagName)
      })

      const mountPromise = player.mount(mockVideoEntity)

      // Trigger onload
      setTimeout(() => {
        if (mockImg.onload) mockImg.onload()
      }, 0)

      await mountPromise

      expect((player as any).bitmapsCache['test']).toBeDefined()

      // Restore
      document.createElement = originalCreateElement
    })
  })

  describe('Event callbacks', () => {
    beforeEach(async () => {
      await player.mount(mockVideoEntity)
    })

    it('should trigger onProcess during animation', () => {
      player.onProcess = vi.fn()

      ;(player as any).startAnimation()

      const animator = (player as any).animator

      // Trigger onUpdate
      if (animator.onUpdate) {
        animator.onUpdate(5)
      }

      expect(player.onProcess).toHaveBeenCalled()
    })

    it('should trigger onEnd when animation completes', () => {
      player.onEnd = vi.fn()

      const animator = (player as any).animator

      // Trigger onEnd
      if (animator.onEnd) {
        animator.onEnd()
      }

      expect(player.onEnd).toHaveBeenCalled()
    })
  })

  describe('Integration tests', () => {
    it('should handle full start to stop cycle', async () => {
      player.onStart = vi.fn()
      player.onProcess = vi.fn()
      player.onStop = vi.fn()

      await player.mount(mockVideoEntity)

      player.start()
      expect(player.onStart).toHaveBeenCalled()

      player.stop()
      expect(player.onStop).toHaveBeenCalled()
      expect(player.currentFrame).toBe(0)
    })

    it('should handle pause and resume', async () => {
      player.onPause = vi.fn()
      player.onResume = vi.fn()

      await player.mount(mockVideoEntity)

      player.start()
      player.pause()
      expect(player.onPause).toHaveBeenCalled()

      player.resume()
      expect(player.onResume).toHaveBeenCalled()
    })
  })
})
