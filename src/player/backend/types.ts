import {
  CompiledAnimation,
  RenderBackendType,
  RenderCapabilities
} from '../compiler/types'

export interface RenderBackend {
  type: RenderBackendType
  capabilities: RenderCapabilities
  prepare: (animation: CompiledAnimation) => Promise<void>
  renderFrame: (animation: CompiledAnimation, frame: number) => void
  resize: (width: number, height: number) => void
  clear: () => void
  snapshot?: () => HTMLCanvasElement | ImageBitmap | null
  destroy: () => void
}
