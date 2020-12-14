import BezierPath from '../common/bezier-path'
import EllipsePath from '../common/ellipse-path'
import RectPath from '../common/rect-path'

const validMethods = 'MLHVCSQRZmlhvcsqrz'

function render (canvas, bitmapCache, dynamicElements, videoItem, currentFrame) {
  const context = canvas.getContext('2d')

  videoItem.sprites.forEach(sprite => {
    const frameItem = sprite.frames[currentFrame]

    if (frameItem.alpha < 0.05) {
      return
    }

    context.save()
    context.globalAlpha = frameItem.alpha
    context.transform(
      frameItem.transform.a || 1,
      frameItem.transform.b || 0,
      frameItem.transform.c || 0,
      frameItem.transform.d || 1,
      frameItem.transform.tx || 0,
      frameItem.transform.ty || 0
    )

    const img = bitmapCache[sprite.imageKey]
    if (img) {
      if (frameItem.maskPath !== undefined && frameItem.maskPath !== null) {
        frameItem.maskPath._styles = undefined
        drawBezier(context, frameItem.maskPath)
        context.clip()
      }
      context.drawImage(img, 0, 0)
    }

    const dynamicElement = dynamicElements[sprite.imageKey]
    if (dynamicElement) {
      const { source, fit } = 'fit' in dynamicElement ? dynamicElement : { source: dynamicElement, fit: 'none' }
      const sourceWidth = source.naturalWidth || source.videoWidth || source.width
      const sourceHeight = source.naturalHeight || source.videoHeight || source.height

      switch (fit) {
        case 'contain': {
          const wRatio = frameItem.layout.width / sourceWidth
          const hRatio = frameItem.layout.height / sourceHeight
          const ratio = Math.min(wRatio, hRatio)
          const width = ratio * sourceWidth
          const height = ratio * sourceHeight
          context.drawImage(source, (frameItem.layout.width - width) / 2, (frameItem.layout.height - height) / 2, width, height)
          break
        }
        case 'cover': {
          const wRatio = frameItem.layout.width / sourceWidth
          const hRatio = frameItem.layout.height / sourceHeight
          const ratio = Math.max(wRatio, hRatio)
          const width = ratio * sourceWidth
          const height = ratio * sourceHeight
          context.drawImage(source, (frameItem.layout.width - width) / 2, (frameItem.layout.height - height) / 2, width, height)
          break
        }
        case 'fill':
          context.drawImage(source, 0, 0, frameItem.layout.width, frameItem.layout.height)
          break
        case 'none':
        default:
          context.drawImage(source, (frameItem.layout.width - sourceWidth) / 2, (frameItem.layout.height - sourceHeight) / 2)
          break
      }
    }

    frameItem.shapes && frameItem.shapes.forEach(shape => {
      if (shape.type === 'shape' && shape.pathArgs && shape.pathArgs.d) {
        drawBezier(
          context,
          new BezierPath(
            shape.pathArgs.d,
            shape.transform,
            shape.styles
          )
        )
      } else if (shape.type === 'ellipse' && shape.pathArgs) {
        drawEllipse(
          context,
          new EllipsePath(
            parseFloat(shape.pathArgs.x) || 0.0,
            parseFloat(shape.pathArgs.y) || 0.0,
            parseFloat(shape.pathArgs.radiusX) || 0.0,
            parseFloat(shape.pathArgs.radiusY) || 0.0,
            shape.transform,
            shape.styles
          )
        )
      } else if (shape.type === 'rect' && shape.pathArgs) {
        drawRect(
          context,
          new RectPath(
            parseFloat(shape.pathArgs.x) || 0.0,
            parseFloat(shape.pathArgs.y) || 0.0,
            parseFloat(shape.pathArgs.width) || 0.0,
            parseFloat(shape.pathArgs.height) || 0.0,
            parseFloat(shape.pathArgs.cornerRadius) || 0.0,
            shape.transform, shape.styles
          )
        )
      }
    })
    context.restore()
  })

  return canvas
}

function resetShapeStyles (context, obj) {
  const styles = obj._styles

  if (styles === undefined) {
    return
  }

  if (styles && styles.stroke) {
    context.strokeStyle = `rgba(${parseInt((styles.stroke[0] * 255).toString())}, ${parseInt((styles.stroke[1] * 255).toString())}, ${parseInt((styles.stroke[2] * 255).toString())}, ${styles.stroke[3]})`
  } else {
    context.strokeStyle = 'transparent'
  }

  if (styles) {
    context.lineWidth = styles.strokeWidth || undefined
    context.lineCap = styles.lineCap || undefined
    context.lineJoin = styles.lineJoin || undefined
    context.miterLimit = styles.miterLimit || undefined
  }

  if (styles && styles.fill) {
    context.fillStyle = `rgba(${parseInt((styles.fill[0] * 255).toString())}, ${parseInt((styles.fill[1] * 255).toString())}, ${parseInt((styles.fill[2] * 255).toString())}, ${styles.fill[3]})`
  } else {
    context.fillStyle = 'transparent'
  }

  styles && styles.lineDash && context.setLineDash(styles.lineDash)
}

function drawBezier (context, obj) {
  context.save()

  resetShapeStyles(context, obj)

  if (obj._transform !== undefined && obj._transform !== null) {
    context.transform(
      obj._transform.a || 1.0,
      obj._transform.b || 0,
      obj._transform.c || 0,
      obj._transform.d || 1.0,
      obj._transform.tx || 0,
      obj._transform.ty || 0
    )
  }

  let currentPoint = { x: 0, y: 0, x1: 0, y1: 0, x2: 0, y2: 0 }

  context.beginPath()

  const d = obj._d.replace(/([a-zA-Z])/g, '|||$1 ').replace(/,/g, ' ')

  d.split('|||').forEach(segment => {
    if (segment.length == 0) return
    const firstLetter = segment.substr(0, 1)
    if (validMethods.indexOf(firstLetter) >= 0) {
      const args = segment.substr(1).trim().split(' ')
      drawBezierElement(context, currentPoint, firstLetter, args)
    }
  })

  if (obj._styles && obj._styles.fill) {
    context.fill()
  } else if (obj._styles && obj._styles.stroke) {
    context.stroke()
  }

  context.restore()
}

function drawBezierElement (context, currentPoint, method, args) {
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
      currentPoint.x = Number(args[ 4 ])
      currentPoint.y = Number(args[ 5 ])
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 'c':
      currentPoint.x1 = currentPoint.x + Number(args[0])
      currentPoint.y1 = currentPoint.y + Number(args[1])
      currentPoint.x2 = currentPoint.x + Number(args[2])
      currentPoint.y2 = currentPoint.y + Number(args[3])
      currentPoint.x += Number(args[ 4 ])
      currentPoint.y += Number(args[ 5 ])
      context.bezierCurveTo(currentPoint.x1, currentPoint.y1, currentPoint.x2, currentPoint.y2, currentPoint.x, currentPoint.y)
      break
    case 'S':
      if (currentPoint.x1 && currentPoint.y1 && currentPoint.x2 && currentPoint.y2) {
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
      if (currentPoint.x1 && currentPoint.y1 && currentPoint.x2 && currentPoint.y2) {
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

function drawEllipse (context, obj) {
  context.save()

  resetShapeStyles(context, obj)

  if (obj._transform !== undefined && obj._transform !== null) {
    context.transform(
      obj._transform.a || 1.0,
      obj._transform.b || 0,
      obj._transform.c || 0,
      obj._transform.d || 1.0,
      obj._transform.tx || 0,
      obj._transform.ty || 0
    )
  }

  let x = obj._x - obj._radiusX
  let y = obj._y - obj._radiusY
  let w = obj._radiusX * 2
  let h = obj._radiusY * 2

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

  if (obj._styles && obj._styles.fill) {
    context.fill()
  } else if (obj._styles && obj._styles.stroke) {
    context.stroke()
  }

  context.restore()
}

function drawRect (context, obj) {
  context.save()

  resetShapeStyles(context, obj)

  if (obj._transform !== undefined && obj._transform !== null) {
    context.transform(
      obj._transform.a || 1.0,
      obj._transform.b || 0,
      obj._transform.c || 0,
      obj._transform.d || 1.0,
      obj._transform.tx || 0,
      obj._transform.ty || 0
    )
  }

  let x = obj._x
  let y = obj._y
  let width = obj._width
  let height = obj._height
  let radius = obj._cornerRadius

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

  if (obj._styles && obj._styles.fill) {
    context.fill()
  } else if (obj._styles && obj._styles.stroke) {
    context.stroke()
  }

  context.restore()
}

export default render
