import { Parser } from './parser'
import {
  ParserConfigOptions,
  PlayerConfig,
  PlayerConfigOptions,
  PLAYER_FILL_MODE,
  PLAYER_PLAY_MODE,
  Video
} from './types'
import { RenderBackend } from './player/backend'
import {
  CompiledAnimation,
  RenderCompiler,
  RenderMode
} from './player/compiler'
import { Animator } from './player/animator'

const inBrowser = typeof window !== 'undefined'
const hasIntersectionObserver = inBrowser && 'IntersectionObserver' in window

export interface SVGAPlayerProcessPayload {
  currentFrame: number
  progress: number
}

export interface SVGAPlayerEventMap {
  start: undefined
  resume: undefined
  pause: undefined
  stop: undefined
  process: SVGAPlayerProcessPayload
  end: undefined
  error: Error
}

export type SVGAPlayerEventName = keyof SVGAPlayerEventMap

export type SVGAPlayerEventCallback<T extends SVGAPlayerEventName> =
  SVGAPlayerEventMap[T] extends undefined
    ? () => void
    : (payload: SVGAPlayerEventMap[T]) => void

export interface SVGAPlayerConfigOptions extends PlayerConfigOptions {
  renderMode?: RenderMode
  parserOptions?: ParserConfigOptions
}

function defaultCanvas (): HTMLCanvasElement {
  return document.createElement('canvas')
}

function parserOptionsFromConfig (options: SVGAPlayerConfigOptions): ParserConfigOptions {
  return options.parserOptions ?? {
    isDisableWebWorker: false,
    isDisableImageBitmapShim: false
  }
}

/**
 * Public SVGA facade: parse -> compile -> play.
 */
export class SVGAPlayer {
  public currentFrame: number = 0
  public totalFrames: number = 0
  public videoEntity: Video | undefined = undefined

  public readonly config: PlayerConfig = {
    container: defaultCanvas(),
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

  private listeners: {
    [key: string]: Array<(...args: any[]) => void> | undefined
  } = {}

  private readonly animator: Animator = new Animator()
  private parser: Parser | null = null
  private parserOptions: ParserConfigOptions
  private renderMode: RenderMode = 'auto'
  private compiledAnimation: CompiledAnimation | null = null
  private backend: RenderBackend | null = null
  private isBeIntersection = true
  private intersectionObserver: IntersectionObserver | null = null

  constructor (options: HTMLCanvasElement | SVGAPlayerConfigOptions) {
    if (options instanceof HTMLCanvasElement) {
      this.config.container = options
      this.parserOptions = parserOptionsFromConfig({})
    } else {
      this.parserOptions = parserOptionsFromConfig(options)
      this.renderMode = options.renderMode ?? 'auto'
      if (options.container !== undefined) this.config.container = options.container
      this.setConfig(options)
    }

    this.animator.onEnd = () => {
      this.emit('end', undefined)
    }
  }

  public setConfig (options: SVGAPlayerConfigOptions): void {
    if (options.startFrame !== undefined && options.endFrame !== undefined && options.startFrame > options.endFrame) {
      throw new Error('StartFrame should > EndFrame')
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
    this.renderMode = options.renderMode ?? this.renderMode
    this.parserOptions = options.parserOptions ?? this.parserOptions
    this.setIntersectionObserver()
  }

  public on<T extends SVGAPlayerEventName> (
    event: T,
    callback: SVGAPlayerEventCallback<T>
  ): () => void {
    const callbacks = this.listeners[event] ?? []
    callbacks.push(callback)
    this.listeners[event] = callbacks

    return () => {
      const currentCallbacks = this.listeners[event]
      if (currentCallbacks === undefined) return
      this.listeners[event] = currentCallbacks.filter(item => item !== callback)
    }
  }

  public async parse (source: string | Video): Promise<Video> {
    try {
      this.destroyCompiledState()

      if (typeof source !== 'string') {
        this.videoEntity = source
        return source
      }

      this.parser?.destroy()
      this.parser = new Parser(this.parserOptions)
      const video = await this.parser.load(source)
      this.videoEntity = video
      return video
    } catch (error) {
      this.emitError(error)
      throw error
    }
  }

  public async compile (options: Partial<SVGAPlayerConfigOptions> = {}): Promise<CompiledAnimation> {
    try {
      if (this.videoEntity === undefined) throw new Error('SVGAPlayer.parse() is required before compile()')

      if (options.container !== undefined || options.renderMode !== undefined) {
        this.setConfig(options)
      }

      this.destroyCompiledState()

      const compiler = new RenderCompiler()
      const result = await compiler.compile(this.videoEntity, this.config.container, {
        renderMode: options.renderMode ?? this.renderMode,
        isCacheFrames: this.config.isCacheFrames
      })

      this.compiledAnimation = result.animation
      this.backend = result.backend
      this.currentFrame = 0
      this.totalFrames = result.animation.totalFrames - 1

      return result.animation
    } catch (error) {
      this.emitError(error)
      throw error
    }
  }

  public play (): void {
    this.start()
  }

  public start (): void {
    this.assertCompiled()
    this.backend?.clear()
    this.startAnimation(false)
    this.emit('start', undefined)
  }

  public resume (): void {
    this.assertCompiled()
    this.startAnimation(true)
    this.emit('resume', undefined)
  }

  public pause (): void {
    this.animator.stop()
    this.emit('pause', undefined)
  }

  public stop (): void {
    this.animator.stop()
    this.currentFrame = 0
    this.backend?.clear()
    this.emit('stop', undefined)
  }

  public clear (): void {
    this.backend?.clear()
  }

  public destroy (): void {
    this.animator.stop()
    this.parser?.destroy()
    this.parser = null
    this.destroyCompiledState()
    this.videoEntity = undefined
    this.listeners = {}
    if (this.intersectionObserver !== null) {
      this.intersectionObserver.disconnect()
      this.intersectionObserver = null
    }
  }

  public get progress (): number {
    return this.totalFrames > 0 ? this.currentFrame / this.totalFrames : 0
  }

  private assertCompiled (): void {
    if (this.compiledAnimation === null || this.backend === null) {
      const error = new Error('SVGAPlayer.compile() is required before play()')
      this.emitError(error)
      throw error
    }
  }

  private startAnimation (resumeFromCurrentFrame: boolean): void {
    if (this.compiledAnimation === null || this.backend === null) {
      throw new Error('SVGAPlayer.compile() is required before play()')
    }

    const { config, totalFrames } = this
    const { playMode, startFrame, endFrame, loopStartFrame, fillMode, loop } = config
    const forwards = playMode === PLAYER_PLAY_MODE.FORWARDS
    const configuredStart = startFrame > 0 ? startFrame : 0
    const configuredEnd = endFrame > 0 ? endFrame : totalFrames
    const startValue = resumeFromCurrentFrame ? this.currentFrame : (forwards ? configuredStart : configuredEnd)
    const endValue = forwards ? configuredEnd : configuredStart
    const frameDistance = Math.max(Math.abs(endValue - startValue), 1)

    this.animator.startValue = startValue
    this.animator.endValue = endValue
    this.animator.duration = frameDistance * (1.0 / this.compiledAnimation.fps) * 1000
    this.animator.loopStart = loopStartFrame > startFrame ? (loopStartFrame - startFrame) * (1.0 / this.compiledAnimation.fps) * 1000 : 0
    this.animator.loop = loop === true || loop <= 0 ? Infinity : (loop === false ? 1 : loop)
    this.animator.fillRule = fillMode === 'backwards' ? 1 : 0

    this.animator.onUpdate = (value: number) => {
      if (this.currentFrame === value) return
      this.currentFrame = value
      this.drawFrame(value)
      this.emit('process', {
        currentFrame: this.currentFrame,
        progress: this.progress
      })
    }

    this.animator.start()
  }

  private drawFrame (frame: number): void {
    if (this.compiledAnimation === null || this.backend === null) return
    if (this.config.isUseIntersectionObserver && !this.isBeIntersection) return
    try {
      this.backend.renderFrame(this.compiledAnimation, frame)
    } catch (error) {
      this.animator.stop()
      this.emitError(error)
      throw error
    }
  }

  private destroyCompiledState (): void {
    this.animator.stop()
    this.backend?.destroy()
    this.backend = null
    this.compiledAnimation = null
  }

  private setIntersectionObserver (): void {
    if (hasIntersectionObserver && this.config.isUseIntersectionObserver) {
      if (this.intersectionObserver !== null) this.intersectionObserver.disconnect()
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

  private emitError (error: unknown): void {
    this.emit('error', error instanceof Error ? error : new Error(String(error)))
  }

  private emit<T extends SVGAPlayerEventName> (
    event: T,
    payload: SVGAPlayerEventMap[T]
  ): void {
    const callbacks = this.listeners[event]
    if (callbacks === undefined) return
    callbacks.forEach(callback => {
      ;(callback as any)(payload)
    })
  }
}
