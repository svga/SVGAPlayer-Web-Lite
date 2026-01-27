import {
  DynamicElements,
  DynamicElement,
  Video,
  Transform,
  SHAPE_TYPE,
  VideoStyles,
  VideoFrameShape,
  VideoSprite,
  BitmapsCache,
  Bitmap,
  ReplaceElement,
  ReplaceElements
} from '../types'

interface CurrentPoint {
  x: number
  y: number
  x1: number
  y1: number
  x2: number
  y2: number
}

const validMethods = 'MLHVCSQRZmlhvcsqrz'

const ALPHA_THRESHOLD = 0.05

interface PathSegment {
  method: string
  args: string[]
}

function parsePathData (d: string): PathSegment[] {
  const pathData = d.replace(/([a-zA-Z])/g, '|||$1 ').replace(/,/g, ' ')
  const segments: PathSegment[] = []

  pathData.split('|||').forEach(segment => {
    if (segment.length === 0) return

    const method = segment.charAt(0)
    const args = segment.slice(1).trim().split(' ').filter(arg => arg.length > 0)

    segments.push({ method, args })
  })

  return segments
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

  if (context === null) throw new Error('Render Context cannot be null')
  if (!('save' in context)) throw new Error('Render Context is not context2d')

  videoEntity.sprites.forEach(sprite => {
    const bitmap = bitmapsCache[sprite.imageKey]
    const replaceElement = replaceElements[sprite.imageKey]
    const dynamicElement = dynamicElements[sprite.imageKey]
    drawSprite(context, sprite, currentFrame, bitmap, replaceElement, dynamicElement)
  })
}

function drawSprite (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sprite: VideoSprite,
  currentFrame: number,
  bitmap: Bitmap | undefined,
  replaceElement: ReplaceElement | undefined,
  dynamicElement: DynamicElement | undefined
): void {
  const frame = sprite.frames[currentFrame]

  if (frame.alpha < ALPHA_THRESHOLD) return

  const transform = frame.transform
  context.save()
  context.globalAlpha = frame.alpha

  context.transform(
    transform?.a ?? 1,
    transform?.b ?? 0,
    transform?.c ?? 0,
    transform?.d ?? 1,
    transform?.tx ?? 0,
    transform?.ty ?? 0
  )

  if (bitmap !== undefined) {
    const { maskPath, layout } = frame
    if (maskPath !== null) {
      drawBezier(context, maskPath.d, maskPath.transform, maskPath.styles)
      context.clip()
    }
    context.drawImage(replaceElement ?? bitmap, 0, 0, layout.width, layout.height)
  }

  if (dynamicElement !== undefined) {
    context.drawImage(dynamicElement, (frame.layout.width - dynamicElement.width) / 2, (frame.layout.height - dynamicElement.height) / 2)
  }

  frame.shapes.forEach(shape => drawShape(context, shape))

  context.restore()
}

function drawShape (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: VideoFrameShape
): void {
  switch (shape.type) {
    case SHAPE_TYPE.SHAPE:
      drawBezier(
        context,
        shape.path.d,
        shape.transform,
        shape.styles
      )
      break
    case SHAPE_TYPE.ELLIPSE:
      drawEllipse(
        context,
        shape.path.x,
        shape.path.y,
        shape.path.radiusX,
        shape.path.radiusY,
        shape.transform,
        shape.styles
      )
      break
    case SHAPE_TYPE.RECT:
      drawRect(
        context,
        shape.path.x,
        shape.path.y,
        shape.path.width,
        shape.path.height,
        shape.path.cornerRadius,
        shape.transform,
        shape.styles
      )
      break
  }
}

function resetShapeStyles (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  styles: VideoStyles | undefined
): void {
  if (styles === undefined) return

  context.strokeStyle = styles.stroke ?? 'transparent'
  context.fillStyle = styles.fill ?? 'transparent'

  if (styles.strokeWidth !== null) context.lineWidth = styles.strokeWidth
  if (styles.miterLimit !== null) context.miterLimit = styles.miterLimit
  if (styles.lineCap !== null) context.lineCap = styles.lineCap
  if (styles.lineJoin !== null) context.lineJoin = styles.lineJoin
  if (styles.lineDash !== null) context.setLineDash(styles.lineDash)
}

function drawBezier (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  d: string | undefined,
  transform: Transform | undefined,
  styles: VideoStyles
): void {
  context.save()
  resetShapeStyles(context, styles)

  const currentPoint: CurrentPoint = { x: 0, y: 0, x1: 0, y1: 0, x2: 0, y2: 0 }
  context.beginPath()

  if (d !== undefined) {
    if (transform !== undefined) {
      context.transform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty)
    }

    const pathSegments = parsePathData(d)
    pathSegments.forEach(segment => {
      const { method, args } = segment
      if (validMethods.includes(method)) {
        drawBezierElement(context, currentPoint, method, args)
      }
    })
  }

  if (styles.fill) context.fill()
  if (styles.stroke) context.stroke()
  context.restore()
}

function updateCurrentPoint (currentPoint: CurrentPoint, x: number, y: number): void {
  currentPoint.x = x
  currentPoint.y = y
}

function updateCurrentPointRelative (currentPoint: CurrentPoint, dx: number, dy: number): void {
  currentPoint.x += dx
  currentPoint.y += dy
}

function updateBezierPoint (currentPoint: CurrentPoint, x1: number, y1: number, x2: number, y2: number, x: number, y: number, isRelative: boolean): void {
  if (isRelative) {
    currentPoint.x1 = currentPoint.x + x1
    currentPoint.y1 = currentPoint.y + y1
    currentPoint.x2 = currentPoint.x + x2
    currentPoint.y2 = currentPoint.y + y2
    currentPoint.x += x
    currentPoint.y += y
  } else {
    currentPoint.x1 = x1
    currentPoint.y1 = y1
    currentPoint.x2 = x2
    currentPoint.y2 = y2
    currentPoint.x = x
    currentPoint.y = y
  }
}

function drawBezierElement (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  currentPoint: CurrentPoint,
  method: string,
  args: string[]
): void {
  const [arg0, arg1, arg2, arg3, arg4, arg5] = args.map(Number)

  switch (method) {
    case 'M':
      updateCurrentPoint(currentPoint, arg0, arg1)
      context.moveTo(currentPoint.x, currentPoint.y)
      break
    case 'm':
      updateCurrentPointRelative(currentPoint, arg0, arg1)
      context.moveTo(currentPoint.x, currentPoint.y)
      break
    case 'L':
      updateCurrentPoint(currentPoint, arg0, arg1)
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'l':
      updateCurrentPointRelative(currentPoint, arg0, arg1)
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'H':
      updateCurrentPoint(currentPoint, arg0, currentPoint.y)
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'h':
      updateCurrentPointRelative(currentPoint, arg0, 0)
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'V':
      updateCurrentPoint(currentPoint, currentPoint.x, arg0)
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'v':
      updateCurrentPointRelative(currentPoint, 0, arg0)
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'C':
      updateBezierPoint(currentPoint, arg0, arg1, arg2, arg3, arg4, arg5, false)
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 'c':
      updateBezierPoint(currentPoint, arg0, arg1, arg2, arg3, arg4, arg5, true)
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 'S':
      updateSmoothBezierPoint(currentPoint, arg0, arg1, arg2, arg3, false)
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 's':
      updateSmoothBezierPoint(currentPoint, arg0, arg1, arg2, arg3, true)
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 'Q':
      updateQuadraticPoint(currentPoint, arg0, arg1, arg2, arg3, false)
      context.quadraticCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x, currentPoint.y)
      break
    case 'q':
      updateQuadraticPoint(currentPoint, arg0, arg1, arg2, arg3, true)
      context.quadraticCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x, currentPoint.y)
      break
    case 'Z':
    case 'z':
      context.closePath()
      break
  }
}

function updateSmoothBezierPoint (currentPoint: CurrentPoint, x2: number, y2: number, x: number, y: number, isRelative: boolean): void {
  currentPoint.x1 = currentPoint.x - currentPoint.x2 + currentPoint.x
  currentPoint.y1 = currentPoint.y - currentPoint.y2 + currentPoint.y

  if (isRelative) {
    updateCurrentPointRelative(currentPoint, x, y)
    currentPoint.x2 = currentPoint.x + x2
    currentPoint.y2 = currentPoint.y + y2
  } else {
    updateCurrentPoint(currentPoint, x, y)
    currentPoint.x2 = x2
    currentPoint.y2 = y2
  }
}

function updateQuadraticPoint (currentPoint: CurrentPoint, x1: number, y1: number, x: number, y: number, isRelative: boolean): void {
  if (isRelative) {
    currentPoint.x1 = currentPoint.x + x1
    currentPoint.y1 = currentPoint.y + y1
    updateCurrentPointRelative(currentPoint, x, y)
  } else {
    currentPoint.x1 = x1
    currentPoint.y1 = y1
    updateCurrentPoint(currentPoint, x, y)
  }
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
  context.save()
  resetShapeStyles(context, styles)

  if (transform !== undefined) {
    context.transform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty)
  }

  const width = radiusX * 2
  const height = radiusY * 2
  const xPos = x - radiusX
  const yPos = y - radiusY
  const kappa = 0.5522848
  const ox = (width / 2) * kappa
  const oy = (height / 2) * kappa
  const xe = xPos + width
  const ye = yPos + height
  const xm = xPos + width / 2
  const ym = yPos + height / 2

  context.beginPath()
  context.moveTo(xPos, ym)
  context.bezierCurveTo(xPos, ym - oy, xm - ox, yPos, xm, yPos)
  context.bezierCurveTo(xm + ox, yPos, xe, ym - oy, xe, ym)
  context.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye)
  context.bezierCurveTo(xm - ox, ye, xPos, ym + oy, xPos, ym)

  if (styles.fill) context.fill()
  if (styles.stroke) context.stroke()
  context.restore()
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
  context.save()
  resetShapeStyles(context, styles)

  if (transform !== undefined) {
    context.transform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty)
  }

  const radius = Math.min(cornerRadius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()

  if (styles.fill) context.fill()
  if (styles.stroke) context.stroke()
  context.restore()
}

export default render
