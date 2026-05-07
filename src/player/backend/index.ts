import { RenderMode } from '../compiler/types'
import { CanvasBackend } from './canvas'
import { RenderBackend } from './types'
import { WebGLBackend, isWebGLAvailable } from './webgl'

export function createBackend (
  container: HTMLCanvasElement,
  renderMode: RenderMode,
  isCacheFrames: boolean = false
): RenderBackend {
  if (renderMode === 'canvas') {
    return new CanvasBackend(container, isCacheFrames)
  }

  if (renderMode === 'webgl') {
    if (!isWebGLAvailable(container)) {
      throw new Error('[SVGA WebGL Unsupported] WebGL context is unavailable')
    }
    return new WebGLBackend(container)
  }

  if (isWebGLAvailable(container)) {
    return new WebGLBackend(container)
  }

  return new CanvasBackend(container, isCacheFrames)
}

export type { RenderBackend } from './types'
