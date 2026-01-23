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
  LINE_CAP_CODE,
  LINE_JOIN_CODE,
  RGBA,
  RGBA_CODE
} from '../types'

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

function rgbaToString (color: RGBA_CODE): RGBA<number, number, number, number> {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`
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

        const transform = {
          a: mFrame.transform?.a ?? 1,
          b: mFrame.transform?.b ?? 0,
          c: mFrame.transform?.c ?? 0,
          d: mFrame.transform?.d ?? 1,
          tx: mFrame.transform?.tx ?? 0,
          ty: mFrame.transform?.ty ?? 0
        }

        const clipPath = mFrame.clipPath ?? ''

        let shapes: VideoFrameShapes = []

        mFrame.shapes.forEach(mShape => {
          const mStyles = mShape.styles
          if (mStyles === null) return

          const lineDash: number[] = []
          if (mStyles.lineDashI !== null && mStyles.lineDashI > 0) {
            lineDash.push(mStyles.lineDashI)
          }
          if (mStyles.lineDashII !== null && mStyles.lineDashII > 0) {
            if (lineDash.length < 1) {
              lineDash.push(0)
            }
            lineDash.push(mStyles.lineDashII)
          }
          if (mStyles.lineDashIII !== null && mStyles.lineDashIII > 0) {
            if (lineDash.length < 2) {
              lineDash.push(0)
              lineDash.push(0)
            }
            lineDash[2] = mStyles.lineDashIII
          }

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

          const transform = {
            a: mShape.transform?.a ?? 1,
            b: mShape.transform?.b ?? 0,
            c: mShape.transform?.c ?? 0,
            d: mShape.transform?.d ?? 1,
            tx: mShape.transform?.tx ?? 0,
            ty: mShape.transform?.ty ?? 0
          }

          if (mShape.type === SHAPE_TYPE_CODE.SHAPE && mShape.shape !== null) {
            shapes.push({
              type: SHAPE_TYPE.SHAPE,
              path: mShape.shape,
              styles,
              transform
            })
          } else if (mShape.type === SHAPE_TYPE_CODE.RECT && mShape.rect !== null) {
            shapes.push({
              type: SHAPE_TYPE.RECT,
              path: mShape.rect,
              styles,
              transform
            })
          } else if (mShape.type === SHAPE_TYPE_CODE.ELLIPSE && mShape.ellipse !== null) {
            shapes.push({
              type: SHAPE_TYPE.ELLIPSE,
              path: mShape.ellipse,
              styles,
              transform
            })
          }
        })

        if (mFrame.shapes[0] !== undefined && mFrame.shapes[0].type === SHAPE_TYPE_CODE.KEEP && lastShapes !== undefined) {
          shapes = lastShapes
        } else {
          lastShapes = shapes
        }

        const llx = transform.a * layout.x + transform.c * layout.y + transform.tx
        const lrx = transform.a * (layout.x + layout.width) + transform.c * layout.y + transform.tx
        const lbx = transform.a * layout.x + transform.c * (layout.y + layout.height) + transform.tx
        const rbx = transform.a * (layout.x + layout.width) + transform.c * (layout.y + layout.height) + transform.tx
        const lly = transform.b * layout.x + transform.d * layout.y + transform.ty
        const lry = transform.b * (layout.x + layout.width) + transform.d * layout.y + transform.ty
        const lby = transform.b * layout.x + transform.d * (layout.y + layout.height) + transform.ty
        const rby = transform.b * (layout.x + layout.width) + transform.d * (layout.y + layout.height) + transform.ty
        const nx = Math.min(Math.min(lbx, rbx), Math.min(llx, lrx))
        const ny = Math.min(Math.min(lby, rby), Math.min(lly, lry))

        const maskPath = clipPath.length > 0 ? {
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
        } : null

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
