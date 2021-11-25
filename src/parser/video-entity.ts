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
  RGBA
} from '../types'

export class VideoEntity implements Video {
  public version: string
  public size = { width: 0, height: 0 }
  public fps: number = 20
  public frames: number = 0
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

    this.sprites = []
    movie.sprites.forEach(mSprite => {
      const vFrames: VideoFrame[] = []
      const vSprite: VideoSprite = {
        imageKey: mSprite.imageKey,
        frames: vFrames
      }

      let lastShapes: VideoFrameShapes | undefined

      mSprite.frames.forEach(mFrame => {
        const layout = {
          x: mFrame.layout?.x ?? 0.0,
          y: mFrame.layout?.y ?? 0.0,
          width: mFrame.layout?.width ?? 0.0,
          height: mFrame.layout?.height ?? 0.0
        }

        const transform = {
          a: mFrame.transform?.a ?? 1.0,
          b: mFrame.transform?.b ?? 0.0,
          c: mFrame.transform?.c ?? 0.0,
          d: mFrame.transform?.d ?? 1.0,
          tx: mFrame.transform?.tx ?? 0.0,
          ty: mFrame.transform?.ty ?? 0.0
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

          let lineCap: CanvasLineCap | null = null
          switch (mStyles.lineCap) {
            case LINE_CAP_CODE.BUTT:
              lineCap = 'butt'
              break
            case LINE_CAP_CODE.ROUND:
              lineCap = 'round'
              break
            case LINE_CAP_CODE.SQUARE:
              lineCap = 'square'
              break
          }

          let lineJoin: CanvasLineJoin | null = null
          switch (mStyles.lineJoin) {
            case LINE_JOIN_CODE.BEVEL:
              lineJoin = 'bevel'
              break
            case LINE_JOIN_CODE.ROUND:
              lineJoin = 'round'
              break
            case LINE_JOIN_CODE.MITER:
              lineJoin = 'miter'
              break
          }

          let fill: RGBA<number, number, number, number> | null = null
          if (mStyles.fill !== null) {
            fill = `rgba(${parseInt((mStyles.fill.r * 255).toString())}, ${parseInt((mStyles.fill.g * 255).toString())}, ${parseInt((mStyles.fill.b * 255).toString())}, ${parseInt((mStyles.fill.a * 1).toString())})`
          }

          let stroke: RGBA<number, number, number, number> | null = null
          if (mStyles.stroke !== null) {
            stroke = `rgba(${parseInt((mStyles.stroke.r * 255).toString())}, ${parseInt((mStyles.stroke.g * 255).toString())}, ${parseInt((mStyles.stroke.b * 255).toString())}, ${parseInt((mStyles.stroke.a * 1).toString())})`
          }

          const { strokeWidth, miterLimit } = mStyles

          const styles = {
            lineDash,
            fill,
            stroke,
            lineCap,
            lineJoin,
            strokeWidth,
            miterLimit
          }

          const transform = {
            a: mShape.transform?.a ?? 1.0,
            b: mShape.transform?.b ?? 0.0,
            c: mShape.transform?.c ?? 0.0,
            d: mShape.transform?.d ?? 1.0,
            tx: mShape.transform?.tx ?? 0.0,
            ty: mShape.transform?.ty ?? 0.0
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
