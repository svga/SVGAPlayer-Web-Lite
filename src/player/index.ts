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

type EventCallback = undefined | (() => void)

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
  private readonly cacheFrames: { [key: string]: HTMLImageElement | ImageBitmap} = {}

  constructor (options: HTMLCanvasElement | PlayerConfigOptions) {
    this.animator = new Animator()
    this.animator.onEnd = () => {
      if (this.onEnd !== undefined) this.onEnd()
    }
    let container: HTMLCanvasElement | undefined
    if (options instanceof HTMLCanvasElement) {
      container = options
    } else if (options.container !== undefined) {
      container = options.container
      this.setConfig(options)
    }
    this.config.container = container ?? this.config.container
    this.ofsCanvas = window.OffscreenCanvas !== undefined ? new window.OffscreenCanvas(this.config.container.width, this.config.container.height) : document.createElement('canvas')
  }

  /**
   * 设置配置项
   * @param options 可配置项
   */
  public setConfig (options: PlayerConfigOptions): void {
    if (options.startFrame !== undefined && options.endFrame !== undefined) {
      if (options.startFrame > options.endFrame) {
        throw new Error('StartFrame should > EndFrame')
      }
    }
    this.config.container = options.container ?? this.config.container
    this.config.loop = options.loop ?? 0
    this.config.fillMode = options.fillMode ?? PLAYER_FILL_MODE.FORWARDS
    this.config.playMode = options.playMode ?? PLAYER_PLAY_MODE.FORWARDS
    this.config.startFrame = options.startFrame ?? 0
    this.config.endFrame = options.endFrame ?? 0
    this.config.loopStartFrame = options.loopStartFrame ?? 0
    this.config.isCacheFrames = options.isCacheFrames ?? false
    this.config.isUseIntersectionObserver = options.isUseIntersectionObserver ?? false
    this.config.isOpenNoExecutionDelay = options.isOpenNoExecutionDelay ?? false
    this.animator.isOpenNoExecutionDelay = options.isOpenNoExecutionDelay ?? false
    // 监听容器是否处于浏览器视窗内
    this.setIntersectionObserver()
  }

  private setIntersectionObserver (): void {
    if (hasIntersectionObserver && this.config.isUseIntersectionObserver) {
      this.intersectionObserver = new IntersectionObserver(entries => {
        this.isBeIntersection = !(entries[0].intersectionRatio <= 0)
      }, {
        rootMargin: '0px',
        threshold: [0, 0.5, 1]
      })
      this.intersectionObserver.observe(this.config.container)
    } else {
      if (this.intersectionObserver !== null) this.intersectionObserver.disconnect()
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
    return await new Promise((resolve, reject) => {
      this.currentFrame = 0
      this.totalFrames = videoEntity.frames - 1
      this.videoEntity = videoEntity
      this.clearContainer()
      this.setSize()
      // base64 -> imageelement
      this.bitmapsCache = {}
      if (this.videoEntity === undefined) {
        resolve()
        return
      }
      if (Object.keys(this.videoEntity.images).length === 0) {
        resolve()
        return
      }
      let totalCount = 0
      let loadedCount = 0
      for (const key in this.videoEntity.images) {
        const image = this.videoEntity.images[key]
        if (typeof image === 'string') {
          totalCount++
          const img = document.createElement('img')
          img.src = 'data:image/png;base64,' + image
          this.bitmapsCache[key] = img
          img.onload = () => {
            loadedCount++
            loadedCount === totalCount && resolve()
          }
        } else {
          this.bitmapsCache[key] = image
          totalCount++
          loadedCount++
          loadedCount === totalCount && resolve()
        }
      }
    })
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

  private clearContainer (): void {
    const width = this.config.container.width
    this.config.container.width = width
  }

  /**
   * 开始播放
   */
  public start (): void {
    if (this.videoEntity === undefined) throw new Error('videoEntity undefined')
    this.clearContainer()
    this.startAnimation()
    if (this.onStart !== undefined) this.onStart()
  }

  /**
   * 重新播放
   */
  public resume (): void {
    this.startAnimation()
    if (this.onResume !== undefined) this.onResume()
  }

  /**
   * 暂停播放
   */
  public pause (): void {
    this.animator.stop()
    if (this.onPause !== undefined) this.onPause()
  }

  /**
   * 停止播放
   */
  public stop (): void {
    this.animator.stop()
    this.currentFrame = 0
    this.clearContainer()
    if (this.onStop !== undefined) this.onStop()
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
    ;(this.animator as any) = null
    ;(this.videoEntity as any) = null
  }

  private startAnimation (): void {
    if (this.videoEntity === undefined) throw new Error('videoEntity undefined')

    const { config, totalFrames, videoEntity } = this
    const { playMode, startFrame, endFrame, loopStartFrame, fillMode, loop } = config

    // 如果开始动画的当前帧是最后一帧，重置为第 0 帧
    if (this.currentFrame === totalFrames) {
      this.currentFrame = startFrame > 0 ? startFrame : 0
    }

    if (playMode === PLAYER_PLAY_MODE.FORWARDS) {
      this.animator.startValue = startFrame > 0 ? startFrame : 0
      this.animator.endValue = endFrame > 0 ? endFrame : totalFrames
    } else {
      // 倒播
      this.animator.startValue = endFrame > 0 ? endFrame : totalFrames
      this.animator.endValue = startFrame > 0 ? startFrame : 0
    }

    let frames = videoEntity.frames

    if (endFrame > 0 && endFrame > startFrame) {
      frames = endFrame - startFrame
    } else if (endFrame <= 0 && startFrame > 0) {
      frames = videoEntity.frames - startFrame
    }

    this.animator.duration = frames * (1.0 / videoEntity.fps) * 1000
    this.animator.loopStart = loopStartFrame > startFrame ? (loopStartFrame - startFrame) * (1.0 / videoEntity.fps) * 1000 : 0
    this.animator.loop = loop === true || loop <= 0 ? Infinity : (loop === false ? 1 : loop)
    this.animator.fillRule = fillMode === 'backwards' ? 1 : 0

    this.animator.onUpdate = (value: number) => {
      if (this.currentFrame === value) return
      this.currentFrame = value
      this.drawFrame(this.currentFrame)
      if (this.onProcess !== undefined) this.onProcess()
    }

    this.animator.start()
  }

  private setSize (): void {
    if (this.videoEntity === undefined) throw new Error('videoEntity undefined')
    const size = this.videoEntity.size
    this.config.container.width = size.width
    this.config.container.height = size.height
  }

  /// ----------- 描绘一帧 -----------
  private drawFrame (frame: number): void {
    if (this.videoEntity === undefined) throw new Error('Player VideoEntity undefined')
    if (this.config.isUseIntersectionObserver && !this.isBeIntersection) return

    this.clearContainer()

    const context = this.config.container.getContext('2d')
    if (context === null) throw new Error('Canvas Context cannot be null')

    if (this.config.isCacheFrames && this.cacheFrames[frame] !== undefined) {
      const ofsFrame = this.cacheFrames[frame]
      // ImageData
      // context.putImageData(ofsFrame, 0, 0)
      context.drawImage(ofsFrame, 0, 0, ofsFrame.width, ofsFrame.height, 0, 0, ofsFrame.width, ofsFrame.height)
      return
    }

    let ofsCanvas = this.ofsCanvas

    // OffscreenCanvas 在 Firefox 浏览器无法被清理历史内容
    if (window.OffscreenCanvas !== undefined && window.navigator.userAgent.includes('Firefox')) {
      ofsCanvas = new window.OffscreenCanvas(this.config.container.width, this.config.container.height)
    }

    ofsCanvas.width = this.config.container.width
    ofsCanvas.height = this.config.container.height

    render(
      ofsCanvas,
      this.bitmapsCache,
      this.videoEntity.dynamicElements,
      this.videoEntity.replaceElements,
      this.videoEntity,
      this.currentFrame
    )

    context.drawImage(
      ofsCanvas,
      0, 0, ofsCanvas.width, ofsCanvas.height,
      0, 0, ofsCanvas.width, ofsCanvas.height
    )

    if (this.config.isCacheFrames) {
      // ImageData
      // const imageData = (ofsCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D).getImageData(0, 0, ofsCanvas.width, ofsCanvas.height)
      // this.frames[frame] = imageData
      if ('toDataURL' in ofsCanvas) {
        const ofsImageBase64 = ofsCanvas.toDataURL()
        const ofsImage = new Image()
        ofsImage.src = ofsImageBase64
        this.cacheFrames[frame] = ofsImage
      } else {
        this.cacheFrames[frame] = ofsCanvas.transferToImageBitmap()
      }
    }
  }
}
