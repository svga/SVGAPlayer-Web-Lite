import {
  PLAYER_FILL_MODE,
  PLAYER_PLAY_MODE,
  PlayerConfigOptions,
  Video,
  BitmapsCache,
  PlayerConfig
} from '../types'
import { Animator } from './animator'
import render from './render'

type EventCallback = undefined | (() => void)

type FrameCache = { [key: string]: ImageBitmap | undefined }
type PlayerInternal = {
  animator: Animator
  isBeIntersection: boolean
  intersectionObserver: IntersectionObserver | null
  bitmapsCache: BitmapsCache
  cacheFrames: FrameCache
}
interface PlayerRuntime {
  timeline: number
  pending: Set<number>
  cacheOrder: Map<number, true>
  cacheBytes: number
}

const playerRuntimes = new WeakMap<Player, PlayerRuntime>()
const cacheLimit = 67108864

function activeRuntime (player: Player): PlayerRuntime {
  const runtime = playerRuntimes.get(player)
  if (!runtime) throw Error('destroyed')
  return runtime
}

function clearFrameCache (runtime: PlayerRuntime, cache: FrameCache): void {
  for (const key in cache) {
    ;(cache[key] as ImageBitmap).close()
    delete cache[key]
  }
  runtime.pending = new Set()
  runtime.cacheOrder.clear()
  runtime.cacheBytes = 0
}

function storeFrameCache (
  runtime: PlayerRuntime,
  cache: FrameCache,
  key: number,
  bitmap: ImageBitmap
): void {
  const bytes = bitmap.width * bitmap.height * 4
  if (bytes > cacheLimit) return bitmap.close()
  while (runtime.cacheBytes + bytes > cacheLimit) {
    const oldestKey = runtime.cacheOrder.keys().next().value as number
    const oldest = cache[oldestKey] as ImageBitmap
    runtime.cacheBytes -= oldest.width * oldest.height * 4
    oldest.close()
    delete cache[oldestKey]
    runtime.cacheOrder.delete(oldestKey)
  }
  cache[key] = bitmap
  runtime.cacheBytes += bytes
  runtime.cacheOrder.set(key, true)
}

const isFinitePositive = (value: number): boolean => Number.isFinite(value) && value > 0

function validateVideo (videoEntity: Video): void {
  const { size, fps, frames, sprites } = videoEntity
  if (
    !size ||
    ![size.width, size.height, fps].every(isFinitePositive) ||
    !Number.isInteger(frames) || frames <= 0 ||
    sprites.some(sprite => {
      if (!Array.isArray(sprite.frames) || sprite.frames.length < frames) return true
      for (let frame = frames; frame-- > 0;) if (sprite.frames[frame] === undefined) return true
      return false
    })
  ) throw Error('video')
}

function validateFrameConfig (config: PlayerConfig, totalFrames?: number): void {
  const { startFrame, endFrame, loopStartFrame } = config
  if (![startFrame, endFrame, loopStartFrame].every(Number.isInteger) || Math.min(startFrame, endFrame, loopStartFrame) < 0) throw Error('frame')

  if (endFrame && startFrame > endFrame) throw Error('start>end')

  if (
    (loopStartFrame && (loopStartFrame < startFrame || (endFrame && loopStartFrame > endFrame))) ||
    (totalFrames !== undefined && (
      startFrame > totalFrames ||
      endFrame > totalFrames ||
      loopStartFrame > (endFrame || totalFrames)
    ))
  ) throw Error('frame')
}

function disconnectObserver (player: PlayerInternal): void {
  const observer = player.intersectionObserver
  if (observer) observer.disconnect()
  player.intersectionObserver = null
}

function clearCanvas (container: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = container.getContext('2d')
  if (context) context.clearRect(0, 0, container.width, container.height)
  return context
}

function releasePlayer (player: Player): void {
  const runtime = playerRuntimes.get(player)
  if (!runtime) return
  playerRuntimes.delete(player)
  ;(player as unknown as PlayerInternal).animator.stop()
  player.config.isUseIntersectionObserver = false
  disconnectObserver(player as unknown as PlayerInternal)
  ;(player as unknown as PlayerInternal).isBeIntersection = true
  clearFrameCache(runtime, (player as unknown as PlayerInternal).cacheFrames)
  ;(player as unknown as PlayerInternal).bitmapsCache = Object.create(null) as BitmapsCache
  player.videoEntity = undefined
  player.currentFrame = 0
  player.totalFrames = 0
  clearCanvas(player.config.container)
}

/**
 * SVGA 播放器
 */
export class Player {
  /**
   * 动画当前帧数
   */
  public currentFrame: number = 0
  /**
   * 动画总帧数
   */
  public totalFrames: number = 0
  /**
   * SVGA 数据源
   */
  public videoEntity: Video | undefined = undefined

  /**
   * 当前配置项
   */
  public readonly config: PlayerConfig = {
    container: document.createElement('canvas'),
    loop: 0,
    fillMode: PLAYER_FILL_MODE.FORWARDS,
    playMode: PLAYER_PLAY_MODE.FORWARDS,
    startFrame: 0,
    endFrame: 0,
    loopStartFrame: 0,
    isCacheFrames: false,
    isUseIntersectionObserver: false,
    isOpenNoExecutionDelay: false
  }

  private readonly animator: Animator
  private readonly ofsCanvas: HTMLCanvasElement | OffscreenCanvas

  private isBeIntersection = true
  private intersectionObserver: IntersectionObserver | null = null
  private bitmapsCache: BitmapsCache = Object.create(null) as BitmapsCache
  private readonly cacheFrames: { [key: string]: HTMLImageElement | ImageBitmap} = Object.create(null) as { [key: string]: HTMLImageElement | ImageBitmap}

  constructor (options: HTMLCanvasElement | PlayerConfigOptions) {
    this.animator = new Animator()
    playerRuntimes.set(this, {
      timeline: 0,
      pending: new Set(),
      cacheOrder: new Map(),
      cacheBytes: 0
    })
    try {
      this.animator.onEnd = () => {
        const runtime = playerRuntimes.get(this)
        if (runtime) runtime.timeline = 0
        if (this.onEnd) this.onEnd()
      }
      if (options instanceof HTMLCanvasElement) {
        this.config.container = options
      } else {
        this.setConfig(options)
      }
      const OffscreenCanvas = window.OffscreenCanvas
      this.ofsCanvas = OffscreenCanvas ? new OffscreenCanvas(this.config.container.width, this.config.container.height) : document.createElement('canvas')
    } catch (error) {
      releasePlayer(this)
      throw error
    }
  }

  /**
   * 设置配置项
   * @param options 可配置项
   */
  public setConfig (options: PlayerConfigOptions): void {
    const runtime = activeRuntime(this)
    const mergedConfig = Object.create(this.config) as PlayerConfig & Record<string, unknown>
    const target = this.config as unknown as Record<string, unknown>
    Object.keys(options).forEach(key => {
      const value = (options as Record<string, unknown>)[key]
      if (value !== undefined && ({}).hasOwnProperty.call(target, key)) {
        mergedConfig[key] = value
      }
    })
    validateFrameConfig(mergedConfig, this.videoEntity && this.totalFrames)
    const containerChanged = mergedConfig.container !== this.config.container
    if (containerChanged || (this.config.isCacheFrames && !mergedConfig.isCacheFrames)) {
      clearFrameCache(runtime, this.cacheFrames as unknown as FrameCache)
    }
    Object.keys(mergedConfig).forEach(key => { target[key] = mergedConfig[key] })
    if (containerChanged && this.videoEntity) this.setSize()
    this.animator.isOpenNoExecutionDelay = this.config.isOpenNoExecutionDelay
    this.setIntersectionObserver()
  }

  private setIntersectionObserver (): void {
    disconnectObserver(this as unknown as PlayerInternal)

    if (this.config.isUseIntersectionObserver) {
      const observer = new IntersectionObserver(entries => {
        if (this.intersectionObserver !== observer || !entries.length) return
        this.isBeIntersection = entries[0].intersectionRatio > 0
      })
      this.intersectionObserver = observer
      observer.observe(this.config.container)
    } else {
      this.config.isUseIntersectionObserver = false
      this.isBeIntersection = true
    }
  }

  /**
   * 装载 SVGA 数据元
   * @param videoEntity SVGA 数据源
   * @returns Promise<void>
   */
  public async mount (videoEntity: Video): Promise<void> {
    const runtime = activeRuntime(this)
    this.animator.stop()
    runtime.timeline = 0
    clearFrameCache(runtime, this.cacheFrames as unknown as FrameCache)
    const bitmapsCache = this.bitmapsCache = Object.create(null) as BitmapsCache
    this.videoEntity = undefined
    this.currentFrame = 0
    this.totalFrames = 0
    this.clearContainer()

    validateVideo(videoEntity)
    const totalFrames = videoEntity.frames - 1
    validateFrameConfig(this.config, totalFrames)

    await Promise.all(Object.keys(videoEntity.images).map(key => {
      const image = videoEntity.images[key]
      if (typeof image !== 'string') return void (bitmapsCache[key] = image)
      return new Promise<void>((resolve, reject) => {
        const img = document.createElement('img')
        img.onload = resolve as unknown as typeof img.onload
        img.onerror = () => reject(Error('image:' + key))
        img.src = 'data:image/png;base64,' + image
        bitmapsCache[key] = img
      })
    }))
    if (this.bitmapsCache !== bitmapsCache) return
    validateFrameConfig(this.config, totalFrames)
    this.videoEntity = videoEntity
    this.totalFrames = totalFrames
    this.setSize()
  }

  /**
   * 开始播放事件回调
   */
  public onStart: EventCallback
  /**
   * 重新播放事件回调
   */
  public onResume: EventCallback
  /**
   * 暂停播放事件回调
   */
  public onPause: EventCallback
  /**
   * 停止播放事件回调
   */
  public onStop: EventCallback
  /**
   * 播放中事件回调
   */
  public onProcess: EventCallback
  /**
   * 播放结束事件回调
   */
  public onEnd: EventCallback

  private clearContainer (): CanvasRenderingContext2D | null {
    return clearCanvas(this.config.container)
  }

  /**
   * 开始播放
   */
  public start (): void {
    const runtime = activeRuntime(this)
    if (!this.videoEntity) throw Error('video')
    runtime.timeline = -this.animator.currentTimeMillsecond() - 1
    const { config } = this
    const endFrame = config.endFrame || this.totalFrames
    this.currentFrame = config.playMode === PLAYER_PLAY_MODE.FORWARDS
      ? config.startFrame
      : endFrame
    this.drawFrame(this.currentFrame)
    this.animator.onStart = () => {
      if (this.onStart) this.onStart()
    }
    this.startAnimation(false)
  }

  /**
   * 重新播放
   */
  public resume (): void {
    const runtime = activeRuntime(this)
    if (!this.videoEntity) throw Error('video')
    if (runtime.timeline < 0) {
      if (this.onResume) this.onResume()
      return
    }
    const animator = this.animator
    const clock = animator.currentTimeMillsecond
    const origin = clock() - runtime.timeline
    runtime.timeline = -origin - 1
    animator.currentTimeMillsecond = () => {
      animator.currentTimeMillsecond = clock
      return origin
    }
    animator.onStart = () => {
      if (this.onResume) this.onResume()
    }
    this.startAnimation(true)
  }

  /**
   * 暂停播放
   */
  public pause (): void {
    const runtime = activeRuntime(this)
    if (runtime.timeline < 0) runtime.timeline += this.animator.currentTimeMillsecond() + 1
    this.animator.stop()
    if (this.onPause) this.onPause()
  }

  /**
   * 停止播放
   */
  public stop (): void {
    const runtime = activeRuntime(this)
    runtime.timeline = 0
    this.animator.stop()
    this.currentFrame = this.config.startFrame
    this.clearContainer()
    if (this.onStop) this.onStop()
  }

  /**
   * 清理容器画布
   */
  public clear (): void {
    this.clearContainer()
  }

  /**
   * 销毁实例
   */
  public destroy (): void {
    releasePlayer(this)
  }

  private startAnimation (isResume: boolean): void {
    const { config, totalFrames } = this
    const videoEntity = this.videoEntity as Video
    const animator = this.animator
    const { playMode, startFrame, endFrame, loopStartFrame, fillMode, loop } = config
    const effectiveEndFrame = endFrame || totalFrames

    if (playMode === PLAYER_PLAY_MODE.FORWARDS) {
      animator.startValue = startFrame
      animator.endValue = effectiveEndFrame
    } else {
      animator.startValue = effectiveEndFrame
      animator.endValue = startFrame
    }

    const frameDuration = 1000 / videoEntity.fps
    animator.duration = Math.abs(animator.endValue - animator.startValue) * frameDuration
    animator.loopStart = loopStartFrame > startFrame
      ? (loopStartFrame - startFrame) * frameDuration
      : 0
    animator.loop = loop === false ? 1 : (loop === true || loop <= 0 ? Infinity : loop)
    animator.fillRule = fillMode === 'backwards' ? 1 : 0

    animator.onUpdate = (value: number) => {
      if (isResume) {
        isResume = false
        return
      }
      if (this.currentFrame === value) return
      this.currentFrame = value
      this.drawFrame(value)
      if (this.onProcess) this.onProcess()
    }

    animator.start()
  }

  private setSize (): void {
    const size = (this.videoEntity as Video).size
    const { container } = this.config
    if (container.width !== size.width) container.width = size.width
    if (container.height !== size.height) container.height = size.height
  }

  /// ----------- 描绘一帧 -----------
  private drawFrame (frame: number): void {
    if (this.config.isUseIntersectionObserver && !this.isBeIntersection) return

    const { container } = this.config
    const context = this.clearContainer()
    if (!context) throw Error()

    const cache = this.cacheFrames as unknown as FrameCache
    const isCacheFrames = this.config.isCacheFrames
    const runtime = isCacheFrames ? activeRuntime(this) : undefined
    const cachedFrame = isCacheFrames && cache[frame]
    if (cachedFrame) {
      const order = (runtime as PlayerRuntime).cacheOrder
      order.delete(frame)
      order.set(frame, true)
      context.drawImage(cachedFrame, 0, 0)
      return
    }

    const videoEntity = this.videoEntity as Video
    let ofsCanvas = this.ofsCanvas

    // OffscreenCanvas 在 Firefox 浏览器无法被清理历史内容
    const OffscreenCanvas = window.OffscreenCanvas
    if (OffscreenCanvas && window.navigator.userAgent.includes('Firefox')) {
      ofsCanvas = new OffscreenCanvas(container.width, container.height)
    }

    if (ofsCanvas.width !== container.width) ofsCanvas.width = container.width
    if (ofsCanvas.height !== container.height) ofsCanvas.height = container.height
    const ofsContext = ofsCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (ofsContext) ofsContext.clearRect(0, 0, ofsCanvas.width, ofsCanvas.height)

    render(
      ofsCanvas,
      this.bitmapsCache,
      videoEntity.dynamicElements,
      videoEntity.replaceElements,
      videoEntity,
      frame
    )

    context.drawImage(ofsCanvas, 0, 0)

    if (isCacheFrames) {
      const active = runtime as PlayerRuntime
      const pending = active.pending

      if ('transferToImageBitmap' in ofsCanvas) {
        try {
          storeFrameCache(active, cache, frame, ofsCanvas.transferToImageBitmap())
        } catch {
          // Caching is optional and must never interrupt playback.
        }
      } else if (typeof createImageBitmap === 'function' && !pending.has(frame)) {
        pending.add(frame)
        void createImageBitmap(ofsCanvas).then(bitmap => {
          if (active.pending !== pending) bitmap.close()
          else storeFrameCache(active, cache, frame, bitmap)
          pending.delete(frame)
        }, () => { pending.delete(frame) })
      }
    }
  }
}
