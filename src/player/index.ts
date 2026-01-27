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

const inBrowser = typeof window !== 'undefined'
const hasIntersectionObserver = inBrowser && 'IntersectionObserver' in window

const MAX_CACHE_FRAMES = 100

type EventCallback = (() => void) | undefined

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
  private bitmapsCache: BitmapsCache = {}
  private cacheFrames: { [key: string]: HTMLImageElement | ImageBitmap} = {}

  constructor (options: HTMLCanvasElement | PlayerConfigOptions) {
    this.animator = new Animator()
    this.animator.onEnd = () => this.onEnd?.()

    const isCanvasElement = options instanceof HTMLCanvasElement
    const container = isCanvasElement ? options : options.container

    if (!isCanvasElement && options.container !== undefined) {
      this.setConfig(options)
    }

    this.config.container = container ?? this.config.container
    const supportsOffscreenCanvas = window.OffscreenCanvas !== undefined
    this.ofsCanvas = supportsOffscreenCanvas
      ? new window.OffscreenCanvas(this.config.container.width, this.config.container.height)
      : document.createElement('canvas')
  }

  /**
   * 设置配置项
   * @param options 可配置项
  */
  public setConfig (options: PlayerConfigOptions): void {
    if (options.startFrame !== undefined && options.endFrame !== undefined && options.startFrame > options.endFrame) {
      throw new Error('startFrame must be less than or equal to endFrame')
    }

    const {
      loop = 0,
      fillMode = PLAYER_FILL_MODE.FORWARDS,
      playMode = PLAYER_PLAY_MODE.FORWARDS,
      startFrame = 0,
      endFrame = 0,
      loopStartFrame = 0,
      isCacheFrames = false,
      isUseIntersectionObserver = false,
      isOpenNoExecutionDelay = false
    } = options

    Object.assign(this.config, {
      loop,
      fillMode,
      playMode,
      startFrame,
      endFrame,
      loopStartFrame,
      isCacheFrames,
      isUseIntersectionObserver,
      isOpenNoExecutionDelay
    })

    this.animator.isOpenNoExecutionDelay = isOpenNoExecutionDelay

    // 监听容器是否处于浏览器视窗内
    this.setIntersectionObserver()
  }

  private setIntersectionObserver (): void {
    if (this.intersectionObserver !== null) {
      this.intersectionObserver.disconnect()
    }

    if (hasIntersectionObserver && this.config.isUseIntersectionObserver) {
      this.intersectionObserver = new IntersectionObserver(entries => {
        this.isBeIntersection = entries[0].intersectionRatio > 0
      }, {
        rootMargin: '0px',
        threshold: [0, 0.5, 1]
      })
      this.intersectionObserver.observe(this.config.container)
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
    this.currentFrame = 0
    this.totalFrames = videoEntity.frames - 1
    this.videoEntity = videoEntity
    this.clearContainer()
    this.setSize()
    this.clearCache()

    const imageKeys = Object.keys(videoEntity.images)
    if (imageKeys.length === 0) {
      return
    }

    const loadPromises = imageKeys.map(key => this.loadImage(key, videoEntity.images[key]))
    await Promise.all(loadPromises)
  }

  private loadImage (key: string, image: string | HTMLImageElement | ImageBitmap): Promise<void> {
    return new Promise<void>(resolve => {
      if (typeof image === 'string') {
        // Validate base64 format
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(image)) {
          resolve()
          return
        }

        const img = document.createElement('img')
        img.src = `data:image/png;base64,${image}`
        this.bitmapsCache[key] = img
        img.onload = () => resolve()
        img.onerror = () => resolve()
      } else {
        this.bitmapsCache[key] = image
        resolve()
      }
    })
  }

  public onStart: EventCallback = undefined
  public onResume: EventCallback = undefined
  public onPause: EventCallback = undefined
  public onStop: EventCallback = undefined
  public onProcess: EventCallback = undefined
  public onEnd: EventCallback = undefined

  private clearContainer (): void {
    const context = this.config.container.getContext('2d')
    if (context !== null) {
      context.clearRect(0, 0, this.config.container.width, this.config.container.height)
    }
  }

  /**
   * 开始播放
   */
  public start (): void {
    this.requireVideoEntity()
    this.clearContainer()
    this.startAnimation()
    this.onStart?.()
  }

  /**
   * 重新播放
   */
  public resume (): void {
    this.startAnimation()
    this.onResume?.()
  }

  /**
   * 暂停播放
   */
  public pause (): void {
    this.animator.stop()
    this.onPause?.()
  }

  /**
   * 停止播放
   */
  public stop (): void {
    this.animator.stop()
    this.currentFrame = 0
    this.clearContainer()
    this.onStop?.()
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
    this.animator.stop()
    this.clearContainer()
    this.clearCache()
    this.videoEntity = undefined
  }

  /**
   * 清理缓存资源，释放 ImageBitmap 显存
   */
  private clearCache (): void {
    // 清理帧缓存中的资源
    Object.values(this.cacheFrames).forEach(frame => {
      if (frame instanceof ImageBitmap) {
        frame.close()
      } else if (frame instanceof HTMLImageElement) {
        frame.src = ''
      }
    })
    this.cacheFrames = {}

    // 清理 bitmapsCache 中的资源
    Object.values(this.bitmapsCache).forEach(bitmap => {
      if (bitmap instanceof ImageBitmap) {
        bitmap.close()
      } else if (bitmap instanceof HTMLImageElement) {
        bitmap.src = ''
      }
    })
    this.bitmapsCache = {}
  }

  private startAnimation (): void {
    this.requireVideoEntity()

    const { config, totalFrames } = this
    const { playMode, startFrame, endFrame, loopStartFrame, fillMode, loop } = config
    const videoEntity = this.videoEntity!

    // 如果开始动画的当前帧是最后一帧，重置为第 0 帧
    if (this.currentFrame === totalFrames) {
      this.currentFrame = startFrame > 0 ? startFrame : 0
    }

    this.configureAnimator(playMode, startFrame, endFrame, totalFrames, videoEntity, loopStartFrame, fillMode, loop)
    this.configureOnUpdateCallback()
    this.animator.start()
  }

  private configureAnimator (
    playMode: string,
    startFrame: number,
    endFrame: number,
    totalFrames: number,
    videoEntity: Video,
    loopStartFrame: number,
    fillMode: string,
    loop: number | boolean
  ): void {
    const { fps, frames } = videoEntity
    const actualStartFrame = startFrame > 0 ? startFrame : 0
    const actualEndFrame = endFrame > 0 ? endFrame : totalFrames

    if (playMode === PLAYER_PLAY_MODE.FORWARDS) {
      this.animator.startValue = actualStartFrame
      this.animator.endValue = actualEndFrame
    } else {
      this.animator.startValue = actualEndFrame
      this.animator.endValue = actualStartFrame
    }

    const frameDuration = 1000 / fps
    const animationFrames = this.calculateAnimationFrames(endFrame, startFrame, frames)

    this.animator.duration = animationFrames * frameDuration
    this.animator.loopStart = this.calculateLoopStart(loopStartFrame, startFrame, frameDuration)
    this.animator.loop = this.calculateLoopCount(loop)
    this.animator.fillRule = fillMode === 'backwards' ? 1 : 0
  }

  private configureOnUpdateCallback (): void {
    this.animator.onUpdate = (value: number) => {
      if (this.currentFrame === value) return
      this.currentFrame = value
      this.drawFrame(this.currentFrame)
      this.onProcess?.()
    }
  }

  private calculateAnimationFrames (endFrame: number, startFrame: number, totalFrames: number): number {
    if (endFrame > 0 && endFrame > startFrame) {
      return endFrame - startFrame
    }
    if (startFrame > 0) {
      return totalFrames - startFrame
    }
    return totalFrames
  }

  private calculateLoopStart (loopStartFrame: number, startFrame: number, frameDuration: number): number {
    if (loopStartFrame > startFrame) {
      return (loopStartFrame - startFrame) * frameDuration
    }
    return 0
  }

  private calculateLoopCount (loop: number | boolean): number {
    if (loop === true || loop === 0) {
      return Infinity
    }
    if (loop === false) {
      return 1
    }
    return loop
  }

  private setSize (): void {
    this.requireVideoEntity()
    const size = this.videoEntity!.size
    this.config.container.width = size.width
    this.config.container.height = size.height
  }

  private requireVideoEntity (errorMessage: string = 'videoEntity undefined'): void {
    if (this.videoEntity === undefined) {
      throw new Error(errorMessage)
    }
  }

  /// ----------- 描绘一帧 -----------
  private drawFrame (frame: number): void {
    this.requireVideoEntity('Player VideoEntity undefined')
    if (this.config.isUseIntersectionObserver && !this.isBeIntersection) return

    this.clearContainer()

    const context = this.getCanvasContext()
    if (this.shouldUseCachedFrame(frame)) {
      this.drawCachedFrame(context, frame)
      return
    }

    this.renderFrame(context)
  }

  private getCanvasContext (): CanvasRenderingContext2D {
    const context = this.config.container.getContext('2d')
    if (context === null) {
      throw new Error('Canvas Context cannot be null')
    }
    return context
  }

  private shouldUseCachedFrame (frame: number): boolean {
    return this.config.isCacheFrames && this.cacheFrames[frame] !== undefined
  }

  private drawCachedFrame (context: CanvasRenderingContext2D, frame: number): void {
    const cachedFrame = this.cacheFrames[frame]
    if (cachedFrame !== undefined) {
      context.drawImage(cachedFrame, 0, 0)
    }
  }

  private renderFrame (context: CanvasRenderingContext2D): void {
    const canvas = this.getRenderCanvas()
    const { width, height } = this.config.container

    canvas.width = width
    canvas.height = height

    const videoEntity = this.videoEntity!
    render(
      canvas,
      this.bitmapsCache,
      videoEntity.dynamicElements,
      videoEntity.replaceElements,
      videoEntity,
      this.currentFrame
    )

    context.drawImage(canvas, 0, 0)

    if (this.config.isCacheFrames) {
      this.addToCache(this.currentFrame, canvas)
    }
  }

  private addToCache (frame: number, canvas: HTMLCanvasElement | OffscreenCanvas): void {
    const keys = Object.keys(this.cacheFrames)
    if (keys.length >= MAX_CACHE_FRAMES) {
      const oldestKey = keys[0]
      const oldestFrame = this.cacheFrames[oldestKey]
      // 释放资源（ImageBitmap 显存或 HTMLImageElement 内存）
      if (oldestFrame instanceof ImageBitmap) {
        oldestFrame.close()
      } else if (oldestFrame instanceof HTMLImageElement) {
        oldestFrame.src = ''
      }
      delete this.cacheFrames[oldestKey]
    }
    this.cacheFrames[frame] = this.cacheCanvas(canvas)
  }

  private getRenderCanvas (): HTMLCanvasElement | OffscreenCanvas {
    const needsNewCanvas = this.shouldRecreateOffscreenCanvas()
    return needsNewCanvas
      ? new OffscreenCanvas(this.config.container.width, this.config.container.height)
      : this.ofsCanvas
  }

  private shouldRecreateOffscreenCanvas (): boolean {
    return OffscreenCanvas !== undefined && navigator.userAgent.includes('Firefox')
  }

  private cacheCanvas (canvas: HTMLCanvasElement | OffscreenCanvas): ImageBitmap | HTMLImageElement {
    if ('toDataURL' in canvas) {
      const image = new Image()
      image.src = canvas.toDataURL()
      return image
    }
    return canvas.transferToImageBitmap()
  }
}
