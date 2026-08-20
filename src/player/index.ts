import {
  PlayerConfigOptions,
  Video,
  BitmapsCache,
  PlayerConfig,
  Drawable
} from '../types'
import { Animator } from './animator'
import render from './render'
import { validateVideo } from '../validate-video'

type EventCallback = undefined | (() => void)
type ProcessCallback = undefined | ((progress: number) => void)
type ImageRelease = ImageBitmap | (() => void)

type FrameCache = { [key: string]: ImageBitmap | undefined }
type PlayerInternal = {
  __svgaAnimator: Animator
  __svgaVisible: boolean
  __svgaObserver: IntersectionObserver | null
  __svgaImages: BitmapsCache
  __svgaFrames: FrameCache
  __svgaConfig: PlayerConfig
  __svgaOwned: ImageRelease[]
}
interface PlayerRuntime {
  __svgaTimeline: number
  __svgaPending: Set<number>
  __svgaOrder: Map<number, true>
  __svgaBytes: number
}

const playerRuntimes = new WeakMap<Player, PlayerRuntime>()
const cacheLimit = 67108864

function activeRuntime (player: Player): PlayerRuntime {
  const runtime = playerRuntimes.get(player)
  if (!runtime) throw Error('destroyed')
  return runtime
}

function closeBitmap (bitmap: ImageBitmap): void {
  try { bitmap.close() } catch {}
}

function clearFrameCache (runtime: PlayerRuntime, cache: FrameCache): void {
  for (const key in cache) {
    closeBitmap(cache[key] as ImageBitmap)
    delete cache[key]
  }
  runtime.__svgaPending = new Set()
  runtime.__svgaOrder.clear()
  runtime.__svgaBytes = 0
}

function storeFrameCache (
  runtime: PlayerRuntime,
  cache: FrameCache,
  key: number,
  bitmap: ImageBitmap
): void {
  const bytes = bitmap.width * bitmap.height * 4
  if (bytes > cacheLimit) {
    closeBitmap(bitmap)
    return
  }
  while (runtime.__svgaBytes + bytes > cacheLimit) {
    const oldestKey = runtime.__svgaOrder.keys().next().value as number
    const oldest = cache[oldestKey] as ImageBitmap
    runtime.__svgaBytes -= oldest.width * oldest.height * 4
    delete cache[oldestKey]
    runtime.__svgaOrder.delete(oldestKey)
    closeBitmap(oldest)
  }
  try {
    cache[key] = bitmap
    runtime.__svgaOrder.set(key, true)
    runtime.__svgaBytes += bytes
  } catch {
    delete cache[key]
    runtime.__svgaOrder.delete(key)
    closeBitmap(bitmap)
  }
}

function releaseImages (images: ImageRelease[]): void {
  for (const image of images.splice(0)) {
    try {
      if (typeof image === 'function') image()
      else closeBitmap(image)
    } catch {}
  }
}

function validateBitmap (bitmap: { width: number, height: number }, key: string): void {
  if (
    !Number.isFinite(bitmap.width) || !Number.isFinite(bitmap.height) ||
    bitmap.width <= 0 || bitmap.height <= 0 ||
    bitmap.width * bitmap.height > 16_777_216
  ) throw Error('image:' + key)
}

async function decodeBitmap (
  bytes: Uint8Array,
  key: string,
  releases: ImageRelease[],
  isActive: () => boolean
): Promise<Drawable | undefined> {
  const blob = new Blob([new Uint8Array(bytes)])
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    if (!isActive()) {
      closeBitmap(bitmap)
      return
    }
    try { validateBitmap(bitmap, key) } catch (error) {
      closeBitmap(bitmap)
      throw error
    }
    releases.push(bitmap)
    return bitmap
  }
  return await new Promise<Drawable | undefined>((resolve, reject) => {
    const image = document.createElement('img')
    let owned = true
    let settle = () => { resolve(undefined) }
    let url: string
    const cleanup = () => {
      if (!owned) return
      owned = false
      image.onload = image.onerror = null
      image.removeAttribute('src')
      try { window.URL.revokeObjectURL(url) } catch {}
      settle()
    }
    url = window.URL.createObjectURL(blob)
    releases.push(cleanup)
    image.onload = () => {
      if (!isActive()) return cleanup()
      try { validateBitmap(image, key) } catch (error) {
        settle = () => {}
        cleanup()
        reject(error)
        return
      }
      image.onload = image.onerror = null
      settle = () => {}
      resolve(image)
    }
    image.onerror = () => {
      settle = () => {}
      cleanup()
      reject(Error('image:' + key))
    }
    image.src = url
  })
}

function validateConfig (config: PlayerConfig, totalFrames?: number): void {
  const { startFrame, endFrame, loopStartFrame } = config
  if (!(config.container instanceof HTMLCanvasElement)) throw Error('container')
  if (!(typeof config.loop === 'boolean' || (Number.isInteger(config.loop) && config.loop >= 0))) throw Error('loop')
  if (config.fillMode !== 'forwards' && config.fillMode !== 'backwards') throw Error('fillMode')
  if (config.playMode !== 'forwards' && config.playMode !== 'fallbacks') throw Error('playMode')
  if (![
    config.isCacheFrames,
    config.isUseIntersectionObserver,
    config.isOpenNoExecutionDelay,
    config.isDisableOffscreenCanvas
  ].every(value => typeof value === 'boolean')) throw Error('flag')
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
  const effectiveEnd = endFrame || totalFrames
  const looping = config.loop === true || config.loop === 0 || (typeof config.loop === 'number' && config.loop > 1)
  if (looping && effectiveEnd !== 0 && loopStartFrame === effectiveEnd) throw Error('loop segment')
}

function createOffscreen (
  width: number,
  height: number,
  isDisabled: boolean
): HTMLCanvasElement | OffscreenCanvas {
  if (isDisabled) return document.createElement('canvas')
  const Canvas = window.OffscreenCanvas
  if (Canvas) {
    try {
      const canvas = new Canvas(width, height)
      const context = canvas.getContext('2d')
      if (context && 'save' in context) return canvas
    } catch {}
  }
  return document.createElement('canvas')
}

function disconnectObserver (player: PlayerInternal): void {
  const observer = player.__svgaObserver
  if (observer) observer.disconnect()
  player.__svgaObserver = null
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
  const internal = player as unknown as PlayerInternal
  internal.__svgaAnimator.__svgaStop()
  internal.__svgaConfig.isUseIntersectionObserver = false
  disconnectObserver(internal)
  internal.__svgaVisible = true
  clearFrameCache(runtime, internal.__svgaFrames)
  releaseImages(internal.__svgaOwned)
  internal.__svgaImages = Object.create(null) as BitmapsCache
  player.videoEntity = undefined
  player.currentFrame = 0
  player.totalFrames = 0
  clearCanvas(internal.__svgaConfig.container)
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
  private readonly __svgaConfig: PlayerConfig = {
    container: document.createElement('canvas'),
    loop: 0,
    fillMode: 'forwards',
    playMode: 'forwards',
    startFrame: 0,
    endFrame: 0,
    loopStartFrame: 0,
    isCacheFrames: false,
    isUseIntersectionObserver: false,
    isOpenNoExecutionDelay: false,
    isDisableOffscreenCanvas: false
  }

  private readonly __svgaAnimator: Animator
  private __svgaCanvas!: HTMLCanvasElement | OffscreenCanvas

  private __svgaVisible = true
  private __svgaObserver: IntersectionObserver | null = null
  private __svgaImages: BitmapsCache = Object.create(null) as BitmapsCache
  private __svgaOwned: ImageRelease[] = []
  private readonly __svgaFrames: FrameCache = Object.create(null) as FrameCache

  public get config (): Readonly<PlayerConfig> {
    return Object.freeze({ ...this.__svgaConfig })
  }

  /**
   * 当前播放进度，取值范围 0 到 1
   */
  public get progress (): number {
    if (!this.videoEntity) return 0
    if (this.totalFrames === 0) return 1
    return Math.min(1, Math.max(0, (this.currentFrame + 1) / (this.totalFrames + 1)))
  }

  constructor (options: HTMLCanvasElement | PlayerConfigOptions) {
    this.__svgaAnimator = new Animator()
    playerRuntimes.set(this, {
      __svgaTimeline: 0,
      __svgaPending: new Set(),
      __svgaOrder: new Map(),
      __svgaBytes: 0
    })
    try {
      this.__svgaAnimator.__svgaOnEnd = () => {
        const runtime = playerRuntimes.get(this)
        if (runtime) runtime.__svgaTimeline = 0
        if (this.onEnd) this.onEnd()
      }
      this.setConfig(options instanceof HTMLCanvasElement ? { container: options } : options)
      this.__svgaCanvas = createOffscreen(
        this.__svgaConfig.container.width,
        this.__svgaConfig.container.height,
        this.__svgaConfig.isDisableOffscreenCanvas
      )
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
    const mergedConfig = { ...this.__svgaConfig } as PlayerConfig & Record<string, unknown>
    const target = this.__svgaConfig as unknown as Record<string, unknown>
    Object.keys(options).forEach(key => {
      const value = (options as Record<string, unknown>)[key]
      if (value !== undefined && ({}).hasOwnProperty.call(target, key)) {
        mergedConfig[key] = value
      }
    })
    validateConfig(mergedConfig, this.videoEntity ? this.totalFrames : undefined)
    const containerChanged = mergedConfig.container !== this.__svgaConfig.container
    const observerChanged = containerChanged || mergedConfig.isUseIntersectionObserver !== this.__svgaConfig.isUseIntersectionObserver
    const offscreenChanged = mergedConfig.isDisableOffscreenCanvas !== this.__svgaConfig.isDisableOffscreenCanvas
    if (containerChanged || offscreenChanged || (this.__svgaConfig.isCacheFrames && !mergedConfig.isCacheFrames)) {
      clearFrameCache(runtime, this.__svgaFrames)
    }
    Object.keys(this.__svgaConfig).forEach(key => { target[key] = mergedConfig[key] })
    const currentCanvas = (this as unknown as { __svgaCanvas?: HTMLCanvasElement | OffscreenCanvas }).__svgaCanvas
    if (offscreenChanged && currentCanvas) {
      this.__svgaCanvas = createOffscreen(
        this.__svgaConfig.container.width,
        this.__svgaConfig.container.height,
        this.__svgaConfig.isDisableOffscreenCanvas
      )
    }
    if (containerChanged && this.videoEntity) this.__svgaSize()
    this.__svgaAnimator.__svgaNoDelay = this.__svgaConfig.isOpenNoExecutionDelay
    if (observerChanged) this.__svgaObserve()
  }

  private __svgaObserve (): void {
    disconnectObserver(this as unknown as PlayerInternal)

    const wasVisible = this.__svgaVisible
    if (this.__svgaConfig.isUseIntersectionObserver) {
      const observer = new IntersectionObserver(entries => {
        if (this.__svgaObserver !== observer || !entries.length) return
        const wasVisible = this.__svgaVisible
        this.__svgaVisible = entries[0].intersectionRatio > 0
        if (!wasVisible && this.__svgaVisible && this.videoEntity) this.__svgaDraw(this.currentFrame)
      })
      this.__svgaObserver = observer
      observer.observe(this.__svgaConfig.container)
    } else {
      this.__svgaVisible = true
      if (!wasVisible && this.videoEntity) this.__svgaDraw(this.currentFrame)
    }
  }

  /**
   * 装载 SVGA 数据元
   * @param videoEntity SVGA 数据源
   * @returns Promise<void>
   */
  public async mount (videoEntity: Video): Promise<void> {
    const runtime = activeRuntime(this)
    this.__svgaAnimator.__svgaStop()
    runtime.__svgaTimeline = 0
    clearFrameCache(runtime, this.__svgaFrames)
    releaseImages(this.__svgaOwned)
    const bitmapsCache = this.__svgaImages = Object.create(null) as BitmapsCache
    const imageReleases: ImageRelease[] = []
    this.__svgaOwned = imageReleases
    this.videoEntity = undefined
    this.currentFrame = 0
    this.totalFrames = 0
    this.__svgaClear()

    validateVideo(videoEntity)
    let totalFrames = videoEntity.frames - 1
    validateConfig(this.__svgaConfig, totalFrames)

    let pixels = 0
    const images = Object.entries(videoEntity.images)
    for (let index = 0; index < images.length; index++) {
      const [key, bytes] = images[index]
      try {
        const resource = await decodeBitmap(
          bytes, key, imageReleases,
          () => this.__svgaImages === bitmapsCache
        )
        if (!resource || this.__svgaImages !== bitmapsCache) {
          releaseImages(imageReleases)
          return
        }
        bitmapsCache[key] = resource
        pixels += resource.width * resource.height
        if (pixels > 33_554_432 || (pixels === 33_554_432 && index < images.length - 1)) throw Error('image pixels')
      } catch (error) {
        releaseImages(imageReleases)
        if (this.__svgaImages === bitmapsCache) this.__svgaImages = Object.create(null) as BitmapsCache
        throw error
      }
    }
    if (this.__svgaImages !== bitmapsCache) {
      releaseImages(imageReleases)
      return
    }
    try {
      validateVideo(videoEntity)
      totalFrames = videoEntity.frames - 1
      if (
        images.length !== Object.keys(videoEntity.images).length ||
        images.some(([key, bytes]) => videoEntity.images[key] !== bytes)
      ) throw Error('video')
      validateConfig(this.__svgaConfig, totalFrames)
    } catch (error) {
      releaseImages(imageReleases)
      this.__svgaImages = Object.create(null) as BitmapsCache
      throw error
    }
    this.videoEntity = videoEntity
    this.totalFrames = totalFrames
    this.__svgaSize()
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
  public onProcess: ProcessCallback
  /**
   * 播放结束事件回调
   */
  public onEnd: EventCallback

  private __svgaClear (): CanvasRenderingContext2D | null {
    return clearCanvas(this.__svgaConfig.container)
  }

  /**
   * 开始播放
   */
  public start (): void {
    const runtime = activeRuntime(this)
    if (!this.videoEntity) throw Error('video')
    runtime.__svgaTimeline = -this.__svgaAnimator.__svgaClock() - 1
    const config = this.__svgaConfig
    const endFrame = config.endFrame || this.totalFrames
    this.currentFrame = config.playMode === 'forwards'
      ? config.startFrame
      : endFrame
    this.__svgaDraw(this.currentFrame)
    this.__svgaAnimator.__svgaOnStart = () => {
      if (this.onStart) this.onStart()
    }
    this.__svgaAnimate(false)
  }

  /**
   * 重新播放
   */
  public resume (): void {
    const runtime = activeRuntime(this)
    if (!this.videoEntity) throw Error('video')
    if (runtime.__svgaTimeline < 0) {
      if (this.onResume) this.onResume()
      return
    }
    const animator = this.__svgaAnimator
    const clock = animator.__svgaClock
    const origin = clock() - runtime.__svgaTimeline
    runtime.__svgaTimeline = -origin - 1
    animator.__svgaClock = () => {
      animator.__svgaClock = clock
      return origin
    }
    animator.__svgaOnStart = () => {
      if (this.onResume) this.onResume()
    }
    this.__svgaAnimate(true)
  }

  /**
   * 定位到指定帧
   * @param frame 目标帧
   * @param andPlay 定位后是否立即继续播放
   */
  public stepToFrame (frame: number, andPlay = false): void {
    const runtime = activeRuntime(this)
    const videoEntity = this.videoEntity
    if (!videoEntity) throw Error('video')
    if (typeof andPlay !== 'boolean') throw Error('andPlay')
    const config = this.__svgaConfig
    const effectiveEndFrame = config.endFrame || this.totalFrames
    if (!Number.isInteger(frame) || frame < config.startFrame || frame > effectiveEndFrame) throw Error('frame')

    this.__svgaAnimator.__svgaStop()
    const frameDuration = 1000 / videoEntity.fps
    runtime.__svgaTimeline = config.playMode === 'forwards'
      ? (frame - config.startFrame) * frameDuration
      : (effectiveEndFrame - frame) * frameDuration
    this.currentFrame = frame
    this.__svgaDraw(frame)
    if (this.onProcess) this.onProcess(this.progress)
    if (andPlay && playerRuntimes.has(this)) this.resume()
  }

  /**
   * 暂停播放
   */
  public pause (): void {
    const runtime = activeRuntime(this)
    if (runtime.__svgaTimeline < 0) runtime.__svgaTimeline += this.__svgaAnimator.__svgaClock() + 1
    this.__svgaAnimator.__svgaStop()
    if (this.onPause) this.onPause()
  }

  /**
   * 停止播放
   */
  public stop (): void {
    const runtime = activeRuntime(this)
    runtime.__svgaTimeline = 0
    this.__svgaAnimator.__svgaStop()
    this.currentFrame = this.__svgaConfig.startFrame
    this.__svgaClear()
    if (this.onStop) this.onStop()
  }

  /**
   * 清理容器画布
   */
  public clear (): void {
    this.__svgaClear()
  }

  /**
   * 销毁实例
   */
  public destroy (): void {
    releasePlayer(this)
  }

  private __svgaAnimate (isResume: boolean): void {
    const { __svgaConfig: config, totalFrames } = this
    const videoEntity = this.videoEntity as Video
    const animator = this.__svgaAnimator
    const { playMode, startFrame, endFrame, loopStartFrame, fillMode, loop } = config
    const effectiveEndFrame = endFrame || totalFrames

    if (playMode === 'forwards') {
      animator.__svgaStart = startFrame
      animator.__svgaEnd = effectiveEndFrame
    } else {
      animator.__svgaStart = effectiveEndFrame
      animator.__svgaEnd = startFrame
    }

    const frameDuration = 1000 / videoEntity.fps
    animator.__svgaDuration = Math.abs(animator.__svgaEnd - animator.__svgaStart) * frameDuration
    animator.__svgaLoopStart = loopStartFrame > startFrame
      ? (playMode === 'forwards' ? loopStartFrame - startFrame : effectiveEndFrame - loopStartFrame) * frameDuration
      : 0
    animator.__svgaLoop = loop === false ? 1 : (loop === true || loop <= 0 ? Infinity : loop)
    animator.__svgaFill = fillMode === 'backwards' ? 1 : 0

    animator.__svgaOnUpdate = (value: number) => {
      if (isResume) {
        isResume = false
        return
      }
      if (this.currentFrame === value) return
      this.currentFrame = value
      this.__svgaDraw(value)
      if (this.onProcess) this.onProcess(this.progress)
    }

    animator.__svgaRun()
  }

  private __svgaSize (): void {
    const size = (this.videoEntity as Video).size
    const { container } = this.__svgaConfig
    if (container.width !== size.width) container.width = size.width
    if (container.height !== size.height) container.height = size.height
  }

  /// ----------- 描绘一帧 -----------
  private __svgaDraw (frame: number): void {
    if (this.__svgaConfig.isUseIntersectionObserver && !this.__svgaVisible) return

    const { container } = this.__svgaConfig
    const context = this.__svgaClear()
    if (!context) throw Error()

    const cache = this.__svgaFrames
    const isCacheFrames = this.__svgaConfig.isCacheFrames
    const runtime = isCacheFrames ? activeRuntime(this) : undefined
    const cachedFrame = isCacheFrames && cache[frame]
    if (cachedFrame) {
      const order = (runtime as PlayerRuntime).__svgaOrder
      order.delete(frame)
      order.set(frame, true)
      context.drawImage(cachedFrame, 0, 0)
      return
    }

    const videoEntity = this.videoEntity as Video
    const ofsCanvas = this.__svgaCanvas

    if (ofsCanvas.width !== container.width) ofsCanvas.width = container.width
    if (ofsCanvas.height !== container.height) ofsCanvas.height = container.height
    const ofsContext = ofsCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (ofsContext) ofsContext.clearRect(0, 0, ofsCanvas.width, ofsCanvas.height)

    render(
      ofsCanvas,
      this.__svgaImages,
      videoEntity.dynamicElements,
      videoEntity.replaceElements,
      videoEntity,
      frame
    )

    context.drawImage(ofsCanvas, 0, 0)

    if (isCacheFrames) {
      const active = runtime as PlayerRuntime
      const pending = active.__svgaPending

      if ('transferToImageBitmap' in ofsCanvas) {
        try {
          storeFrameCache(active, cache, frame, ofsCanvas.transferToImageBitmap())
        } catch {
          // Caching is optional and must never interrupt playback.
        }
      } else if (typeof createImageBitmap === 'function' && !pending.has(frame)) {
        pending.add(frame)
        void createImageBitmap(ofsCanvas).then(bitmap => {
          try {
            if (active.__svgaPending !== pending) {
              closeBitmap(bitmap)
            } else storeFrameCache(active, cache, frame, bitmap)
          } finally {
            pending.delete(frame)
          }
        }, () => { pending.delete(frame) })
      }
    }
  }
}
