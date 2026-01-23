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

  if (frame.alpha < 0.05) return

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

  if (styles.strokeWidth) context.lineWidth = styles.strokeWidth
  if (styles.miterLimit) context.miterLimit = styles.miterLimit
  if (styles.lineCap) context.lineCap = styles.lineCap
  if (styles.lineJoin) context.lineJoin = styles.lineJoin
  if (styles.lineDash) context.setLineDash(styles.lineDash)
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

    const pathData = d.replace(/([a-zA-Z])/g, '|||$1 ').replace(/,/g, ' ')
    pathData.split('|||').forEach(segment => {
      if (segment.length === 0) return
      const firstLetter = segment.charAt(0)
      if (validMethods.includes(firstLetter)) {
        const args = segment.slice(1).trim().split(' ')
        drawBezierElement(context, currentPoint, firstLetter, args)
      }
    })
  }

  if (styles.fill) context.fill()
  if (styles.stroke) context.stroke()
  context.restore()
}

function drawBezierElement (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  currentPoint: CurrentPoint,
  method: string,
  args: string[]
): void {
  switch (method) {
    case 'M':
      currentPoint.x = Number(args[0])
      currentPoint.y = Number(args[1])
      context.moveTo(currentPoint.x, currentPoint.y)
      break
    case 'm':
      currentPoint.x += Number(args[0])
      currentPoint.y += Number(args[1])
      context.moveTo(currentPoint.x, currentPoint.y)
      break
    case 'L':
      currentPoint.x = Number(args[0])
      currentPoint.y = Number(args[1])
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'l':
      currentPoint.x += Number(args[0])
      currentPoint.y += Number(args[1])
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'H':
      currentPoint.x = Number(args[0])
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'h':
      currentPoint.x += Number(args[0])
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'V':
      currentPoint.y = Number(args[0])
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'v':
      currentPoint.y += Number(args[0])
      context.lineTo(currentPoint.x, currentPoint.y)
      break
    case 'C':
      currentPoint.x1 = Number(args[0])
      currentPoint.y1 = Number(args[1])
      currentPoint.x2 = Number(args[2])
      currentPoint.y2 = Number(args[3])
      currentPoint.x = Number(args[4])
      currentPoint.y = Number(args[5])
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 'c':
      currentPoint.x1 = currentPoint.x + Number(args[0])
      currentPoint.y1 = currentPoint.y + Number(args[1])
      currentPoint.x2 = currentPoint.x + Number(args[2])
      currentPoint.y2 = currentPoint.y + Number(args[3])
      currentPoint.x += Number(args[4])
      currentPoint.y += Number(args[5])
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 'S':
      currentPoint.x1 = currentPoint.x - currentPoint.x2 + currentPoint.x
      currentPoint.y1 = currentPoint.y - currentPoint.y2 + currentPoint.y
      currentPoint.x2 = Number(args[0])
      currentPoint.y2 = Number(args[1])
      currentPoint.x = Number(args[2])
      currentPoint.y = Number(args[3])
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 's':
      currentPoint.x1 = currentPoint.x - currentPoint.x2 + currentPoint.x
      currentPoint.y1 = currentPoint.y - currentPoint.y2 + currentPoint.y
      currentPoint.x2 = currentPoint.x + Number(args[0])
      currentPoint.y2 = currentPoint.y + Number(args[1])
      currentPoint.x += Number(args[2])
      currentPoint.y += Number(args[3])
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 'Q':
      currentPoint.x1 = Number(args[0])
      currentPoint.y1 = Number(args[1])
      currentPoint.x = Number(args[2])
      currentPoint.y = Number(args[3])
      context.quadraticCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x, currentPoint.y)
      break
    case 'q':
      currentPoint.x1 = currentPoint.x + Number(args[0])
      currentPoint.y1 = currentPoint.y + Number(args[1])
      currentPoint.x += Number(args[2])
      currentPoint.y += Number(args[3])
      context.quadraticCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x, currentPoint.y)
      break
    case 'Z':
    case 'z':
      context.closePath()
      break
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
