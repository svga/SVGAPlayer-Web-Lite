import Player from '../player/index'
import BezierPath from '../common/bezier-path'
import EllipsePath from '../common/ellipse-path'
import RectPath from '../common/rect-path'

const validMethods = 'MLHVCSQRZmlhvcsqrz'

export default class Renderer {
    private _player: Player
    private _canvasContext: CanvasRenderingContext2D
    private _bitmapCache: {[key: string]: HTMLImageElement} = {}
    private _dynamicElements: {[key: string]: any} = {}

    constructor (player: Player) {
      this._player = player
      this._canvasContext = <CanvasRenderingContext2D> this._player.container.getContext('2d')
    }

    public prepare () {
      return new Promise((resolve, reject) => {
        this._bitmapCache = {}

        if (!this._player.videoItem.images || Object.keys(this._player.videoItem.images).length == 0) {
          resolve()

          return void 0
        }

        this._dynamicElements = this._player.videoItem.dynamicElements

        let totalCount = 0
        let loadedCount = 0

        for (let imageKey in this._player.videoItem.images) {
          const src = this._player.videoItem.images[imageKey]

          if (typeof src === 'string' && (src.indexOf('iVBO') ===0|| src.indexOf('/9j/2w') === 0)) {
            totalCount++

            const img = document.createElement('img')

            img.src = 'data:image/png;base64,' + src

            this._bitmapCache[imageKey] = img

            img.onload = () => {
              loadedCount++
              loadedCount === totalCount && resolve()
            }
          } else {
            this._bitmapCache[imageKey] = src
          }
        }
      })
    }

    public clear () {
      this._canvasContext.clearRect(0, 0, this._player.container.width, this._player.container.height)
    }

    public drawFrame (frame: number) {
      this.clear()

      const context = this._canvasContext

      this._player.videoItem.sprites.forEach((sprite: any) => {
        let frameItem = sprite.frames[this._player.currentFrame]

        if (frameItem.alpha < 0.05) {
          return void 0
        }

        context.save()

        context.globalAlpha = frameItem.alpha
        context.transform(frameItem.transform.a, frameItem.transform.b, frameItem.transform.c, frameItem.transform.d, frameItem.transform.tx, frameItem.transform.ty)

        const img = this._bitmapCache[sprite.imageKey]

        if (img) {
          if (frameItem.maskPath !== undefined && frameItem.maskPath !== null) {
            frameItem.maskPath._styles = undefined
            this.drawBezier(frameItem.maskPath)
            context.clip()
          }

          context.drawImage(img, 0, 0)
        }

        const dynamicElements = this._dynamicElements[sprite.imageKey]

        if (dynamicElements) {
          context.drawImage(dynamicElements, (frameItem.layout.width - dynamicElements.width) / 2, (frameItem.layout.height - dynamicElements.height) / 2)
        }

        frameItem.shapes && frameItem.shapes.forEach((shape: any) => {
          if (shape.type === 'shape' && shape.pathArgs && shape.pathArgs.d) {
            this.drawBezier(new BezierPath(shape.pathArgs.d, shape.transform, shape.styles))
          } else if (shape.type === 'ellipse' && shape.pathArgs) {
            this._drawEllipse(new EllipsePath(parseFloat(shape.pathArgs.x) || 0.0, parseFloat(shape.pathArgs.y) || 0.0, parseFloat(shape.pathArgs.radiusX) || 0.0, parseFloat(shape.pathArgs.radiusY) || 0.0, shape.transform, shape.styles))
          } else if (shape.type === 'rect' && shape.pathArgs) {
            this._drawRect(new RectPath(parseFloat(shape.pathArgs.x) || 0.0, parseFloat(shape.pathArgs.y) || 0.0, parseFloat(shape.pathArgs.width) || 0.0, parseFloat(shape.pathArgs.height) || 0.0, parseFloat(shape.pathArgs.cornerRadius) || 0.0, shape.transform, shape.styles))
          }
        })

        context.restore()
      })
    }

    private _resetShapeStyles (obj: any) {
      const context = this._canvasContext

      const styles = obj._styles

      if (styles === undefined) {
        return void 0
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

    private drawBezier (obj: any) {
      const context = this._canvasContext

      context.save()

      this._resetShapeStyles(obj)

      if (obj._transform !== undefined && obj._transform !== null) {
        context.transform(obj._transform.a, obj._transform.b, obj._transform.c, obj._transform.d, obj._transform.tx, obj._transform.ty)
      }

      let currentPoint = { x: 0, y: 0, x1: 0, y1: 0, x2: 0, y2: 0 }

      context.beginPath()

      const d = obj._d.replace(/([a-zA-Z])/g, '|||$1 ').replace(/,/g, ' ')

      d.split('|||').forEach((segment: any) => {
        if (segment.length == 0) { return void 0 }

        const firstLetter = segment.substr(0, 1)

        if (validMethods.indexOf(firstLetter) >= 0) {
          const args = segment.substr(1).trim().split(' ')

          this._drawBezierElement(currentPoint, firstLetter, args)
        }
      })

      if (obj._styles && obj._styles.fill) {
        context.fill()
      } else if (obj._styles && obj._styles.stroke) {
        context.stroke()
      }

      context.restore()
    }

    private _drawBezierElement (currentPoint: any, method: any, args: any) {
      const context = this._canvasContext

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

    private _drawEllipse (obj: any) {
      const context = this._canvasContext

      context.save()

      this._resetShapeStyles(obj)

      if (obj._transform !== undefined && obj._transform !== null) {
        context.transform(obj._transform.a, obj._transform.b, obj._transform.c, obj._transform.d, obj._transform.tx, obj._transform.ty)
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

    private _drawRect (obj: any) {
      const context = this._canvasContext

      context.save()

      this._resetShapeStyles(obj)

      if (obj._transform !== undefined && obj._transform !== null) {
        context.transform(obj._transform.a, obj._transform.b, obj._transform.c, obj._transform.d, obj._transform.tx, obj._transform.ty)
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
}
