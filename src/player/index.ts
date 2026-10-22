import { PlayerError } from '../internal/errors'
import {
  MAX_DECODED_IMAGE_PIXELS,
  MAX_FRAME_CACHE_BYTES,
  MAX_TOTAL_DECODED_PIXELS,
} from '../internal/limits'
import { createNullMap } from '../internal/maps'
import type { Drawable, PlayerConfig, PlayerConfigOptions, PlayerState, Video } from '../types'
import { validateVideo } from '../validate-video'
import {
  createPlayerContext,
  getPlayerContext,
  setPlayerContext,
  type FrameCache,
  type ImageRelease,
  type PlayerContext,
  type PlayerRuntime,
} from './context'
import render from './render'

type EventCallback = undefined | (() => void)
type ProcessCallback = undefined | ((progress: number) => void)

function activeContext(player: Player): PlayerContext {
  const context = getPlayerContext(player)
  if (!context || context.__svgaState === 'destroyed')
    throw new PlayerError('player/destroyed', 'destroyed')
  return context
}

function playerAlive(player: Player): boolean {
  const context = getPlayerContext(player)
  return context !== undefined && context.__svgaState !== 'destroyed'
}

function closeBitmap(bitmap: ImageBitmap): void {
  try {
    bitmap.close()
  } catch {}
}

function clearFrameCache(runtime: PlayerRuntime, cache: FrameCache): void {
  for (const key in cache) {
    closeBitmap(cache[key] as ImageBitmap)
    delete cache[key]
  }
  runtime.__svgaPending = new Set()
  runtime.__svgaOrder.clear()
  runtime.__svgaBytes = 0
}

function storeFrameCache(
  runtime: PlayerRuntime,
  cache: FrameCache,
  key: number,
  bitmap: ImageBitmap,
): void {
  const bytes = bitmap.width * bitmap.height * 4
  if (bytes > MAX_FRAME_CACHE_BYTES) {
    closeBitmap(bitmap)
    return
  }
  while (runtime.__svgaBytes + bytes > MAX_FRAME_CACHE_BYTES) {
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

function releaseImages(images: ImageRelease[]): void {
  for (const image of images.splice(0)) {
    try {
      if (typeof image === 'function') image()
      else closeBitmap(image)
    } catch {}
  }
}

function validateBitmap(bitmap: { width: number; height: number }, key: string): void {
  if (
    !Number.isFinite(bitmap.width) ||
    !Number.isFinite(bitmap.height) ||
    bitmap.width <= 0 ||
    bitmap.height <= 0 ||
    bitmap.width * bitmap.height > MAX_DECODED_IMAGE_PIXELS
  )
    throw new PlayerError('player/image', 'image:' + key)
}

async function decodeBitmap(
  bytes: Uint8Array,
  key: string,
  releases: ImageRelease[],
  isActive: () => boolean,
): Promise<Drawable | undefined> {
  const blob = new Blob([new Uint8Array(bytes)])
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    if (!isActive()) {
      closeBitmap(bitmap)
      return
    }
    try {
      validateBitmap(bitmap, key)
    } catch (error) {
      closeBitmap(bitmap)
      throw error
    }
    releases.push(bitmap)
    return bitmap
  }
  return await new Promise<Drawable | undefined>((resolve, reject) => {
    const image = document.createElement('img')
    let owned = true
    let settle = () => {
      resolve(undefined)
    }
    let url: string
    const cleanup = () => {
      if (!owned) return
      owned = false
      image.onload = image.onerror = null
      image.removeAttribute('src')
      try {
        window.URL.revokeObjectURL(url)
      } catch {}
      settle()
    }
    url = window.URL.createObjectURL(blob)
    releases.push(cleanup)
    image.onload = () => {
      if (!isActive()) return cleanup()
      try {
        validateBitmap(image, key)
      } catch (error) {
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
      reject(new PlayerError('player/image', 'image:' + key))
    }
    image.src = url
  })
}

function validateConfig(config: PlayerConfig, totalFrames?: number): void {
  const { startFrame, endFrame, loopStartFrame } = config
  if (!(config.container instanceof HTMLCanvasElement))
    throw new PlayerError('player/config', 'container')
  if (!(typeof config.loop === 'boolean' || (Number.isInteger(config.loop) && config.loop >= 0)))
    throw new PlayerError('player/config', 'loop')
  if (config.fillMode !== 'forwards' && config.fillMode !== 'backwards')
    throw new PlayerError('player/config', 'fillMode')
  if (config.playMode !== 'forwards' && config.playMode !== 'fallbacks')
    throw new PlayerError('player/config', 'playMode')
  if (
    ![
      config.isCacheFrames,
      config.isUseIntersectionObserver,
      config.isOpenNoExecutionDelay,
      config.isDisableOffscreenCanvas,
    ].every((value) => typeof value === 'boolean')
  )
    throw new PlayerError('player/config', 'flag')
  if (
    ![startFrame, endFrame, loopStartFrame].every(Number.isInteger) ||
    Math.min(startFrame, endFrame, loopStartFrame) < 0
  )
    throw new PlayerError('player/config', 'frame')

  if (endFrame && startFrame > endFrame) throw new PlayerError('player/config', 'start>end')

  if (
    (loopStartFrame && (loopStartFrame < startFrame || (endFrame && loopStartFrame > endFrame))) ||
    (totalFrames !== undefined &&
      (startFrame > totalFrames ||
        endFrame > totalFrames ||
        loopStartFrame > (endFrame || totalFrames)))
  )
    throw new PlayerError('player/config', 'frame')
  const effectiveEnd = endFrame || totalFrames
  const looping =
    config.loop === true ||
    config.loop === 0 ||
    (typeof config.loop === 'number' && config.loop > 1)
  if (looping && effectiveEnd !== 0 && loopStartFrame === effectiveEnd)
    throw new PlayerError('player/config', 'loop segment')
}

function createOffscreen(
  width: number,
  height: number,
  isDisabled: boolean,
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

function disconnectObserver(context: PlayerContext): void {
  const observer = context.__svgaObserver
  if (observer) observer.disconnect()
  context.__svgaObserver = null
}

function clearCanvas(container: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = container.getContext('2d')
  if (context) context.clearRect(0, 0, container.width, container.height)
  return context
}

function releasePlayer(player: Player): void {
  const context = getPlayerContext(player)
  if (!context || context.__svgaState === 'destroyed') return
  ++context.__svgaMountToken
  context.__svgaState = 'destroyed'
  context.__svgaAnimator.__svgaStop()
  context.__svgaConfig.isUseIntersectionObserver = false
  disconnectObserver(context)
  context.__svgaVisible = true
  clearFrameCache(context.__svgaRuntime, context.__svgaFrames)
  releaseImages(context.__svgaOwned)
  context.__svgaImages = createNullMap<Drawable>()
  player.videoEntity = undefined
  player.currentFrame = 0
  player.totalFrames = 0
  clearCanvas(context.__svgaConfig.container)
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

  public get config(): Readonly<PlayerConfig> {
    const context = getPlayerContext(this) as PlayerContext
    return Object.freeze({ ...context.__svgaConfig })
  }

  /**
   * 当前生命周期状态
   */
  public get state(): PlayerState {
    return getPlayerContext(this)?.__svgaState ?? 'destroyed'
  }

  /**
   * 当前是否正在播放
   */
  public get isPlaying(): boolean {
    return getPlayerContext(this)?.__svgaAnimator.__svgaIsRunning ?? false
  }

  /**
   * 当前播放进度，取值范围 0 到 1
   */
  public get progress(): number {
    if (!this.videoEntity) return 0
    if (this.totalFrames === 0) return 1
    return Math.min(1, Math.max(0, (this.currentFrame + 1) / (this.totalFrames + 1)))
  }

  constructor(options: HTMLCanvasElement | PlayerConfigOptions) {
    const context = createPlayerContext()
    setPlayerContext(this, context)
    try {
      context.__svgaAnimator.__svgaOnEnd = () => {
        if (context.__svgaState !== 'destroyed') {
          context.__svgaRuntime.__svgaTimeline = 0
          context.__svgaState = 'ready'
        }
        if (this.onEnd) this.onEnd()
      }
      this.setConfig(options instanceof HTMLCanvasElement ? { container: options } : options)
      context.__svgaCanvas = createOffscreen(
        context.__svgaConfig.container.width,
        context.__svgaConfig.container.height,
        context.__svgaConfig.isDisableOffscreenCanvas,
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
  public setConfig(options: PlayerConfigOptions): void {
    const context = activeContext(this)
    const config = context.__svgaConfig
    const mergedConfig = { ...config } as PlayerConfig & Record<string, unknown>
    const target = config as unknown as Record<string, unknown>
    Object.keys(options).forEach((key) => {
      const value = (options as Record<string, unknown>)[key]
      if (value !== undefined && {}.hasOwnProperty.call(target, key)) {
        mergedConfig[key] = value
      }
    })
    validateConfig(mergedConfig, this.videoEntity ? this.totalFrames : undefined)
    const containerChanged = mergedConfig.container !== config.container
    const observerChanged =
      containerChanged ||
      mergedConfig.isUseIntersectionObserver !== config.isUseIntersectionObserver
    const offscreenChanged =
      mergedConfig.isDisableOffscreenCanvas !== config.isDisableOffscreenCanvas
    if (
      containerChanged ||
      offscreenChanged ||
      (config.isCacheFrames && !mergedConfig.isCacheFrames)
    ) {
      clearFrameCache(context.__svgaRuntime, context.__svgaFrames)
    }
    Object.keys(config).forEach((key) => {
      target[key] = mergedConfig[key]
    })
    if (offscreenChanged && context.__svgaCanvas) {
      context.__svgaCanvas = createOffscreen(
        config.container.width,
        config.container.height,
        config.isDisableOffscreenCanvas,
      )
    }
    if (containerChanged && this.videoEntity) this.__svgaSize()
    context.__svgaAnimator.__svgaNoDelay = config.isOpenNoExecutionDelay
    if (observerChanged) this.__svgaObserve()
  }

  private __svgaObserve(): void {
    const context = activeContext(this)
    disconnectObserver(context)

    const wasVisible = context.__svgaVisible
    if (context.__svgaConfig.isUseIntersectionObserver) {
      const observer = new IntersectionObserver((entries) => {
        if (context.__svgaObserver !== observer || !entries.length) return
        const wasVisible = context.__svgaVisible
        context.__svgaVisible = entries[0].intersectionRatio > 0
        if (!wasVisible && context.__svgaVisible && this.videoEntity)
          this.__svgaDraw(this.currentFrame)
      })
      context.__svgaObserver = observer
      observer.observe(context.__svgaConfig.container)
    } else {
      context.__svgaVisible = true
      if (!wasVisible && this.videoEntity) this.__svgaDraw(this.currentFrame)
    }
  }

  /**
   * 装载 SVGA 数据元
   * @param videoEntity SVGA 数据源
   * @returns Promise<void>
   */
  public async mount(videoEntity: Video): Promise<void> {
    const context = activeContext(this)
    const token = ++context.__svgaMountToken
    const isActive = (): boolean => context.__svgaMountToken === token
    context.__svgaAnimator.__svgaStop()
    context.__svgaRuntime.__svgaTimeline = 0
    clearFrameCache(context.__svgaRuntime, context.__svgaFrames)
    releaseImages(context.__svgaOwned)
    context.__svgaState = 'loading'
    const bitmapsCache = (context.__svgaImages = createNullMap<Drawable>())
    const imageReleases: ImageRelease[] = []
    context.__svgaOwned = imageReleases
    this.videoEntity = undefined
    this.currentFrame = 0
    this.totalFrames = 0
    this.__svgaClear()

    try {
      validateVideo(videoEntity)
      let totalFrames = videoEntity.frames - 1
      validateConfig(context.__svgaConfig, totalFrames)

      let pixels = 0
      const images = Object.entries(videoEntity.images)
      for (let index = 0; index < images.length; index++) {
        const [key, bytes] = images[index]
        const resource = await decodeBitmap(bytes, key, imageReleases, isActive)
        if (!resource || !isActive()) {
          releaseImages(imageReleases)
          return
        }
        bitmapsCache[key] = resource
        pixels += resource.width * resource.height
        if (
          pixels > MAX_TOTAL_DECODED_PIXELS ||
          (pixels === MAX_TOTAL_DECODED_PIXELS && index < images.length - 1)
        )
          throw new PlayerError('player/image', 'image pixels')
      }
      if (!isActive()) {
        releaseImages(imageReleases)
        return
      }

      validateVideo(videoEntity)
      totalFrames = videoEntity.frames - 1
      if (
        images.length !== Object.keys(videoEntity.images).length ||
        images.some(([key, bytes]) => videoEntity.images[key] !== bytes)
      )
        throw new PlayerError('player/video', 'video')
      validateConfig(context.__svgaConfig, totalFrames)

      this.videoEntity = videoEntity
      this.totalFrames = totalFrames
      this.__svgaSize()
      context.__svgaState = 'ready'
    } catch (error) {
      releaseImages(imageReleases)
      if (isActive()) {
        context.__svgaImages = createNullMap<Drawable>()
        context.__svgaState = 'idle'
      }
      throw error
    }
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

  private __svgaClear(): CanvasRenderingContext2D | null {
    const context = getPlayerContext(this)
    return context ? clearCanvas(context.__svgaConfig.container) : null
  }

  /**
   * 开始播放
   */
  public start(): void {
    const context = activeContext(this)
    if (!this.videoEntity) throw new PlayerError('player/video', 'video')
    context.__svgaRuntime.__svgaTimeline = -context.__svgaAnimator.__svgaClock() - 1
    const config = context.__svgaConfig
    const endFrame = config.endFrame || this.totalFrames
    this.currentFrame = config.playMode === 'forwards' ? config.startFrame : endFrame
    this.__svgaDraw(this.currentFrame)
    context.__svgaState = 'playing'
    context.__svgaAnimator.__svgaOnStart = () => {
      if (this.onStart) this.onStart()
    }
    this.__svgaAnimate(false)
  }

  /**
   * 重新播放
   */
  public resume(): void {
    const context = activeContext(this)
    if (!this.videoEntity) throw new PlayerError('player/video', 'video')
    const runtime = context.__svgaRuntime
    if (runtime.__svgaTimeline < 0) {
      if (this.onResume) this.onResume()
      return
    }
    const animator = context.__svgaAnimator
    const origin = animator.__svgaClock() - runtime.__svgaTimeline
    runtime.__svgaTimeline = -origin - 1
    animator.__svgaResumeAt(origin)
    animator.__svgaOnStart = () => {
      if (this.onResume) this.onResume()
    }
    context.__svgaState = 'playing'
    this.__svgaAnimate(true)
  }

  /**
   * 定位到指定帧
   * @param frame 目标帧
   * @param andPlay 定位后是否立即继续播放
   */
  public stepToFrame(frame: number, andPlay = false): void {
    const context = activeContext(this)
    const videoEntity = this.videoEntity
    if (!videoEntity) throw new PlayerError('player/video', 'video')
    if (typeof andPlay !== 'boolean') throw new PlayerError('player/config', 'andPlay')
    const config = context.__svgaConfig
    const effectiveEndFrame = config.endFrame || this.totalFrames
    if (!Number.isInteger(frame) || frame < config.startFrame || frame > effectiveEndFrame)
      throw new PlayerError('player/config', 'frame')

    context.__svgaAnimator.__svgaStop()
    const frameDuration = 1000 / videoEntity.fps
    context.__svgaRuntime.__svgaTimeline =
      config.playMode === 'forwards'
        ? (frame - config.startFrame) * frameDuration
        : (effectiveEndFrame - frame) * frameDuration
    this.currentFrame = frame
    this.__svgaDraw(frame)
    context.__svgaState = 'paused'
    if (this.onProcess) this.onProcess(this.progress)
    if (andPlay && playerAlive(this)) this.resume()
  }

  /**
   * 暂停播放
   */
  public pause(): void {
    const context = activeContext(this)
    if (context.__svgaRuntime.__svgaTimeline < 0)
      context.__svgaRuntime.__svgaTimeline += context.__svgaAnimator.__svgaClock() + 1
    context.__svgaAnimator.__svgaStop()
    context.__svgaState = 'paused'
    if (this.onPause) this.onPause()
  }

  /**
   * 停止播放
   */
  public stop(): void {
    const context = activeContext(this)
    context.__svgaRuntime.__svgaTimeline = 0
    context.__svgaAnimator.__svgaStop()
    this.currentFrame = context.__svgaConfig.startFrame
    this.__svgaClear()
    context.__svgaState = this.videoEntity ? 'ready' : 'idle'
    if (this.onStop) this.onStop()
  }

  /**
   * 清理容器画布
   */
  public clear(): void {
    this.__svgaClear()
  }

  /**
   * 销毁实例
   */
  public destroy(): void {
    releasePlayer(this)
  }

  private __svgaAnimate(isResume: boolean): void {
    const context = activeContext(this)
    const config = context.__svgaConfig
    const { totalFrames } = this
    const videoEntity = this.videoEntity as Video
    const animator = context.__svgaAnimator
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
    animator.__svgaLoopStart =
      loopStartFrame > startFrame
        ? (playMode === 'forwards'
            ? loopStartFrame - startFrame
            : effectiveEndFrame - loopStartFrame) * frameDuration
        : 0
    animator.__svgaLoop = loop === false ? 1 : loop === true || loop <= 0 ? Infinity : loop
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

  private __svgaSize(): void {
    const context = activeContext(this)
    const size = (this.videoEntity as Video).size
    const { container } = context.__svgaConfig
    if (container.width !== size.width) container.width = size.width
    if (container.height !== size.height) container.height = size.height
  }

  /// ----------- 描绘一帧 -----------
  private __svgaDraw(frame: number): void {
    const context = activeContext(this)
    const config = context.__svgaConfig
    if (config.isUseIntersectionObserver && !context.__svgaVisible) return

    const container = config.container
    const drawn = clearCanvas(container)
    if (!drawn) throw new PlayerError('player/render', '')

    const cache = context.__svgaFrames
    const isCacheFrames = config.isCacheFrames
    const runtime = isCacheFrames ? context.__svgaRuntime : undefined
    const cachedFrame = isCacheFrames && cache[frame]
    if (cachedFrame) {
      const order = (runtime as PlayerRuntime).__svgaOrder
      order.delete(frame)
      order.set(frame, true)
      drawn.drawImage(cachedFrame, 0, 0)
      return
    }

    const videoEntity = this.videoEntity as Video
    const ofsCanvas = context.__svgaCanvas as HTMLCanvasElement | OffscreenCanvas

    if (ofsCanvas.width !== container.width) ofsCanvas.width = container.width
    if (ofsCanvas.height !== container.height) ofsCanvas.height = container.height
    const ofsContext = ofsCanvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (ofsContext) ofsContext.clearRect(0, 0, ofsCanvas.width, ofsCanvas.height)

    render(
      ofsCanvas,
      context.__svgaImages,
      videoEntity.dynamicElements,
      videoEntity.replaceElements,
      videoEntity,
      frame,
    )

    drawn.drawImage(ofsCanvas, 0, 0)

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
        void createImageBitmap(ofsCanvas).then(
          (bitmap) => {
            try {
              if (active.__svgaPending !== pending) {
                closeBitmap(bitmap)
              } else storeFrameCache(active, cache, frame, bitmap)
            } finally {
              pending.delete(frame)
            }
          },
          () => {
            pending.delete(frame)
          },
        )
      }
    }
  }
}
