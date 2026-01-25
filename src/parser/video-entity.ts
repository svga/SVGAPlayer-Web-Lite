import {
  Movie,
  Video,
  RawImages,
  ReplaceElements,
  DynamicElements,
  VideoFrame,
  VideoSprite,
  SHAPE_TYPE,
  SHAPE_TYPE_CODE,
  VideoFrameShapes,
  VideoFrameShape,
  LINE_CAP_CODE,
  LINE_JOIN_CODE,
  RGBA,
  RGBA_CODE,
  Transform,
  Rect,
  VideoStyles,
  MovieStyles,
  MovieShape,
  MovieSprite,
  MovieFrame,
  MaskPath
} from '../types'

function calculateTransformedX (transform: Transform, layout: Rect): number {
  const { a, c, tx } = transform
  const { x, y, width, height } = layout

  return Math.min(
    a * x + c * y + tx,
    a * (x + width) + c * y + tx,
    a * x + c * (y + height) + tx,
    a * (x + width) + c * (y + height) + tx
  )
}

function calculateTransformedY (transform: Transform, layout: Rect): number {
  const { b, d, ty } = transform
  const { x, y, width, height } = layout

  return Math.min(
    b * x + d * y + ty,
    b * (x + width) + d * y + ty,
    b * x + d * (y + height) + ty,
    b * (x + width) + d * (y + height) + ty
  )
}

const LINE_CAP_MAP: Record<LINE_CAP_CODE, CanvasLineCap> = {
  [LINE_CAP_CODE.BUTT]: 'butt',
  [LINE_CAP_CODE.ROUND]: 'round',
  [LINE_CAP_CODE.SQUARE]: 'square'
}

const LINE_JOIN_MAP: Record<LINE_JOIN_CODE, CanvasLineJoin> = {
  [LINE_JOIN_CODE.BEVEL]: 'bevel',
  [LINE_JOIN_CODE.ROUND]: 'round',
  [LINE_JOIN_CODE.MITER]: 'miter'
}

function createTransform (transform: Transform | null | undefined): Transform {
  return {
    a: transform?.a ?? 1,
    b: transform?.b ?? 0,
    c: transform?.c ?? 0,
    d: transform?.d ?? 1,
    tx: transform?.tx ?? 0,
    ty: transform?.ty ?? 0
  }
}

function rgbaToString (color: RGBA_CODE): RGBA<number, number, number, number> {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`
}

function buildLineDash (lineDashI: number | null, lineDashII: number | null, lineDashIII: number | null): number[] {
  const lineDash: number[] = []

  if (lineDashI !== null && lineDashI > 0) {
    lineDash.push(lineDashI)
  }

  if (lineDashII !== null && lineDashII > 0) {
    if (lineDash.length < 1) {
      lineDash.push(0)
    }
    lineDash.push(lineDashII)
  }

  if (lineDashIII !== null && lineDashIII > 0) {
    while (lineDash.length < 2) {
      lineDash.push(0)
    }
    lineDash[2] = lineDashIII
  }

  return lineDash
}

function createVideoStyles (mStyles: MovieStyles): VideoStyles {
  const lineDash = buildLineDash(mStyles.lineDashI, mStyles.lineDashII, mStyles.lineDashIII)
  const lineCap = mStyles.lineCap === null ? null : LINE_CAP_MAP[mStyles.lineCap as LINE_CAP_CODE] ?? null
  const lineJoin = mStyles.lineJoin === null ? null : LINE_JOIN_MAP[mStyles.lineJoin as LINE_JOIN_CODE] ?? null
  const fill = mStyles.fill !== null ? rgbaToString(mStyles.fill) : null
  const stroke = mStyles.stroke !== null ? rgbaToString(mStyles.stroke) : null

  return {
    lineDash,
    fill,
    stroke,
    lineCap,
    lineJoin,
    strokeWidth: mStyles.strokeWidth,
    miterLimit: mStyles.miterLimit
  }
}

function createVideoShape (
  mShape: MovieShape,
  styles: VideoStyles,
  transform: Transform
): VideoFrameShape | null {
  const { type, shape, rect, ellipse } = mShape

  if (type === SHAPE_TYPE_CODE.SHAPE && shape !== null && shape.d.length > 0) {
    return { type: SHAPE_TYPE.SHAPE, path: shape, styles, transform }
  }
  if (type === SHAPE_TYPE_CODE.RECT && rect !== null) {
    return { type: SHAPE_TYPE.RECT, path: rect, styles, transform }
  }
  if (type === SHAPE_TYPE_CODE.ELLIPSE && ellipse !== null) {
    return { type: SHAPE_TYPE.ELLIPSE, path: ellipse, styles, transform }
  }

  return null
}

export class VideoEntity implements Video {
  public version: string
  public size = { width: 0, height: 0 }
  public fps = 20
  public frames = 0
  public images: RawImages = {}
  public replaceElements: ReplaceElements = {}
  public dynamicElements: DynamicElements = {}
  public sprites: VideoSprite[] = []

  constructor (movie: Movie, images: RawImages = {}) {
    this.version = movie.version
    this.size = { width: movie.params.viewBoxWidth, height: movie.params.viewBoxHeight }
    this.fps = movie.params.fps
    this.frames = movie.params.frames
    this.images = images

    this.processSprites(movie.sprites)
  }

  private processSprites (movieSprites: MovieSprite[]): void {
    movieSprites.forEach(mSprite => {
      const vSprite: VideoSprite = {
        imageKey: mSprite.imageKey,
        frames: []
      }

      let lastShapes: VideoFrameShapes | undefined
      const frameContext = { lastShapes: undefined as VideoFrameShapes | undefined }

      mSprite.frames.forEach(mFrame => {
        const vFrame = this.processFrame(mFrame, frameContext)
        vSprite.frames.push(vFrame)
      })

      this.sprites.push(vSprite)
    })
  }

  private processFrame (mFrame: MovieFrame, context: { lastShapes?: VideoFrameShapes }): VideoFrame {
    const layout = this.createLayout(mFrame.layout)
    const transform = createTransform(mFrame.transform)
    const clipPath = mFrame.clipPath ?? ''

    const shapes = this.processShapes(mFrame.shapes, context)
    const nx = calculateTransformedX(transform, layout)
    const ny = calculateTransformedY(transform, layout)
    const maskPath = this.createMaskPath(clipPath)

    return {
      alpha: mFrame.alpha ?? 0,
      layout,
      transform,
      clipPath,
      shapes,
      nx,
      ny,
      maskPath
    }
  }

  private createLayout (layout: { x: number | null, y: number | null, width: number | null, height: number | null } | null): Rect {
    return {
      x: layout?.x ?? 0,
      y: layout?.y ?? 0,
      width: layout?.width ?? 0,
      height: layout?.height ?? 0
    }
  }

  private processShapes (mShapes: MovieShape[], context: { lastShapes?: VideoFrameShapes }): VideoFrameShapes {
    if (this.shouldKeepPreviousShapes(mShapes, context.lastShapes)) {
      return context.lastShapes!
    }

    const shapes: VideoFrameShapes = []

    mShapes.forEach(mShape => {
      const shape = this.processShape(mShape)
      if (shape !== null) {
        shapes.push(shape)
      }
    })

    context.lastShapes = shapes
    return shapes
  }

  private shouldKeepPreviousShapes (mShapes: MovieShape[], lastShapes: VideoFrameShapes | undefined): boolean {
    return mShapes[0] !== undefined &&
           mShapes[0].type === SHAPE_TYPE_CODE.KEEP &&
           lastShapes !== undefined
  }

  private processShape (mShape: MovieShape): VideoFrameShape | null {
    const mStyles = mShape.styles
    if (mStyles === null) return null

    const styles = createVideoStyles(mStyles)
    const transform = createTransform(mShape.transform)

    return createVideoShape(mShape, styles, transform)
  }

  private createMaskPath (clipPath: string): { d: string, transform: Transform | undefined, styles: VideoStyles } | null {
    if (clipPath.length === 0) return null

    return {
      d: clipPath,
      transform: undefined,
      styles: {
        fill: `rgba(0, 0, 0, 0)` satisfies RGBA<number, number, number, number>,
        stroke: null,
        strokeWidth: null,
        lineCap: null,
        lineJoin: null,
        miterLimit: null,
        lineDash: null
      }
    }
  }
}
