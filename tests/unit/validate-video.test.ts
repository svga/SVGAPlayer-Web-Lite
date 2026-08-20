import { describe, expect, it } from 'vitest'

import type { Video, VideoFrameShape } from '../../src/types'
import { validateVideo } from '../../src/validate-video'

const nullMap = <T> (): Record<string, T> => Object.create(null) as Record<string, T>

function validShape (path = ''): VideoFrameShape {
  return {
    type: 'shape' as never,
    path: { d: path },
    styles: {
      fill: null,
      stroke: null,
      strokeWidth: 0,
      lineCap: null,
      lineJoin: null,
      miterLimit: 0,
      lineDash: [0, 0, 0]
    },
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
  }
}

function validVideo (): Video {
  return {
    version: '2.0',
    size: { width: 1, height: 1 },
    fps: 1,
    frames: 1,
    images: nullMap(),
    replaceElements: nullMap(),
    dynamicElements: nullMap(),
    sprites: [{
      imageKey: 'image',
      frames: [{
        alpha: 1,
        transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        layout: { x: 0, y: 0, width: 1, height: 1 },
        clipPath: '',
        shapes: []
      }]
    }]
  }
}

function rejects (mutate: (video: Video) => void): void {
  const video = validVideo()
  mutate(video)
  expect(() => validateVideo(video)).toThrow('Invalid SVGA video')
}

describe('validateVideo semantic budgets', () => {
  it('accepts values equal to each scalar canvas/fps/frame budget', () => {
    const video = validVideo()
    video.size = { width: 4096, height: 4096 }
    video.fps = 120
    video.frames = 10_000
    video.sprites[0].frames = Array.from({ length: 10_000 }, () => video.sprites[0].frames[0])
    expect(validateVideo(video)).toBe(video)
  })

  it.each([
    ['canvas width', (video: Video) => { video.size.width = 4097 }],
    ['canvas height', (video: Video) => { video.size.height = 4097 }],
    ['canvas area', (video: Video) => { video.size = { width: 4096, height: 4097 } }],
    ['fps', (video: Video) => { video.fps = 121 }],
    ['frames', (video: Video) => { video.frames = 10_001 }]
  ])('rejects one over the %s budget', (_name, mutate) => rejects(mutate))

  it('accepts 2,000 sprites and rejects 2,001', () => {
    const video = validVideo()
    video.sprites = Array.from({ length: 2_000 }, () => validVideo().sprites[0])
    expect(validateVideo(video)).toBe(video)
    video.sprites.push(validVideo().sprites[0])
    expect(() => validateVideo(video)).toThrow('Invalid SVGA video')
  })

  it('accepts 500,000 sprite-frames and rejects 500,001', () => {
    const video = validVideo()
    video.frames = 250
    const frame = video.sprites[0].frames[0]
    video.sprites = Array.from({ length: 2_000 }, () => ({ imageKey: 'image', frames: Array.from({ length: 250 }, () => frame) }))
    expect(validateVideo(video)).toBe(video)
    video.sprites[0].frames.push(frame)
    expect(() => validateVideo(video)).toThrow('Invalid SVGA video')
  })

  it('accepts 100,000 shapes and rejects 100,001', () => {
    const video = validVideo()
    video.sprites[0].frames[0].shapes = Array.from({ length: 100_000 }, () => validShape())
    expect(validateVideo(video)).toBe(video)
    video.sprites[0].frames[0].shapes.push(validShape())
    expect(() => validateVideo(video)).toThrow('Invalid SVGA video')
  })

  it('accepts 512 images and rejects 513', () => {
    const video = validVideo()
    for (let index = 0; index < 512; index++) video.images[`image-${index}`] = new Uint8Array()
    expect(validateVideo(video)).toBe(video)
    video.images.extra = new Uint8Array()
    expect(() => validateVideo(video)).toThrow('Invalid SVGA video')
  })

  it('accepts 1,048,576 SVG path characters and rejects one more', () => {
    const video = validVideo()
    video.sprites[0].frames[0].clipPath = 'M'.repeat(524_288)
    video.sprites[0].frames[0].shapes = [validShape('M'.repeat(524_288))]
    expect(validateVideo(video)).toBe(video)
    video.sprites[0].frames[0].clipPath += 'M'
    expect(() => validateVideo(video)).toThrow('Invalid SVGA video')
  })

  it('counts a KEEP-reused shape array once by identity while counting clip paths per frame', () => {
    const video = validVideo()
    const sharedShapes = [validShape('M'.repeat(700_000))]
    const first = video.sprites[0].frames[0]
    const second = { ...first, shapes: sharedShapes }
    first.shapes = sharedShapes
    video.frames = 2
    video.sprites[0].frames = [first, second]

    expect(validateVideo(video)).toBe(video)

    second.shapes = [validShape('M'.repeat(700_000))]
    expect(() => validateVideo(video)).toThrow('Invalid SVGA video')

    second.shapes = sharedShapes
    first.clipPath = 'M'.repeat(600_000)
    second.clipPath = 'M'.repeat(600_000)
    expect(() => validateVideo(video)).toThrow('Invalid SVGA video')
  })
})

describe('validateVideo structure and numeric fields', () => {
  it.each([
    ['width', (video: Video) => { video.size.width = 0 }],
    ['height', (video: Video) => { video.size.height = Number.NaN }],
    ['fps', (video: Video) => { video.fps = Number.POSITIVE_INFINITY }],
    ['frames positive', (video: Video) => { video.frames = 0 }],
    ['frames integer', (video: Video) => { video.frames = 1.5 }],
    ['alpha', (video: Video) => { video.sprites[0].frames[0].alpha = Number.NaN }],
    ['layout', (video: Video) => { video.sprites[0].frames[0].layout.x = Number.NEGATIVE_INFINITY }],
    ['frame transform', (video: Video) => { (video.sprites[0].frames[0].transform as NonNullable<typeof video.sprites[0]['frames'][0]['transform']>).a = Number.NaN }],
    ['shape transform', (video: Video) => { video.sprites[0].frames[0].shapes = [validShape()]; video.sprites[0].frames[0].shapes[0].transform.tx = Number.NaN }],
    ['shape geometry', (video: Video) => { const shape = validShape() as Extract<VideoFrameShape, { type: 'rect' }>; shape.type = 'rect' as never; shape.path = { x: 0, y: 0, width: Number.NaN, height: 1, cornerRadius: 0 }; video.sprites[0].frames[0].shapes = [shape] }],
    ['style number', (video: Video) => { video.sprites[0].frames[0].shapes = [validShape()]; video.sprites[0].frames[0].shapes[0].styles.strokeWidth = Number.NaN }],
    ['line dash', (video: Video) => { video.sprites[0].frames[0].shapes = [validShape()]; video.sprites[0].frames[0].shapes[0].styles.lineDash = [Number.NaN] }]
  ])('rejects an invalid %s', (_name, mutate) => rejects(mutate))

  it('rejects malformed arrays, maps, sparse frames, and invalid image values', () => {
    rejects(video => { video.sprites = {} as never })
    rejects(video => { video.sprites[0].frames = {} as never })
    rejects(video => { video.sprites[0].frames[0].shapes = {} as never })
    rejects(video => { video.images = {} })
    rejects(video => { video.replaceElements = {} })
    rejects(video => { video.dynamicElements = {} })
    rejects(video => { video.images.bad = 'base64' as never })
    rejects(video => { const sparse: Video['sprites'][0]['frames'] = []; sparse.length = 1; video.sprites[0].frames = sparse })
    rejects(video => { video.frames = 2 })
  })

  it('rejects inherited video and nested records', () => {
    const inherited = Object.create(validVideo()) as Video
    expect(() => validateVideo(inherited)).toThrow('Invalid SVGA video')
    rejects(video => { video.size = Object.create(video.size) as Video['size'] })
    rejects(video => { video.sprites[0] = Object.create(video.sprites[0]) as Video['sprites'][0] })
  })

  it('accepts dangerous own image and sprite keys through null-prototype maps', () => {
    const video = validVideo()
    Object.defineProperty(video.images, '__proto__', { enumerable: true, value: Uint8Array.from([1]) })
    Object.defineProperty(video.images, 'constructor', { enumerable: true, value: Uint8Array.from([2]) })
    video.sprites.push({ imageKey: '__proto__', frames: video.sprites[0].frames })
    video.sprites.push({ imageKey: 'constructor', frames: video.sprites[0].frames })
    expect(validateVideo(video)).toBe(video)
  })
})
