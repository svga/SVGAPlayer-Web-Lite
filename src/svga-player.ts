import { DB } from './db'
import { Parser } from './parser'
import {
  DynamicElement,
  ParserConfigOptions,
  PlayerConfig,
  PLAYER_FILL_MODE,
  PLAYER_PLAY_MODE,
  ReplaceElement,
  Video
} from './types'
import { createBackend, RenderBackend } from './player/backend'
import {
  CompiledAnimation,
  diffRenderCapabilities,
  RenderBackendType,
  RenderCapabilities,
  RenderCapabilityPath,
  RenderCompiler,
  RenderMode
} from './player/compiler'
import { Animator } from './player/animator'

const inBrowser = typeof window !== 'undefined'
const hasIntersectionObserver = inBrowser && 'IntersectionObserver' in window
const DEFAULT_KEY = 'default'

export interface SVGAPlayerProcessPayload {
  currentFrame: number
  progress: number
}

interface SVGAPlayerUnsupportedCapabilitiesPayload {
  backendType: RenderBackendType
  unsupportedCapabilities: RenderCapabilityPath[]
  requiredCapabilities: RenderCapabilities
  backendCapabilities: RenderCapabilities
}

export enum SVGAPlayerErrorType {
  CONFIG = 'config',
  LOAD = 'load',
  PREPARE = 'prepare',
  PLAY = 'play',
  START = 'start',
  RESUME = 'resume',
  REPLACE = 'replace',
  REFRESH = 'refresh',
  CACHE = 'cache',
  RENDER = 'render',
  UNSUPPORTED_CAPABILITIES = 'unsupportedCapabilities'
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
  T extends 'error'
    ? (error: Error, errorType: SVGAPlayerErrorType, blocking: boolean) => void
    : SVGAPlayerEventMap[T] extends undefined
      ? () => void
      : (payload: SVGAPlayerEventMap[T]) => void

export interface SVGAPlayerPlaybackConfigOptions {
  loop?: PlayerConfig['loop']
  fillMode?: PlayerConfig['fillMode']
  playMode?: PlayerConfig['playMode']
  startFrame?: PlayerConfig['startFrame']
  endFrame?: PlayerConfig['endFrame']
  loopStartFrame?: PlayerConfig['loopStartFrame']
  isOpenNoExecutionDelay?: PlayerConfig['isOpenNoExecutionDelay']
}

export interface SVGAPlayerInitOptions extends SVGAPlayerPlaybackConfigOptions {
  container: HTMLCanvasElement
  renderMode?: RenderMode
  parserOptions?: ParserConfigOptions
  isCacheFrames?: PlayerConfig['isCacheFrames']
  isUseIntersectionObserver?: PlayerConfig['isUseIntersectionObserver']
}

export type SVGAPlayerConfigOptions = SVGAPlayerInitOptions

export interface SVGAPlayerReplaceOptions {
  key?: string
  mode?: 'replace' | 'dynamic'
}

export interface SVGAPlayerCacheOptions {
  key?: string
  id: IDBValidKey
}

interface SlotState {
  video: Video
  compiledAnimation: CompiledAnimation | null
  dirty: boolean
  version: number
  preparePromise: Promise<void> | null
}

function parserOptionsFromConfig (options: SVGAPlayerInitOptions): ParserConfigOptions {
  return options.parserOptions ?? {
    isDisableWebWorker: false,
    isDisableImageBitmapShim: false
  }
}

function normalizeKey (key?: string): string {
  return key ?? DEFAULT_KEY
}

/**
 * Public SVGA facade: load keyed animations, optionally prepare them, then play.
 */
export class SVGAPlayer {
  public currentFrame: number = 0
  public totalFrames: number = 0

  public readonly config: PlayerConfig

  private listeners: {
    [key: string]: Array<(...args: any[]) => void> | undefined
  } = {}

  private readonly animator: Animator = new Animator()
  private readonly parserOptions: ParserConfigOptions
  private readonly renderMode: RenderMode
  private readonly slots: Map<string, SlotState> = new Map()
  private readonly slotVersions: Map<string, number> = new Map()
  private parser: Parser | null = null
  private loadQueue: Promise<void> = Promise.resolve()
  private readonly backend: RenderBackend
  private activeKey: string | null = null
  private preparedKey: string | null = null
  private isBeIntersection = true
  private intersectionObserver: IntersectionObserver | null = null
  private destroyed = false

  constructor (options: SVGAPlayerInitOptions) {
    this.config = {
      container: options.container,
      loop: 0,
      fillMode: PLAYER_FILL_MODE.FORWARDS,
      playMode: PLAYER_PLAY_MODE.FORWARDS,
      startFrame: 0,
      endFrame: 0,
      loopStartFrame: 0,
      isCacheFrames: options.isCacheFrames ?? false,
      isUseIntersectionObserver: options.isUseIntersectionObserver ?? false,
      isOpenNoExecutionDelay: false
    }
    this.parserOptions = parserOptionsFromConfig(options)
    this.renderMode = options.renderMode ?? 'auto'
    this.backend = createBackend(
      this.config.container,
      this.renderMode,
      this.config.isCacheFrames
    )
    this.setConfig(options)

    this.animator.onEnd = () => {
      this.emit('end', undefined)
    }
  }

  public setConfig (options: SVGAPlayerPlaybackConfigOptions): void {
    if (options.startFrame !== undefined && options.endFrame !== undefined && options.startFrame > options.endFrame) {
      const error = new Error('StartFrame should > EndFrame')
      this.emitError(error, SVGAPlayerErrorType.CONFIG)
      throw error
    }

    this.config.loop = options.loop ?? 0
    this.config.fillMode = options.fillMode ?? PLAYER_FILL_MODE.FORWARDS
    this.config.playMode = options.playMode ?? PLAYER_PLAY_MODE.FORWARDS
    this.config.startFrame = options.startFrame ?? 0
    this.config.endFrame = options.endFrame ?? 0
    this.config.loopStartFrame = options.loopStartFrame ?? 0
    this.config.isOpenNoExecutionDelay = options.isOpenNoExecutionDelay ?? false
    this.animator.isOpenNoExecutionDelay = options.isOpenNoExecutionDelay ?? false
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

  public async load (source: string | Video, key?: string): Promise<void> {
    const slotKey = normalizeKey(key)
    const version = this.nextSlotVersion(slotKey)

    try {
      if (typeof source !== 'string') {
        this.storeLoadedSlot(slotKey, source, version)
        return
      }

      await this.enqueueUrlLoad(async () => {
        const video = await this.getParser().load(source)
        this.storeLoadedSlot(slotKey, video, version)
      })
    } catch (error) {
      this.emitError(error, SVGAPlayerErrorType.LOAD)
      throw error
    }
  }

  public async prepare (key?: string): Promise<void> {
    const slotKey = normalizeKey(key)
    try {
      await this.prepareSlot(slotKey)
    } catch (error) {
      this.emitError(error, SVGAPlayerErrorType.PREPARE)
      throw error
    }
  }

  public async play (key?: string): Promise<void> {
    const slotKey = normalizeKey(key)
    try {
      await this.prepareSlot(slotKey)
      this.startPreparedSlot(slotKey)
    } catch (error) {
      this.emitError(error, SVGAPlayerErrorType.PLAY)
      throw error
    }
  }

  public start (key?: string): void {
    const slotKey = normalizeKey(key)
    try {
      this.startPreparedSlot(slotKey)
    } catch (error) {
      this.emitError(error, SVGAPlayerErrorType.START)
      throw error
    }
  }

  public resume (): void {
    try {
      this.assertActiveCompiled()
      this.startAnimation(true)
      this.emit('resume', undefined)
    } catch (error) {
      this.emitError(error, SVGAPlayerErrorType.RESUME)
      throw error
    }
  }

  public pause (): void {
    this.animator.stop()
    this.emit('pause', undefined)
  }

  public stop (): void {
    this.animator.stop()
    this.currentFrame = 0
    this.activeKey = null
    this.backend.clear()
    this.emit('stop', undefined)
  }

  public clear (): void {
    this.backend.clear()
  }

  public replace (
    elementKey: string,
    texture: ReplaceElement | DynamicElement,
    options: SVGAPlayerReplaceOptions = {}
  ): void {
    const slotKey = normalizeKey(options.key)

    try {
      const slot = this.getLoadedSlot(slotKey)
      if ((options.mode ?? 'replace') === 'dynamic') {
        slot.video.dynamicElements[elementKey] = texture as DynamicElement
      } else {
        slot.video.replaceElements[elementKey] = texture as ReplaceElement
      }

      if (slot.compiledAnimation !== null) {
        slot.compiledAnimation = this.compileSlot(slot)
        slot.dirty = true
        if (this.preparedKey === slotKey) {
          this.refreshPreparedSlot(slotKey, slot).catch(error => {
            this.emitError(error, SVGAPlayerErrorType.REFRESH)
          })
        }
      }
    } catch (error) {
      this.emitError(error, SVGAPlayerErrorType.REPLACE)
      throw error
    }
  }

  public delete (key?: string): void {
    const slotKey = normalizeKey(key)
    this.nextSlotVersion(slotKey)
    if (!this.slots.has(slotKey)) return

    if (this.activeKey === slotKey) this.stop()
    this.slots.delete(slotKey)

    if (this.preparedKey === slotKey) {
      this.preparedKey = null
      this.backend.clear()
    }
  }

  public async cache (db: DB, options: SVGAPlayerCacheOptions): Promise<void> {
    const slotKey = normalizeKey(options.key)
    try {
      const slot = this.getLoadedSlot(slotKey)
      await db.insert(options.id, slot.video)
    } catch (error) {
      this.emitError(error, SVGAPlayerErrorType.CACHE)
      throw error
    }
  }

  public destroy (): void {
    this.destroyed = true
    this.animator.stop()
    this.parser?.destroy()
    this.parser = null
    this.slots.clear()
    this.slotVersions.clear()
    this.backend.destroy()
    this.activeKey = null
    this.preparedKey = null
    this.currentFrame = 0
    this.totalFrames = 0
    this.listeners = {}
    if (this.intersectionObserver !== null) {
      this.intersectionObserver.disconnect()
      this.intersectionObserver = null
    }
  }

  public get progress (): number {
    return this.totalFrames > 0 ? this.currentFrame / this.totalFrames : 0
  }

  private async prepareSlot (slotKey: string): Promise<void> {
    const slot = this.getLoadedSlot(slotKey)
    if (slot.preparePromise !== null) {
      await slot.preparePromise
      return
    }

    slot.preparePromise = this.prepareSlotNow(slotKey, slot).finally(() => {
      slot.preparePromise = null
    })
    await slot.preparePromise
  }

  private async prepareSlotNow (slotKey: string, slot: SlotState): Promise<void> {
    if (!this.isCurrentSlot(slotKey, slot)) return
    if (this.activeKey !== null && this.activeKey !== slotKey) this.stop()

    if (slot.compiledAnimation === null) {
      slot.compiledAnimation = this.compileSlot(slot)
      slot.dirty = false
    }

    if (this.preparedKey !== slotKey) {
      await this.prepareBackend(slot.compiledAnimation)
      if (!this.isCurrentSlot(slotKey, slot)) return
    } else if (slot.dirty) {
      await this.backend.refresh(slot.compiledAnimation)
      if (!this.isCurrentSlot(slotKey, slot)) return
    }

    slot.dirty = false
    this.preparedKey = slotKey
    this.currentFrame = 0
    this.totalFrames = slot.compiledAnimation.totalFrames - 1
  }

  private compileSlot (slot: SlotState): CompiledAnimation {
    const compiler = new RenderCompiler()
    const animation = compiler.compile(slot.video)
    animation.backendType = this.backend.type
    return animation
  }

  private async prepareBackend (animation: CompiledAnimation): Promise<void> {
    this.backend.resize(animation.size.width, animation.size.height)
    this.reportUnsupportedCapabilities(animation)
    await this.backend.prepare(animation)
  }

  private async refreshPreparedSlot (slotKey: string, slot: SlotState): Promise<void> {
    if (this.preparedKey !== slotKey || slot.compiledAnimation === null) return
    this.reportUnsupportedCapabilities(slot.compiledAnimation)
    await this.backend.refresh(slot.compiledAnimation)
    if (!this.isCurrentSlot(slotKey, slot)) return
    slot.dirty = false
  }

  private startPreparedSlot (slotKey: string): void {
    this.assertPrepared(slotKey)
    this.activeKey = slotKey
    this.backend.clear()
    this.startAnimation(false)
    this.emit('start', undefined)
  }

  private reportUnsupportedCapabilities (animation: CompiledAnimation): void {
    const unsupportedCapabilities = diffRenderCapabilities(
      animation.requiredCapabilities,
      this.backend.capabilities
    )
    if (unsupportedCapabilities.length === 0) return

    const payload: SVGAPlayerUnsupportedCapabilitiesPayload = {
      backendType: this.backend.type,
      unsupportedCapabilities,
      requiredCapabilities: animation.requiredCapabilities,
      backendCapabilities: this.backend.capabilities
    }

    this.emitError(
      new Error(`[SVGAPlayer] ${this.backend.type} backend does not support required capabilities: ${unsupportedCapabilities.join(', ')}`),
      SVGAPlayerErrorType.UNSUPPORTED_CAPABILITIES,
      false
    )
    console.warn(
      `[SVGAPlayer] ${this.backend.type} backend does not support required capabilities: ${unsupportedCapabilities.join(', ')}. Unsupported parts will be skipped during rendering.`,
      payload
    )
  }

  private isCurrentSlot (key: string, slot: SlotState): boolean {
    return !this.destroyed &&
      this.slots.get(key) === slot &&
      this.slotVersions.get(key) === slot.version
  }

  private assertPrepared (slotKey: string): void {
    const slot = this.getLoadedSlot(slotKey)
    if (slot.compiledAnimation === null || this.preparedKey !== slotKey) {
      throw new Error(`SVGAPlayer.prepare('${slotKey}') is required before start()`)
    }
  }

  private assertActiveCompiled (): void {
    const slot = this.activeKey === null ? null : this.slots.get(this.activeKey)
    if (slot?.compiledAnimation === undefined || slot.compiledAnimation === null) {
      throw new Error('SVGAPlayer.play() is required before resume()')
    }
  }

  private getActiveAnimation (): CompiledAnimation | null {
    if (this.activeKey === null) return null
    return this.slots.get(this.activeKey)?.compiledAnimation ?? null
  }

  private startAnimation (resumeFromCurrentFrame: boolean): void {
    const animation = this.getActiveAnimation()
    if (animation === null) {
      throw new Error('SVGAPlayer.play() is required before rendering')
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
    this.animator.duration = frameDistance * (1.0 / animation.fps) * 1000
    this.animator.loopStart = loopStartFrame > startFrame ? (loopStartFrame - startFrame) * (1.0 / animation.fps) * 1000 : 0
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
    const animation = this.getActiveAnimation()
    if (animation === null) return
    if (this.config.isUseIntersectionObserver && !this.isBeIntersection) return
    try {
      this.backend.renderFrame(animation, frame)
    } catch (error) {
      this.animator.stop()
      this.emitError(error, SVGAPlayerErrorType.RENDER)
      throw error
    }
  }

  private getParser (): Parser {
    if (this.parser === null) {
      this.parser = new Parser(this.parserOptions)
    }
    return this.parser
  }

  private async enqueueUrlLoad (task: () => Promise<void>): Promise<void> {
    const run = this.loadQueue.catch(() => {}).then(async () => { await task() })
    this.loadQueue = run.then(() => {}, () => {})
    await run
  }

  private storeLoadedSlot (key: string, video: Video, version: number): void {
    if (this.destroyed) return
    if (this.slotVersions.get(key) !== version) return

    if (this.activeKey === key) this.stop()
    if (this.preparedKey === key) {
      this.preparedKey = null
      this.backend.clear()
    }

    this.slots.set(key, {
      video,
      compiledAnimation: null,
      dirty: false,
      version,
      preparePromise: null
    })
  }

  private getLoadedSlot (key: string): SlotState {
    const slot = this.slots.get(key)
    if (slot === undefined) {
      throw new Error(`SVGAPlayer.load('${key}') is required before this operation`)
    }
    return slot
  }

  private nextSlotVersion (key: string): number {
    const version = (this.slotVersions.get(key) ?? 0) + 1
    this.slotVersions.set(key, version)
    return version
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

  private emitError (
    error: unknown,
    errorType: SVGAPlayerErrorType,
    blocking: boolean = true
  ): void {
    this.emit(
      'error',
      error instanceof Error ? error : new Error(String(error)),
      errorType,
      blocking
    )
  }

  private emit<T extends SVGAPlayerEventName> (
    event: T,
    ...args: T extends 'error'
      ? [Error, SVGAPlayerErrorType, boolean]
      : SVGAPlayerEventMap[T] extends undefined
        ? [undefined]
        : [SVGAPlayerEventMap[T]]
  ): void {
    const callbacks = this.listeners[event]
    if (callbacks === undefined) return
    callbacks.forEach(callback => {
      ;(callback as any)(...args)
    })
  }
}
