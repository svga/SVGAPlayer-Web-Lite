import {
  DynamicElements,
  Video,
  Transform,
  SHAPE_TYPE,
  VideoStyles,
  VideoFrameShape,
  VideoSprite,
  BitmapsCache,
  Drawable,
  PlayerElement,
  ReplaceElements
} from '../types'

function ownValue<T> (values: { [key: string]: T }, key: string): T | undefined {
  return ({}).hasOwnProperty.call(values, key) ? values[key] : undefined
}

function numberOrZero (value: number | null | undefined): number {
  return value == null ? 0 : value
}

function render (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  bitmapsCache: BitmapsCache,
  dynamicElements: DynamicElements,
  replaceElements: ReplaceElements,
  videoEntity: Video,
  currentFrame: number
): void {
  const context = canvas.getContext('2d')

  if (context === null || !('save' in context)) throw Error('Invalid render context')

  videoEntity.sprites.forEach(sprite => {
    const key = sprite.imageKey
    drawSprite(
      context,
      sprite,
      currentFrame,
      ownValue(bitmapsCache, key),
      ownValue(replaceElements, key),
      ownValue(dynamicElements, key)
    )
  })
}

function drawSprite (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sprite: VideoSprite,
  currentFrame: number,
  bitmap: Drawable | undefined,
  replaceElement: PlayerElement | undefined,
  dynamicElement: PlayerElement | undefined
): void {
  const frame = sprite.frames[currentFrame]
  if (!frame || frame.alpha < 0.05) return

  context.save()
  try {
    context.globalAlpha = frame.alpha
    const transform = frame.transform
    if (transform) context.transform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty)
    if (frame.clipPath && !clipPath(context, frame.clipPath)) return

    const image = replaceElement || bitmap
    if (image) context.drawImage(image, 0, 0, frame.layout.width, frame.layout.height)

    if (dynamicElement) {
      context.drawImage(dynamicElement, (frame.layout.width - dynamicElement.width) / 2, (frame.layout.height - dynamicElement.height) / 2)
    }
    frame.shapes.forEach(shape => drawShape(context, shape))
  } finally {
    context.restore()
  }
}

function drawShape (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: VideoFrameShape
): void {
  switch (shape.type) {
    case SHAPE_TYPE.SHAPE:
      drawSvgPath(context, shape.path.d, shape.transform, shape.styles)
      break
    case SHAPE_TYPE.ELLIPSE:
      drawEllipse(
        context,
        numberOrZero(shape.path.x), numberOrZero(shape.path.y),
        numberOrZero(shape.path.radiusX), numberOrZero(shape.path.radiusY),
        shape.transform, shape.styles
      )
      break
    case SHAPE_TYPE.RECT:
      drawRect(
        context,
        numberOrZero(shape.path.x), numberOrZero(shape.path.y),
        numberOrZero(shape.path.width), numberOrZero(shape.path.height), numberOrZero(shape.path.cornerRadius),
        shape.transform, shape.styles
      )
      break
  }
}

function resetShapeStyles (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  styles: VideoStyles
): void {
  context.strokeStyle = styles.stroke || 'transparent'
  if (styles.strokeWidth && styles.strokeWidth > 0) context.lineWidth = styles.strokeWidth
  if (styles.miterLimit && styles.miterLimit > 0) context.miterLimit = styles.miterLimit
  if (styles.lineCap) context.lineCap = styles.lineCap
  if (styles.lineJoin) context.lineJoin = styles.lineJoin
  context.fillStyle = styles.fill || 'transparent'
  if (styles.lineDash) context.setLineDash(styles.lineDash)
}

function drawStyled (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  transform: Transform | undefined,
  styles: VideoStyles,
  path: Path2D
): void {
  context.save()
  try {
    resetShapeStyles(context, styles)
    if (transform) context.transform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty)
    if (styles.fill) context.fill(path)
    if (styles.stroke) context.stroke(path)
  } finally {
    context.restore()
  }
}

function svgPath (d: string | undefined): Path2D | undefined {
  if (!d) return undefined
  try {
    return new Path2D(d)
  } catch {
    return undefined
  }
}

function drawSvgPath (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  d: string | undefined,
  transform: Transform | undefined,
  styles: VideoStyles
): void {
  const path = svgPath(d)
  if (path) drawStyled(context, transform, styles, path)
}

function clipPath (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  d: string
): boolean {
  const path = svgPath(d)
  if (!path) return false
  context.clip(path)
  return true
}

function drawEllipse (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  transform: Transform | undefined,
  styles: VideoStyles
): void {
  let path: Path2D
  try {
    path = new Path2D()
    path.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2)
  } catch {
    return
  }
  drawStyled(context, transform, styles, path)
}

function drawRect (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number,
  transform: Transform | undefined,
  styles: VideoStyles
): void {
  let path: Path2D
  try {
    path = new Path2D()
    let radius = cornerRadius
    if (width < 2 * radius) radius = width / 2
    if (height < 2 * radius) radius = height / 2
    path.moveTo(x + radius, y)
    path.arcTo(x + width, y, x + width, y + height, radius)
    path.arcTo(x + width, y + height, x, y + height, radius)
    path.arcTo(x, y + height, x, y, radius)
    path.arcTo(x, y, x + width, y, radius)
    path.closePath()
  } catch {
    return
  }
  drawStyled(context, transform, styles, path)
}

export default render
