import {
  SHAPE_TYPE,
  Video,
  VideoFrameShape,
  VideoStyles
} from '../../types'
import { createBackend } from '../backend'
import { parsePath } from './path'
import {
  CompiledAnimation,
  CompiledGeometry,
  FrameRenderCommand,
  RenderCapabilities,
  RenderCompileOptions,
  RenderCompilerResult,
  ShapeRenderCommand
} from './types'

function emptyCapabilities (): RenderCapabilities {
  return {
    imageRendering: false,
    dynamicTextures: false,
    shapeFill: false,
    shapeFillHoles: false,
    shapeStroke: false,
    lineDash: false,
    masks: false,
    snapshot: false,
    unsupportedPathCommands: false
  }
}

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

export class RenderCompiler {
  private geometryIndex = 0
  private readonly geometryKeyToId: { [key: string]: string } = {}
  private readonly geometries: { [id: string]: CompiledGeometry } = {}
  private readonly requiredCapabilities: RenderCapabilities = emptyCapabilities()

  public async compile (
    video: Video,
    container: HTMLCanvasElement,
    options: RenderCompileOptions = {}
  ): Promise<RenderCompilerResult> {
    const animation = this.compileAnimation(video)
    const backend = createBackend(container, animation, options.renderMode ?? 'auto', options.isCacheFrames ?? false)

    animation.backendType = backend.type
    backend.resize(animation.size.width, animation.size.height)
    await backend.prepare(animation)

    return { animation, backend }
  }

  private compileAnimation (video: Video): CompiledAnimation {
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
          this.requiredCapabilities.imageRendering = true
        }
        if (hasDynamicElement || hasReplaceElement) {
          this.requiredCapabilities.dynamicTextures = true
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
      backendType: null
    }
  }

  private compileShape (shape: VideoFrameShape): ShapeRenderCommand {
    const styles = shape.styles

    if (styles.fill !== null) {
      this.requiredCapabilities.shapeFill = true
    }
    if (styles.stroke !== null || hasStrokeDetails(styles)) {
      this.requiredCapabilities.shapeStroke = true
    }
    if (styles.lineDash !== null && styles.lineDash.length > 0) {
      this.requiredCapabilities.lineDash = true
    }

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
      if (parsedPath.hasHoles) {
        this.requiredCapabilities.shapeFillHoles = true
      }
      if (parsedPath.hasUnsupportedCommands) {
        this.requiredCapabilities.unsupportedPathCommands = true
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

    if (parsedPath.hasHoles) {
      this.requiredCapabilities.shapeFillHoles = true
    }
    if (parsedPath.hasUnsupportedCommands) {
      this.requiredCapabilities.unsupportedPathCommands = true
    }

    return id
  }

  private nextGeometryId (): string {
    this.geometryIndex += 1
    return `g${this.geometryIndex}`
  }
}

export * from './types'
