import {
  type Movie,
  type RawImages,
  type Video,
  type VideoFrame,
  type VideoFrameShapes,
  type VideoSprite,
  LINE_CAP_CODE,
  LINE_JOIN_CODE,
  type RGBA,
  SHAPE_TYPE,
  SHAPE_TYPE_CODE
} from '../types'

const rgb = (value: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(255, Math.max(0, Math.floor(value * 255)))
}

const alpha = (value: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

const color = (value: { r: number, g: number, b: number, a: number }): RGBA<number, number, number, number> =>
  (`rgba(${rgb(value.r)}, ${rgb(value.g)}, ${rgb(value.b)}, ${alpha(value.a)})`) as RGBA<number, number, number, number>

export function createVideo (movie: Movie, images: RawImages = Object.create(null) as RawImages): Video {
  const sprites: VideoSprite[] = []

  movie.sprites.forEach(movieSprite => {
    const frames: VideoFrame[] = []
    const sprite: VideoSprite = { imageKey: movieSprite.imageKey, frames }
    let lastShapes: VideoFrameShapes | undefined

    movieSprite.frames.forEach(movieFrame => {
      const layout = {
        x: movieFrame.layout?.x ?? 0,
        y: movieFrame.layout?.y ?? 0,
        width: movieFrame.layout?.width ?? 0,
        height: movieFrame.layout?.height ?? 0
      }
      const transform = {
        a: movieFrame.transform?.a ?? 1,
        b: movieFrame.transform?.b ?? 0,
        c: movieFrame.transform?.c ?? 0,
        d: movieFrame.transform?.d ?? 1,
        tx: movieFrame.transform?.tx ?? 0,
        ty: movieFrame.transform?.ty ?? 0
      }
      let shapes: VideoFrameShapes = []

      movieFrame.shapes.forEach(movieShape => {
        const movieStyles = movieShape.styles
        if (movieStyles === null || movieStyles === undefined) return

        const lineDash: number[] = []
        if (movieStyles.lineDashI !== null && movieStyles.lineDashI > 0) lineDash.push(movieStyles.lineDashI)
        if (movieStyles.lineDashII !== null && movieStyles.lineDashII > 0) {
          if (lineDash.length < 1) lineDash.push(0)
          lineDash.push(movieStyles.lineDashII)
        }
        if (movieStyles.lineDashIII !== null && movieStyles.lineDashIII > 0) {
          while (lineDash.length < 2) lineDash.push(0)
          lineDash[2] = movieStyles.lineDashIII
        }

        let lineCap: CanvasLineCap | null = null
        if (movieStyles.lineCap === LINE_CAP_CODE.BUTT) lineCap = 'butt'
        else if (movieStyles.lineCap === LINE_CAP_CODE.ROUND) lineCap = 'round'
        else if (movieStyles.lineCap === LINE_CAP_CODE.SQUARE) lineCap = 'square'

        let lineJoin: CanvasLineJoin | null = null
        if (movieStyles.lineJoin === LINE_JOIN_CODE.MITER) lineJoin = 'miter'
        else if (movieStyles.lineJoin === LINE_JOIN_CODE.ROUND) lineJoin = 'round'
        else if (movieStyles.lineJoin === LINE_JOIN_CODE.BEVEL) lineJoin = 'bevel'

        const styles = {
          lineDash,
          fill: movieStyles.fill === null || movieStyles.fill === undefined ? null : color(movieStyles.fill),
          stroke: movieStyles.stroke === null || movieStyles.stroke === undefined ? null : color(movieStyles.stroke),
          lineCap,
          lineJoin,
          strokeWidth: movieStyles.strokeWidth,
          miterLimit: movieStyles.miterLimit
        }
        const shapeTransform = {
          a: movieShape.transform?.a ?? 1,
          b: movieShape.transform?.b ?? 0,
          c: movieShape.transform?.c ?? 0,
          d: movieShape.transform?.d ?? 1,
          tx: movieShape.transform?.tx ?? 0,
          ty: movieShape.transform?.ty ?? 0
        }

        if (movieShape.type === SHAPE_TYPE_CODE.SHAPE && movieShape.shape !== null && movieShape.shape !== undefined) {
          shapes.push({ type: SHAPE_TYPE.SHAPE, path: { d: movieShape.shape.d }, styles, transform: shapeTransform })
        } else if (movieShape.type === SHAPE_TYPE_CODE.RECT && movieShape.rect !== null && movieShape.rect !== undefined) {
          shapes.push({
            type: SHAPE_TYPE.RECT,
            path: {
              x: movieShape.rect.x,
              y: movieShape.rect.y,
              width: movieShape.rect.width,
              height: movieShape.rect.height,
              cornerRadius: movieShape.rect.cornerRadius
            },
            styles,
            transform: shapeTransform
          })
        } else if (movieShape.type === SHAPE_TYPE_CODE.ELLIPSE && movieShape.ellipse !== null && movieShape.ellipse !== undefined) {
          shapes.push({
            type: SHAPE_TYPE.ELLIPSE,
            path: {
              x: movieShape.ellipse.x,
              y: movieShape.ellipse.y,
              radiusX: movieShape.ellipse.radiusX,
              radiusY: movieShape.ellipse.radiusY
            },
            styles,
            transform: shapeTransform
          })
        }
      })

      if (movieFrame.shapes[0]?.type === SHAPE_TYPE_CODE.KEEP && lastShapes !== undefined) shapes = lastShapes
      else lastShapes = shapes

      frames.push({
        alpha: movieFrame.alpha ?? 0,
        layout,
        transform,
        clipPath: movieFrame.clipPath ?? '',
        shapes
      })
    })
    sprites.push(sprite)
  })

  return {
    version: movie.version,
    size: { width: movie.params.viewBoxWidth, height: movie.params.viewBoxHeight },
    fps: movie.params.fps,
    frames: movie.params.frames,
    images,
    replaceElements: Object.create(null) as Video['replaceElements'],
    dynamicElements: Object.create(null) as Video['dynamicElements'],
    sprites
  }
}
