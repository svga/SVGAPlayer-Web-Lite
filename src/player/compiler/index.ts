import {
  SHAPE_TYPE,
  Video,
  VideoFrameShape,
  VideoStyles
} from '../../types'
import { parsePath } from './path'
import {
  CompiledAnimation,
  CompiledGeometry,
  createEmptyRenderCapabilities,
  FrameRenderCommand,
  PathCommand,
  RenderCompileDiagnostics,
  RenderCapabilities,
  ShapeRenderCommand
} from './types'

function geometryKeyForShape (shape: VideoFrameShape): string {
  return `${shape.type}:${JSON.stringify(shape.path)}`
}

function geometryKeyForMask (d: string): string {
  return `mask:${d}`
}

function hasStrokeDetails (styles: VideoStyles): boolean {
  return styles.strokeWidth !== null ||
    styles.lineCap !== null ||
    styles.lineJoin !== null ||
    styles.miterLimit !== null
}

function hasStroke (styles: VideoStyles): boolean {
  return styles.stroke !== null ||
    hasStrokeDetails(styles) ||
    (styles.lineDash !== null && styles.lineDash.length > 0)
}

export class RenderCompiler {
  private geometryIndex = 0
  private readonly geometryKeyToId: { [key: string]: string } = {}
  private readonly geometries: { [id: string]: CompiledGeometry } = {}
  private readonly requiredCapabilities: RenderCapabilities = createEmptyRenderCapabilities()
  private readonly diagnostics: RenderCompileDiagnostics = {
    unsupportedPathCommands: []
  }

  public compile (video: Video): CompiledAnimation {
    const frames: FrameRenderCommand[][] = []

    for (let frameIndex = 0; frameIndex < video.frames; frameIndex++) {
      const frameCommands: FrameRenderCommand[] = []

      video.sprites.forEach(sprite => {
        const frame = sprite.frames[frameIndex]
        if (frame === undefined || frame.alpha < 0.05) return

        const shapes = frame.shapes.map(shape => this.compileShape(shape))
        const hasBitmap = video.images[sprite.imageKey] !== undefined
        const hasReplaceElement = video.replaceElements[sprite.imageKey] !== undefined
        const hasDynamicElement = video.dynamicElements[sprite.imageKey] !== undefined

        if (hasBitmap || hasReplaceElement) {
          this.requiredCapabilities.texture.static = true
        }
        if (hasDynamicElement) {
          this.requiredCapabilities.texture.dynamic = true
        }

        frameCommands.push({
          type: 'sprite',
          imageKey: sprite.imageKey,
          alpha: frame.alpha,
          transform: frame.transform ?? undefined,
          layout: frame.layout,
          mask: frame.maskPath === null
            ? null
            : {
                geometryId: this.geometryIdForMask(frame.maskPath.d),
                transform: frame.maskPath.transform,
                styles: frame.maskPath.styles
              },
          shapes
        })

        if (frame.maskPath !== null) {
          this.requiredCapabilities.masks = true
        }
      })

      frames.push(frameCommands)
    }

    return {
      source: video,
      size: video.size,
      fps: video.fps,
      totalFrames: video.frames,
      frames,
      resources: {
        images: video.images,
        replaceElements: video.replaceElements,
        dynamicElements: video.dynamicElements
      },
      geometries: this.geometries,
      requiredCapabilities: this.requiredCapabilities,
      diagnostics: this.diagnostics,
      backendType: null
    }
  }

  private compileShape (shape: VideoFrameShape): ShapeRenderCommand {
    const styles = shape.styles

    this.markShapeCapabilities(shape)
    this.markStrokeStyleCapabilities(styles)

    return {
      type: 'shape',
      geometryId: this.geometryIdForShape(shape),
      transform: shape.transform,
      styles
    }
  }

  private geometryIdForShape (shape: VideoFrameShape): string {
    const key = geometryKeyForShape(shape)
    const existingId = this.geometryKeyToId[key]
    if (existingId !== undefined) return existingId

    const id = this.nextGeometryId()
    this.geometryKeyToId[key] = id

    if (shape.type === SHAPE_TYPE.SHAPE) {
      const parsedPath = parsePath(shape.path.d)
      this.geometries[id] = {
        id,
        type: 'path',
        commands: parsedPath.commands,
        contourCount: parsedPath.contourCount,
        hasHoles: parsedPath.hasHoles,
        hasUnsupportedCommands: parsedPath.hasUnsupportedCommands
      }
      if (parsedPath.hasUnsupportedCommands) {
        this.recordUnsupportedPathCommands('shape', id, parsedPath.commands, shape.path.d)
      }
    } else if (shape.type === SHAPE_TYPE.ELLIPSE) {
      this.geometries[id] = {
        id,
        type: 'ellipse',
        x: shape.path.x ?? 0.0,
        y: shape.path.y ?? 0.0,
        radiusX: shape.path.radiusX ?? 0.0,
        radiusY: shape.path.radiusY ?? 0.0
      }
    } else {
      this.geometries[id] = {
        id,
        type: 'rect',
        x: shape.path.x ?? 0.0,
        y: shape.path.y ?? 0.0,
        width: shape.path.width ?? 0.0,
        height: shape.path.height ?? 0.0,
        cornerRadius: shape.path.cornerRadius ?? 0.0
      }
    }

    return id
  }

  private geometryIdForMask (d: string): string {
    const key = geometryKeyForMask(d)
    const existingId = this.geometryKeyToId[key]
    if (existingId !== undefined) return existingId

    const id = this.nextGeometryId()
    const parsedPath = parsePath(d)
    this.geometryKeyToId[key] = id
    this.geometries[id] = {
      id,
      type: 'path',
      commands: parsedPath.commands,
      contourCount: parsedPath.contourCount,
      hasHoles: parsedPath.hasHoles,
      hasUnsupportedCommands: parsedPath.hasUnsupportedCommands
    }

    if (parsedPath.hasUnsupportedCommands) {
      this.recordUnsupportedPathCommands('mask', id, parsedPath.commands, d)
    }

    return id
  }

  private markShapeCapabilities (shape: VideoFrameShape): void {
    const styles = shape.styles
    if (shape.type === SHAPE_TYPE.ELLIPSE) {
      if (styles.fill !== null) this.requiredCapabilities.shape.ellipse.fill = true
      if (hasStroke(styles)) this.requiredCapabilities.shape.ellipse.stroke = true
      return
    }

    if (shape.type === SHAPE_TYPE.SHAPE) {
      if (styles.fill !== null) this.requiredCapabilities.shape.path.fill = true
      if (hasStroke(styles)) this.requiredCapabilities.shape.path.stroke = true
      return
    }

    const rectCapabilities = (shape.path.cornerRadius ?? 0) > 0
      ? this.requiredCapabilities.shape.roundedRect
      : this.requiredCapabilities.shape.rect
    if (styles.fill !== null) rectCapabilities.fill = true
    if (hasStroke(styles)) rectCapabilities.stroke = true
  }

  private markStrokeStyleCapabilities (styles: VideoStyles): void {
    if (styles.strokeWidth !== null) this.requiredCapabilities.shape.strokeStyle.width = true
    if (styles.lineCap !== null) this.requiredCapabilities.shape.strokeStyle.lineCap = true
    if (styles.lineJoin !== null) this.requiredCapabilities.shape.strokeStyle.lineJoin = true
    if (styles.miterLimit !== null) this.requiredCapabilities.shape.strokeStyle.miterLimit = true
    if (styles.lineDash !== null && styles.lineDash.length > 0) {
      this.requiredCapabilities.shape.strokeStyle.lineDash = true
    }
  }

  private recordUnsupportedPathCommands (
    owner: 'shape' | 'mask',
    geometryId: string,
    commands: PathCommand[],
    rawPath: string | undefined
  ): void {
    commands.forEach(command => {
      if (command.type !== 'unsupported') return
      this.diagnostics.unsupportedPathCommands.push({
        owner,
        geometryId,
        method: command.method,
        rawPath
      })
    })
  }

  private nextGeometryId (): string {
    this.geometryIndex += 1
    return `g${this.geometryIndex}`
  }
}

export * from './types'
