import { SHAPE_TYPE, type Transform, type Video, type VideoFrameShape, type VideoStyles } from './types'

const error = (reason = 'structure'): never => { throw Error(`Invalid SVGA video: ${reason}`) }
const owns = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key)

function record (value: unknown, nullOnly = false): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return nullOnly ? prototype === null : prototype === Object.prototype || prototype === null
}

function array (value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false
  for (let index = 0; index < value.length; index++) if (!owns(value, index)) return false
  return true
}

function finite (value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function finiteRecord (value: unknown, keys: string[]): value is Record<string, number> {
  return record(value) && keys.every(key => owns(value, key) && finite(value[key]))
}

function transform (value: unknown, nullable = false): value is Transform | null {
  return (nullable && value === null) || finiteRecord(value, ['a', 'b', 'c', 'd', 'tx', 'ty'])
}

function nullableFinite (value: unknown): boolean {
  return value === null || finite(value)
}

function styles (value: unknown): value is VideoStyles {
  if (!record(value)) return false
  if (!nullableFinite(value.strokeWidth) || !nullableFinite(value.miterLimit)) return false
  if (value.fill !== null && typeof value.fill !== 'string') return false
  if (value.stroke !== null && typeof value.stroke !== 'string') return false
  if (value.lineCap !== null && !['butt', 'round', 'square'].includes(value.lineCap as string)) return false
  if (value.lineJoin !== null && !['bevel', 'round', 'miter'].includes(value.lineJoin as string)) return false
  if (value.lineDash !== null && (!array(value.lineDash) || !value.lineDash.every(finite))) return false
  return true
}

function shape (value: unknown): value is VideoFrameShape {
  if (!record(value) || !transform(value.transform) || !styles(value.styles) || !record(value.path)) return false
  if (value.type === SHAPE_TYPE.SHAPE) return typeof value.path.d === 'string'
  if (value.type === SHAPE_TYPE.RECT) return finiteRecord(value.path, ['x', 'y', 'width', 'height', 'cornerRadius'])
  if (value.type === SHAPE_TYPE.ELLIPSE) return finiteRecord(value.path, ['x', 'y', 'radiusX', 'radiusY'])
  return false
}

export function validateVideo (value: unknown): Video {
  if (!record(value)) error()
  const video = value as unknown as Video
  if (
    typeof video.version !== 'string' ||
    !finiteRecord(video.size, ['width', 'height']) ||
    video.size.width <= 0 || video.size.height <= 0 ||
    video.size.width > 4096 || video.size.height > 4096 ||
    video.size.width * video.size.height > 16_777_216 ||
    !finite(video.fps) || video.fps <= 0 || video.fps > 120 ||
    !finite(video.frames) || !Number.isInteger(video.frames) || video.frames <= 0 || video.frames > 10_000 ||
    !record(video.images, true) || !record(video.replaceElements, true) || !record(video.dynamicElements, true) ||
    !array(video.sprites) || video.sprites.length > 2_000
  ) error('header')

  const imageKeys = Object.keys(video.images)
  if (imageKeys.length > 512 || imageKeys.some(key => !(video.images[key] instanceof Uint8Array))) error('images')

  let spriteFrames = 0
  let shapes = 0
  let pathCharacters = 0
  const seenShapeArrays = new WeakSet<object>()
  const seenShapes = new WeakSet<object>()
  for (const sprite of video.sprites) {
    if (!record(sprite) || typeof sprite.imageKey !== 'string' || !array(sprite.frames) || sprite.frames.length < video.frames) error('sprite')
    spriteFrames += sprite.frames.length
    if (spriteFrames > 500_000) error('sprite frames')

    for (const frame of sprite.frames) {
      if (
        !record(frame) || !finite(frame.alpha) ||
        !finiteRecord(frame.layout, ['x', 'y', 'width', 'height']) ||
        !transform(frame.transform, true) ||
        typeof frame.clipPath !== 'string' ||
        !array(frame.shapes)
      ) error('frame')
      pathCharacters += frame.clipPath.length
      if (pathCharacters > 1_048_576) error('frame budgets')

      if (!seenShapeArrays.has(frame.shapes)) {
        seenShapeArrays.add(frame.shapes)
        for (const item of frame.shapes) {
          if (!shape(item)) error('shape')
          if (!seenShapes.has(item)) {
            seenShapes.add(item)
            shapes++
            if (shapes > 100_000) error('frame budgets')
            if (item.type === SHAPE_TYPE.SHAPE) {
              pathCharacters += item.path.d.length
              if (pathCharacters > 1_048_576) error('path characters')
            }
          }
        }
      }
    }
  }
  return video
}
