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
  MovieShape
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

function createVideoShape (
  mShape: MovieShape,
  styles: VideoStyles,
  transform: Transform
): VideoFrameShape | null {
  const { type, shape, rect, ellipse } = mShape

  if (type === SHAPE_TYPE_CODE.SHAPE && shape !== null) {
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

    const { viewBoxWidth, viewBoxHeight, fps, frames } = movie.params
    this.size.width = viewBoxWidth
    this.size.height = viewBoxHeight
    this.fps = fps
    this.frames = frames

    movie.sprites.forEach(mSprite => {
      const vFrames: VideoFrame[] = []
      const vSprite: VideoSprite = {
        imageKey: mSprite.imageKey,
        frames: vFrames
      }

      let lastShapes: VideoFrameShapes | undefined

      mSprite.frames.forEach(mFrame => {
        const layout = {
          x: mFrame.layout?.x ?? 0,
          y: mFrame.layout?.y ?? 0,
          width: mFrame.layout?.width ?? 0,
          height: mFrame.layout?.height ?? 0
        }

        const transform = createTransform(mFrame.transform)

        const clipPath = mFrame.clipPath ?? ''

        let shapes: VideoFrameShapes = []

        mFrame.shapes.forEach(mShape => {
          const mStyles = mShape.styles
          if (mStyles === null) return

          const lineDash = buildLineDash(mStyles.lineDashI, mStyles.lineDashII, mStyles.lineDashIII)
          const lineCap = mStyles.lineCap === null ? null : LINE_CAP_MAP[mStyles.lineCap] ?? null
          const lineJoin = mStyles.lineJoin === null ? null : LINE_JOIN_MAP[mStyles.lineJoin] ?? null
          const fill = mStyles.fill !== null ? rgbaToString(mStyles.fill) : null
          const stroke = mStyles.stroke !== null ? rgbaToString(mStyles.stroke) : null

          const styles = {
            lineDash,
            fill,
            stroke,
            lineCap,
            lineJoin,
            strokeWidth: mStyles.strokeWidth,
            miterLimit: mStyles.miterLimit
          }

          const transform = createTransform(mShape.transform)

          const shape = createVideoShape(mShape, styles, transform)
          if (shape !== null) {
            shapes.push(shape)
          }
        })

        if (mFrame.shapes[0] !== undefined && mFrame.shapes[0].type === SHAPE_TYPE_CODE.KEEP && lastShapes !== undefined) {
          shapes = lastShapes
        } else {
          lastShapes = shapes
        }

        const nx = calculateTransformedX(transform, layout)
        const ny = calculateTransformedY(transform, layout)

        const maskPath = clipPath.length > 0
          ? {
              d: clipPath,
              transform: undefined,
              styles: {
                fill: 'rgba(0, 0, 0, 0)' as RGBA<0, 0, 0, 0>,
                stroke: null,
                strokeWidth: null,
                lineCap: null,
                lineJoin: null,
                miterLimit: null,
                lineDash: null
              }
            }
          : null

        vSprite.frames.push({
          alpha: mFrame.alpha ?? 0,
          layout,
          transform,
          clipPath,
          shapes,
          nx,
          ny,
          maskPath
        })
      })
      this.sprites.push(vSprite)
    })

    this.images = images
  }
}
