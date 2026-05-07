import { CompiledAnimation, RenderMode } from '../compiler/types'
import { CanvasBackend } from './canvas'
import { RenderBackend } from './types'
import { WebGLBackend, getWebGLCapabilities, isWebGLAvailable } from './webgl'

function missingCapabilities (
  animation: CompiledAnimation,
  capabilities: RenderBackend['capabilities']
): string[] {
  const missing: string[] = []
  const required = animation.requiredCapabilities

  Object.keys(required).forEach(key => {
    const capability = key as keyof typeof required
    if (required[capability] && !capabilities[capability]) {
      missing.push(capability)
    }
  })

  return missing
}

export function createBackend (
  container: HTMLCanvasElement,
  animation: CompiledAnimation,
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
    const missing = missingCapabilities(animation, getWebGLCapabilities())
    if (missing.length > 0) {
      throw new Error(`[SVGA WebGL Unsupported] Missing capabilities: ${missing.join(', ')}`)
    }
    return new WebGLBackend(container)
  }

  if (isWebGLAvailable(container)) {
    const missing = missingCapabilities(animation, getWebGLCapabilities())
    if (missing.length === 0) return new WebGLBackend(container)
  }

  return new CanvasBackend(container, isCacheFrames)
}

export type { RenderBackend } from './types'
