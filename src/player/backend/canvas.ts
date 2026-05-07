import {
  Bitmap,
  BitmapsCache,
  DynamicElement,
  ReplaceElement,
  Transform,
  VideoStyles
} from '../../types'
import {
  CompiledAnimation,
  CompiledGeometry,
  FrameRenderCommand,
  PathCommand,
  RenderCapabilities,
  ShapeRenderCommand
} from '../compiler/types'
import { RenderBackend } from './types'

function canvasCapabilities (): RenderCapabilities {
  return {
    imageRendering: true,
    dynamicTextures: true,
    shapeFill: true,
    shapeFillHoles: true,
    shapeStroke: true,
    lineDash: true,
    masks: true,
    snapshot: true,
    unsupportedPathCommands: true
  }
}

function applyTransform (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  transform: Transform | undefined
): void {
  if (transform === undefined) return
  context.transform(
    transform.a,
    transform.b,
    transform.c,
    transform.d,
    transform.tx,
    transform.ty
  )
}

function resetShapeStyles (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  styles: VideoStyles | undefined
): void {
  if (styles === undefined) return

  context.strokeStyle = styles.stroke ?? 'transparent'
  if (styles.strokeWidth !== null && styles.strokeWidth > 0) context.lineWidth = styles.strokeWidth
  if (styles.miterLimit !== null && styles.miterLimit > 0) context.miterLimit = styles.miterLimit
  if (styles.lineCap !== null) context.lineCap = styles.lineCap
  if (styles.lineJoin !== null) context.lineJoin = styles.lineJoin
  context.fillStyle = styles.fill ?? 'transparent'
  context.setLineDash(styles.lineDash ?? [])
}

function applyPathCommand (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  command: PathCommand
): void {
  switch (command.type) {
    case 'moveTo':
      context.moveTo(command.x, command.y)
      break
    case 'lineTo':
      context.lineTo(command.x, command.y)
      break
    case 'bezierCurveTo':
      context.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y)
      break
    case 'quadraticCurveTo':
      context.quadraticCurveTo(command.x1, command.y1, command.x, command.y)
      break
    case 'closePath':
      context.closePath()
      break
  }
}

function beginGeometryPath (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  geometry: CompiledGeometry
): void {
  context.beginPath()

  if (geometry.type === 'path') {
    geometry.commands.forEach(command => applyPathCommand(context, command))
    return
  }

  if (geometry.type === 'ellipse') {
    const x = geometry.x - geometry.radiusX
    const y = geometry.y - geometry.radiusY
    const w = geometry.radiusX * 2
    const h = geometry.radiusY * 2
    const kappa = 0.5522848
    const ox = (w / 2) * kappa
    const oy = (h / 2) * kappa
    const xe = x + w
    const ye = y + h
    const xm = x + w / 2
    const ym = y + h / 2

    context.moveTo(x, ym)
    context.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y)
    context.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym)
    context.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye)
    context.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym)
    return
  }

  let radius = geometry.cornerRadius
  if (geometry.width < 2 * radius) radius = geometry.width / 2
  if (geometry.height < 2 * radius) radius = geometry.height / 2
  context.moveTo(geometry.x + radius, geometry.y)
  context.arcTo(geometry.x + geometry.width, geometry.y, geometry.x + geometry.width, geometry.y + geometry.height, radius)
  context.arcTo(geometry.x + geometry.width, geometry.y + geometry.height, geometry.x, geometry.y + geometry.height, radius)
  context.arcTo(geometry.x, geometry.y + geometry.height, geometry.x, geometry.y, radius)
  context.arcTo(geometry.x, geometry.y, geometry.x + geometry.width, geometry.y, radius)
  context.closePath()
}

async function loadBitmap (image: string | Bitmap): Promise<Bitmap> {
  if (typeof image !== 'string') {
    return image
  }

  return await awaitImage(`data:image/png;base64,${image}`)
}

async function awaitImage (src: string): Promise<HTMLImageElement> {
  return await new Promise(resolve => {
    const img = document.createElement('img')
    img.src = src
    img.onload = () => resolve(img)
  })
}

export class CanvasBackend implements RenderBackend {
  public readonly type = 'canvas' as const
  public readonly capabilities = canvasCapabilities()

  private readonly canvas: HTMLCanvasElement
  private readonly ofsCanvas: HTMLCanvasElement | OffscreenCanvas
  private readonly isCacheFrames: boolean
  private bitmapsCache: BitmapsCache = {}
  private cacheFrames: { [key: string]: HTMLImageElement | ImageBitmap } = {}

  constructor (canvas: HTMLCanvasElement, isCacheFrames: boolean = false) {
    this.canvas = canvas
    this.isCacheFrames = isCacheFrames
    this.ofsCanvas = window.OffscreenCanvas !== undefined
      ? new window.OffscreenCanvas(canvas.width, canvas.height)
      : document.createElement('canvas')
  }

  public async prepare (animation: CompiledAnimation): Promise<void> {
    const images = animation.resources.images
    const loaders: Array<Promise<void>> = []

    Object.keys(images).forEach(key => {
      loaders.push(
        loadBitmap(images[key]).then(bitmap => {
          this.bitmapsCache[key] = bitmap
        })
      )
    })

    await Promise.all(loaders)
  }

  public resize (width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
  }

  public renderFrame (animation: CompiledAnimation, frame: number): void {
    this.clear()

    const context = this.canvas.getContext('2d')
    if (context === null) throw new Error('Canvas Context cannot be null')

    const cachedFrame = this.cacheFrames[frame]
    if (this.isCacheFrames && cachedFrame !== undefined) {
      context.drawImage(cachedFrame, 0, 0, cachedFrame.width, cachedFrame.height, 0, 0, cachedFrame.width, cachedFrame.height)
      return
    }

    const ofsCanvas = this.getFrameCanvas()
    ofsCanvas.width = this.canvas.width
    ofsCanvas.height = this.canvas.height

    const ofsContext = ofsCanvas.getContext('2d')
    if (ofsContext === null || !('save' in ofsContext)) throw new Error('Render Context cannot be null')

    animation.frames[frame]?.forEach(command => this.drawCommand(ofsContext, animation, command))

    context.drawImage(
      ofsCanvas,
      0, 0, ofsCanvas.width, ofsCanvas.height,
      0, 0, ofsCanvas.width, ofsCanvas.height
    )

    if (this.isCacheFrames) {
      if ('toDataURL' in ofsCanvas) {
        const ofsImage = new Image()
        ofsImage.src = ofsCanvas.toDataURL()
        this.cacheFrames[frame] = ofsImage
      } else {
        this.cacheFrames[frame] = ofsCanvas.transferToImageBitmap()
      }
    }
  }

  public clear (): void {
    const width = this.canvas.width
    this.canvas.width = width
  }

  public snapshot (): HTMLCanvasElement {
    return this.canvas
  }

  public destroy (): void {
    this.clear()
    this.bitmapsCache = {}
    this.cacheFrames = {}
  }

  private getFrameCanvas (): HTMLCanvasElement | OffscreenCanvas {
    if (window.OffscreenCanvas !== undefined && window.navigator.userAgent.includes('Firefox')) {
      return new window.OffscreenCanvas(this.canvas.width, this.canvas.height)
    }
    return this.ofsCanvas
  }

  private drawCommand (
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    animation: CompiledAnimation,
    command: FrameRenderCommand
  ): void {
    const replaceElement = animation.resources.replaceElements[command.imageKey]
    const dynamicElement = animation.resources.dynamicElements[command.imageKey]
    const bitmap = this.bitmapsCache[command.imageKey]

    context.save()
    context.globalAlpha = command.alpha
    applyTransform(context, command.transform)

    if (bitmap !== undefined || replaceElement !== undefined) {
      if (command.mask !== null) {
        const geometry = animation.geometries[command.mask.geometryId]
        context.save()
        applyTransform(context, command.mask.transform)
        beginGeometryPath(context, geometry)
        context.restore()
        context.clip()
      }
      this.drawImage(context, command, bitmap, replaceElement)
    }

    if (dynamicElement !== undefined) {
      this.drawDynamicElement(context, command, dynamicElement)
    }

    command.shapes.forEach(shape => this.drawShape(context, animation, shape))
    context.restore()
  }

  private drawImage (
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    command: FrameRenderCommand,
    bitmap: Bitmap | ImageBitmap | undefined,
    replaceElement: ReplaceElement | undefined
  ): void {
    const drawable = replaceElement ?? bitmap
    if (drawable === undefined) return
    context.drawImage(drawable, 0, 0, command.layout.width, command.layout.height)
  }

  private drawDynamicElement (
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    command: FrameRenderCommand,
    dynamicElement: DynamicElement
  ): void {
    context.drawImage(
      dynamicElement,
      (command.layout.width - dynamicElement.width) / 2,
      (command.layout.height - dynamicElement.height) / 2
    )
  }

  private drawShape (
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    animation: CompiledAnimation,
    shape: ShapeRenderCommand
  ): void {
    const geometry = animation.geometries[shape.geometryId]

    context.save()
    resetShapeStyles(context, shape.styles)
    applyTransform(context, shape.transform)
    beginGeometryPath(context, geometry)
    if (shape.styles.fill !== null) context.fill()
    if (shape.styles.stroke !== null) context.stroke()
    context.restore()
  }
}
