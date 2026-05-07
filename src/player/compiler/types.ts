import {
  Bitmap,
  DynamicElements,
  Rect,
  ReplaceElements,
  Transform,
  Video,
  VideoStyles
} from '../../types'

export type RenderMode = 'canvas' | 'webgl' | 'auto'

export type RenderBackendType = 'canvas' | 'webgl'

export interface ShapePaintCapabilities {
  fill: boolean
  stroke: boolean
}

export interface StrokeStyleCapabilities {
  width: boolean
  lineCap: boolean
  lineJoin: boolean
  miterLimit: boolean
  lineDash: boolean
}

export interface RenderCapabilities {
  texture: {
    static: boolean
    dynamic: boolean
  }
  shape: {
    rect: ShapePaintCapabilities
    roundedRect: ShapePaintCapabilities
    ellipse: ShapePaintCapabilities
    path: ShapePaintCapabilities
    strokeStyle: StrokeStyleCapabilities
  }
  masks: boolean
  snapshot: boolean
}

export type RenderCapabilityPath =
  | 'texture.static'
  | 'texture.dynamic'
  | 'shape.rect.fill'
  | 'shape.rect.stroke'
  | 'shape.roundedRect.fill'
  | 'shape.roundedRect.stroke'
  | 'shape.ellipse.fill'
  | 'shape.ellipse.stroke'
  | 'shape.path.fill'
  | 'shape.path.stroke'
  | 'shape.strokeStyle.width'
  | 'shape.strokeStyle.lineCap'
  | 'shape.strokeStyle.lineJoin'
  | 'shape.strokeStyle.miterLimit'
  | 'shape.strokeStyle.lineDash'
  | 'masks'
  | 'snapshot'

export const RENDER_CAPABILITY_PATHS: RenderCapabilityPath[] = [
  'texture.static',
  'texture.dynamic',
  'shape.rect.fill',
  'shape.rect.stroke',
  'shape.roundedRect.fill',
  'shape.roundedRect.stroke',
  'shape.ellipse.fill',
  'shape.ellipse.stroke',
  'shape.path.fill',
  'shape.path.stroke',
  'shape.strokeStyle.width',
  'shape.strokeStyle.lineCap',
  'shape.strokeStyle.lineJoin',
  'shape.strokeStyle.miterLimit',
  'shape.strokeStyle.lineDash',
  'masks',
  'snapshot'
]

export function createRenderCapabilities (value: boolean): RenderCapabilities {
  return {
    texture: {
      static: value,
      dynamic: value
    },
    shape: {
      rect: { fill: value, stroke: value },
      roundedRect: { fill: value, stroke: value },
      ellipse: { fill: value, stroke: value },
      path: { fill: value, stroke: value },
      strokeStyle: {
        width: value,
        lineCap: value,
        lineJoin: value,
        miterLimit: value,
        lineDash: value
      }
    },
    masks: value,
    snapshot: value
  }
}

export function createEmptyRenderCapabilities (): RenderCapabilities {
  return createRenderCapabilities(false)
}

export function createCanvasRenderCapabilities (): RenderCapabilities {
  return createRenderCapabilities(true)
}

export function createWebGLRenderCapabilities (): RenderCapabilities {
  const capabilities = createRenderCapabilities(false)
  capabilities.texture.static = true
  capabilities.texture.dynamic = true
  capabilities.shape.rect.fill = true
  capabilities.shape.rect.stroke = true
  capabilities.shape.roundedRect.fill = true
  capabilities.shape.roundedRect.stroke = true
  capabilities.shape.strokeStyle.width = true
  capabilities.snapshot = true
  return capabilities
}

function capabilityValueAtPath (
  capabilities: RenderCapabilities,
  path: RenderCapabilityPath
): boolean {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[key]
  }, capabilities) === true
}

export function diffRenderCapabilities (
  requiredCapabilities: RenderCapabilities,
  backendCapabilities: RenderCapabilities
): RenderCapabilityPath[] {
  return RENDER_CAPABILITY_PATHS.filter(path => {
    return capabilityValueAtPath(requiredCapabilities, path) &&
      !capabilityValueAtPath(backendCapabilities, path)
  })
}

export interface UnsupportedPathCommandDiagnostic {
  owner: 'shape' | 'mask'
  geometryId: string
  method: string
  rawPath?: string
}

export interface RenderCompileDiagnostics {
  unsupportedPathCommands: UnsupportedPathCommandDiagnostic[]
}

export interface CompiledResources {
  images: {
    [key: string]: string | Bitmap
  }
  replaceElements: ReplaceElements
  dynamicElements: DynamicElements
}

export type PathCommand =
  | { type: 'moveTo', x: number, y: number }
  | { type: 'lineTo', x: number, y: number }
  | { type: 'bezierCurveTo', x1: number, y1: number, x2: number, y2: number, x: number, y: number }
  | { type: 'quadraticCurveTo', x1: number, y1: number, x: number, y: number }
  | { type: 'closePath' }
  | { type: 'unsupported', method: string }

export type CompiledGeometry =
  | {
    id: string
    type: 'path'
    commands: PathCommand[]
    contourCount: number
    hasHoles: boolean
    hasUnsupportedCommands: boolean
  }
  | {
    id: string
    type: 'ellipse'
    x: number
    y: number
    radiusX: number
    radiusY: number
  }
  | {
    id: string
    type: 'rect'
    x: number
    y: number
    width: number
    height: number
    cornerRadius: number
  }

export interface ShapeRenderCommand {
  type: 'shape'
  geometryId: string
  transform: Transform | undefined
  styles: VideoStyles
}

export interface MaskRenderCommand {
  geometryId: string
  transform: Transform | undefined
  styles: VideoStyles
}

export interface SpriteRenderCommand {
  type: 'sprite'
  imageKey: string
  alpha: number
  transform: Transform | undefined
  layout: Rect
  mask: MaskRenderCommand | null
  shapes: ShapeRenderCommand[]
}

export type FrameRenderCommand = SpriteRenderCommand

export interface CompiledAnimation {
  source: Video
  size: {
    width: number
    height: number
  }
  fps: number
  totalFrames: number
  frames: FrameRenderCommand[][]
  resources: CompiledResources
  geometries: {
    [id: string]: CompiledGeometry
  }
  requiredCapabilities: RenderCapabilities
  diagnostics: RenderCompileDiagnostics
  backendType: RenderBackendType | null
}

export interface RenderCompileOptions {
  renderMode?: RenderMode
  isCacheFrames?: boolean
}

export interface RenderCompilerResult {
  animation: CompiledAnimation
  backend: import('../backend/types').RenderBackend
}
