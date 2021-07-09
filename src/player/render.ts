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

  context.save()
  context.globalAlpha = frame.alpha

  context.transform(
    frame.transform?.a ?? 1,
    frame.transform?.b ?? 0,
    frame.transform?.c ?? 0,
    frame.transform?.d ?? 1,
    frame.transform?.tx ?? 0,
    frame.transform?.ty ?? 0
  )

  if (bitmap !== undefined) {
    if (replaceElement !== undefined) {
      context.drawImage(replaceElement, 0, 0, bitmap.width, bitmap.height)
    } else {
      context.drawImage(bitmap, 0, 0)
    }
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
        shape.path.x ?? 0.0,
        shape.path.y ?? 0.0,
        shape.path.radiusX ?? 0.0,
        shape.path.radiusY ?? 0.0,
        shape.transform,
        shape.styles
      )
      break
    case SHAPE_TYPE.RECT:
      drawRect(
        context,
        shape.path.x ?? 0.0,
        shape.path.y ?? 0.0,
        shape.path.width ?? 0.0,
        shape.path.height ?? 0.0,
        shape.path.cornerRadius ?? 0.0,
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

  if (styles.stroke !== null) {
    context.strokeStyle = styles.stroke
  } else {
    context.strokeStyle = 'transparent'
  }

  if (styles.strokeWidth !== null && styles.strokeWidth > 0) context.lineWidth = styles.strokeWidth
  if (styles.miterLimit !== null && styles.miterLimit > 0) context.miterLimit = styles.miterLimit
  if (styles.lineCap !== null) context.lineCap = styles.lineCap
  if (styles.lineJoin !== null) context.lineJoin = styles.lineJoin

  if (styles.fill !== null) {
    context.fillStyle = styles.fill
  } else {
    context.fillStyle = 'transparent'
  }

  if (styles.lineDash !== null) context.setLineDash(styles.lineDash)
}

function drawBezier (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  d: string,
  transform: Transform | undefined,
  styles: VideoStyles
): void {
  context.save()
  resetShapeStyles(context, styles)
  if (transform !== undefined) {
    context.transform(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.tx,
      transform.ty
    )
  }
  const currentPoint: CurrentPoint = { x: 0, y: 0, x1: 0, y1: 0, x2: 0, y2: 0 }
  context.beginPath()
  d = d.replace(/([a-zA-Z])/g, '|||$1 ').replace(/,/g, ' ')
  d.split('|||').forEach(segment => {
    if (segment.length === 0) return
    const firstLetter = segment.substr(0, 1)
    if (validMethods.includes(firstLetter)) {
      const args = segment.substr(1).trim().split(' ')
      drawBezierElement(context, currentPoint, firstLetter, args)
    }
  })
  if (styles.fill !== null) {
    context.fill()
  } else if (styles.stroke !== null) {
    context.stroke()
  }
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
      if (currentPoint.x1 !== undefined && currentPoint.y1 !== undefined && currentPoint.x2 !== undefined && currentPoint.y2 !== undefined) {
        currentPoint.x1 = currentPoint.x - currentPoint.x2 + currentPoint.x
        currentPoint.y1 = currentPoint.y - currentPoint.y2 + currentPoint.y
        currentPoint.x2 = Number(args[0])
        currentPoint.y2 = Number(args[1])
        currentPoint.x = Number(args[2])
        currentPoint.y = Number(args[3])
        context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      } else {
        currentPoint.x1 = Number(args[0])
        currentPoint.y1 = Number(args[1])
        currentPoint.x = Number(args[2])
        currentPoint.y = Number(args[3])
        context.quadraticCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x, currentPoint.y)
      }
      break
    case 's':
      if (currentPoint.x1 !== undefined && currentPoint.y1 !== undefined && currentPoint.x2 !== undefined && currentPoint.y2 !== undefined) {
        currentPoint.x1 = currentPoint.x - currentPoint.x2 + currentPoint.x
        currentPoint.y1 = currentPoint.y - currentPoint.y2 + currentPoint.y
        currentPoint.x2 = currentPoint.x + Number(args[0])
        currentPoint.y2 = currentPoint.y + Number(args[1])
        currentPoint.x += Number(args[2])
        currentPoint.y += Number(args[3])
        context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      } else {
        currentPoint.x1 = currentPoint.x + Number(args[0])
        currentPoint.y1 = currentPoint.y + Number(args[1])
        currentPoint.x += Number(args[2])
        currentPoint.y += Number(args[3])
        context.quadraticCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x, currentPoint.y)
      }
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
    case 'A':
      break
    case 'a':
      break
    case 'Z':
    case 'z':
      context.closePath()
      break
    default:
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
    context.transform(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.tx,
      transform.ty
    )
  }
  x = x - radiusX
  y = y - radiusY
  const w = radiusX * 2
  const h = radiusY * 2
  const kappa = 0.5522848
  const ox = (w / 2) * kappa
  const oy = (h / 2) * kappa
  const xe = x + w
  const ye = y + h
  const xm = x + w / 2
  const ym = y + h / 2
  context.beginPath()
  context.moveTo(x, ym)
  context.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y)
  context.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym)
  context.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye)
  context.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym)
  if (styles.fill !== null) {
    context.fill()
  } else if (styles.stroke !== null) {
    context.stroke()
  }
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
    context.transform(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.tx,
      transform.ty
    )
  }
  let radius = cornerRadius
  if (width < 2 * radius) {
    radius = width / 2
  }
  if (height < 2 * radius) {
    radius = height / 2
  }
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
  if (styles.fill !== null) {
    context.fill()
  } else if (styles.stroke !== null) {
    context.stroke()
  }
  context.restore()
}

export default render
