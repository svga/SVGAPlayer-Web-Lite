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

export interface RenderCapabilities {
  imageRendering: boolean
  dynamicTextures: boolean
  shapeFill: boolean
  shapeFillHoles: boolean
  shapeStroke: boolean
  lineDash: boolean
  masks: boolean
  snapshot: boolean
  unsupportedPathCommands: boolean
}

export type RenderCapabilityName = keyof RenderCapabilities

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
