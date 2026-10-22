import { createNullMap } from '../internal/maps'
import type { BitmapsCache, Drawable, PlayerConfig, PlayerState } from '../types'
import { Animator } from './animator'

export type ImageRelease = ImageBitmap | (() => void)

export type FrameCache = { [key: string]: ImageBitmap | undefined }

export interface PlayerRuntime {
  __svgaTimeline: number
  __svgaPending: Set<number>
  __svgaOrder: Map<number, true>
  __svgaBytes: number
}

export interface PlayerContext {
  __svgaAnimator: Animator
  __svgaConfig: PlayerConfig
  __svgaCanvas?: HTMLCanvasElement | OffscreenCanvas
  __svgaVisible: boolean
  __svgaObserver: IntersectionObserver | null
  __svgaImages: BitmapsCache
  __svgaOwned: ImageRelease[]
  __svgaFrames: FrameCache
  __svgaState: PlayerState
  __svgaMountToken: number
  __svgaRuntime: PlayerRuntime
}

const contexts = new WeakMap<object, PlayerContext>()

export function setPlayerContext(owner: object, context: PlayerContext): void {
  contexts.set(owner, context)
}

export function getPlayerContext(owner: object): PlayerContext | undefined {
  return contexts.get(owner)
}

export function createPlayerContext(): PlayerContext {
  return {
    __svgaAnimator: new Animator(),
    __svgaConfig: {
      container: document.createElement('canvas'),
      loop: 0,
      fillMode: 'forwards',
      playMode: 'forwards',
      startFrame: 0,
      endFrame: 0,
      loopStartFrame: 0,
      isCacheFrames: false,
      isUseIntersectionObserver: false,
      isOpenNoExecutionDelay: false,
      isDisableOffscreenCanvas: false,
    },
    __svgaVisible: true,
    __svgaObserver: null,
    __svgaImages: createNullMap<Drawable>(),
    __svgaOwned: [],
    __svgaFrames: createNullMap<ImageBitmap | undefined>(),
    __svgaState: 'idle',
    __svgaMountToken: 0,
    __svgaRuntime: {
      __svgaTimeline: 0,
      __svgaPending: new Set(),
      __svgaOrder: new Map(),
      __svgaBytes: 0,
    },
  }
}
