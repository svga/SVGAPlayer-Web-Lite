export as namespace SVGA;

export enum SVGA_VERSION {
  VERSION_1_0 = '1.0',
  VERSION_1_5 = '1.5',
  VERSION_2_0 = '2.0',
}

export enum EVENT_TYPES {
  START = 'start',
  PROCESS = 'process',
  PAUSE = 'pause',
  STOP = 'stop',
  END = 'end',
  CLEAR = 'clear'
}

export enum FILL_MODE {
  FORWARDS = 'forwards',
  BACKWARDS = 'backwards'
}

export enum PLAY_MODE {
  FORWARDS = 'forwards',
  FALLBACKS = 'fallbacks'
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Transform {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

interface VideoSize {
  width: number
  height: number
}

interface FrameEntity {
  alpha: number
  transform: Transform
  nx: number
  ny: number
  layout: Rect
  maskPath: any
  shapes: Array<any>
}

interface SpriteEntity {
  imageKey: string
  frames: FrameEntity[]
}

type DynamicElement = CanvasImageSource | {
  source: CanvasImageSource,
  fit: 'contain' | 'cover' | 'fill' | 'none'
}

interface VideoEntity {
  version: SVGA_VERSION
  videoSize: VideoSize
  FPS: number
  frames: number
  images: { [key: string]: any }
  dynamicElements: { [key: string]: DynamicElement }
  sprites: Array<SpriteEntity>
}

export class Downloader {
  get(url: string): Promise<ArrayBuffer>
  cancel(): void
  destroy(): void
}

export class Parser {
  do(data: ArrayBuffer): Promise<VideoEntity>
  destroy(): void
}

interface options {
  loop?: number | boolean
  fillMode?: FILL_MODE
  playMode?: PLAY_MODE
  startFrame?: number
  endFrame?: number
  cacheFrames: boolean
  intersectionObserverRender: boolean
}

export class Player {
  constructor(element: string | HTMLCanvasElement, videoItem?: VideoEntity, options?: options)
  container: HTMLCanvasElement
  loop: number | boolean
  fillMode: FILL_MODE
  playMode: PLAY_MODE
  progress: number
  currentFrame: number
  totalFramesCount: number
  startFrame: number
  endFrame: number
  set(options: options): void
  mount(videoItem: VideoEntity): Promise<undefined>
  start(): void
  pause(): void
  stop(): void
  clear(): void
  destroy(): void
  $on(event: EVENT_TYPES, execFunction: Function): Player
}
