export interface ParserPostMessageArgs {
  url: string
  options: {
    isDisableImageBitmapShim: boolean
  }
}

export interface MockWebWorker {
  onmessage: (event: { data: ParserPostMessageArgs }) => void
  onmessageCallback: (data: Video) => void
  postMessage: (data: Video) => void
}

export interface ParserConfigOptions {
  /**
   * 是否取消使用 WebWorker，默认值 false
   */
  isDisableWebWorker?: boolean
  /**
   * 是否取消使用 ImageBitmap 垫片，默认值 false
   */
  isDisableImageBitmapShim?: boolean
}

export interface RawImages {
  [key: string]: string | HTMLImageElement | ImageBitmap
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Transform {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

export const enum LINE_CAP_CODE {
  BUTT = 0,
  ROUND = 1,
  SQUARE = 2
}

export const enum LINE_JOIN_CODE {
  MITER = 0,
  ROUND = 1,
  BEVEL = 2
}

export interface RGBA_CODE {
  r: number
  g: number
  b: number
  a: number
}

export type RGBA<R extends number, G extends number, B extends number, A extends number> = `rgba(${R}, ${G}, ${B}, ${A})`

export const enum SHAPE_TYPE_CODE {
  SHAPE = 0,
  RECT = 1,
  ELLIPSE = 2,
  KEEP = 3
}

export const enum SHAPE_TYPE {
  SHAPE = 'shape',
  RECT = 'rect',
  ELLIPSE = 'ellipse'
}

export interface MovieStyles {
  fill: RGBA_CODE | null
  stroke: RGBA_CODE | null
  strokeWidth: number | null
  lineCap: LINE_CAP_CODE | null
  lineJoin: LINE_JOIN_CODE | null
  miterLimit: number | null
  lineDashI: number | null
  lineDashII: number | null
  lineDashIII: number | null
}

export interface VideoStyles {
  fill: RGBA<number, number, number, number> | null
  stroke: RGBA<number, number, number, number> | null
  strokeWidth: number | null
  lineCap: CanvasLineCap | null
  lineJoin: CanvasLineJoin | null
  miterLimit: number | null
  lineDash: number[] | null
}

export interface ShapePath {
  d: string
}

export interface RectPath {
  x: number
  y: number
  width: number
  height: number
  cornerRadius: number
}

export interface EllipsePath {
  x: number
  y: number
  radiusX: number
  radiusY: number
}

export interface MovieShape {
  type: SHAPE_TYPE_CODE | null
  shape: ShapePath | null
  rect: RectPath | null
  ellipse: EllipsePath | null
  styles: MovieStyles | null
  transform: Transform | null
}

export interface VideoShapeShape {
  type: SHAPE_TYPE.SHAPE
  path: ShapePath
  styles: VideoStyles
  transform: Transform
}

export interface VideoShapeRect {
  type: SHAPE_TYPE.RECT
  path: RectPath
  styles: VideoStyles
  transform: Transform
}

export interface VideoShapeEllipse {
  type: SHAPE_TYPE.ELLIPSE
  path: EllipsePath
  styles: VideoStyles
  transform: Transform
}

export interface MovieFrame {
  alpha: number
  transform: Transform | null
  nx: number
  ny: number
  layout: Rect
  clipPath: string
  maskPath: null
  shapes: MovieShape[]
}

export type VideoFrameShape = VideoShapeShape|VideoShapeRect|VideoShapeEllipse

export type VideoFrameShapes = VideoFrameShape[]

export interface VideoFrame {
  alpha: number
  transform: Transform | null
  nx: number
  ny: number
  layout: Rect
  clipPath: string
  maskPath: null
  shapes: VideoFrameShapes
}

export interface MovieSprite {
  imageKey: string
  frames: MovieFrame[]
}

export interface VideoSprite {
  imageKey: string
  frames: VideoFrame[]
}

export type Bitmap = HTMLImageElement | OffscreenCanvas | ImageBitmap

export interface BitmapsCache {
  [key: string]: Bitmap | ImageBitmap
}

export type ReplaceElement = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas

export interface ReplaceElements {
  [key: string]: ReplaceElement
}

export type DynamicElement = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas

export interface DynamicElements {
  [key: string]: DynamicElement
}

export interface Movie {
  version: string
  images: {
    [key: string]: Uint8Array
  }
  params: {
    fps: number
    frames: number
    viewBoxHeight: number
    viewBoxWidth: number
  }
  sprites: MovieSprite[]
}

export interface Video {
  version: string
  size: {
    width: number
    height: number
  }
  fps: number
  frames: number
  images: RawImages
  replaceElements: ReplaceElements
  dynamicElements: DynamicElements
  sprites: VideoSprite[]
}

export const enum PLAYER_FILL_MODE {
  FORWARDS = 'forwards',
  BACKWARDS = 'backwards'
}

export const enum PLAYER_PLAY_MODE {
  FORWARDS = 'forwards',
  FALLBACKS = 'fallbacks'
}

export interface PalyerConfig {
  /**
   * 播放动画的 Canvas 元素
   */
  container: HTMLCanvasElement
  /**
   * 循环次数，默认值 0（无限循环）
   */
  loop: number | boolean
  /**
   * 最后停留的目标模式，类似于 animation-fill-mode，默认值 forwards。
   */
  fillMode: PLAYER_FILL_MODE
  /**
   * 播放模式，默认值 forwards
   */
  playMode: PLAYER_PLAY_MODE
  /**
   * 开始播放的帧数，默认值 0
   */
  startFrame: number
  /**
   * 结束播放的帧数，默认值 0
   */
  endFrame: number
  /**
   * 是否开启缓存已播放过的帧数据，默认值 false
   */
  isCacheFrames: boolean
  /**
   * 是否开启动画容器视窗检测，默认值 false
   * 开启后利用 Intersection Observer API 检测动画容器是否处于视窗内，若处于视窗外，停止描绘渲染帧避免造成资源消耗
   */
  isUseIntersectionObserver: boolean
  /**
   * 是否使用避免执行延迟，默认值 false
   * 开启后使用 `WebWorker` 确保动画按时执行（避免个别情况下浏览器延迟或停止执行动画任务）
   */
  isOpenNoExecutionDelay: boolean
}

export type PalyerConfigOptions = Partial<PalyerConfig>
