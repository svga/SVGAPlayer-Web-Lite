import { describe, it, expect } from 'vitest'
import { VideoEntity } from './video-entity'
import type { Movie, RawImages } from '../types'
import { SHAPE_TYPE_CODE, LINE_CAP_CODE, LINE_JOIN_CODE } from '../types'

describe('VideoEntity', () => {
  const createMockMovie = (overrides?: Partial<Movie>): Movie => ({
    version: '2.0.0',
    images: {},
    params: {
      fps: 20,
      frames: 10,
      viewBoxWidth: 400,
      viewBoxHeight: 400
    },
    sprites: [],
    ...overrides
  })

  const createMockStyles = (overrides?: any) => ({
    fill: { r: 1, g: 0.5, b: 0, a: 1 },
    stroke: { r: 0, g: 1, b: 0.5, a: 0.5 },
    strokeWidth: 2,
    lineCap: LINE_CAP_CODE.ROUND,
    lineJoin: LINE_JOIN_CODE.ROUND,
    miterLimit: 4,
    lineDashI: null,
    lineDashII: null,
    lineDashIII: null,
    ...overrides
  })

  const createMockShape = (overrides?: any) => ({
    type: SHAPE_TYPE_CODE.SHAPE,
    shape: { d: 'M0,0 L10,10' },
    rect: null,
    ellipse: null,
    styles: createMockStyles(),
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    ...overrides
  })

  const createMockFrame = (overrides?: any) => ({
    alpha: 1,
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    nx: 0,
    ny: 0,
    layout: { x: 0, y: 0, width: 100, height: 100 },
    clipPath: '',
    maskPath: null,
    shapes: [],
    ...overrides
  })

  const createMockSprite = (overrides?: any) => ({
    imageKey: 'test-image',
    frames: [],
    ...overrides
  })

  describe('Constructor', () => {
    it('should assign basic Movie properties', () => {
      const movie = createMockMovie({
        version: '2.1.0',
        params: { fps: 30, frames: 60, viewBoxWidth: 800, viewBoxHeight: 600 }
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      expect(videoEntity.version).toBe('2.1.0')
      expect(videoEntity.size.width).toBe(800)
      expect(videoEntity.size.height).toBe(600)
      expect(videoEntity.fps).toBe(30)
      expect(videoEntity.frames).toBe(60)
      expect(videoEntity.images).toEqual(images)
    })

    it('should handle empty sprites array', () => {
      const movie = createMockMovie({ sprites: [] })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      expect(videoEntity.sprites).toEqual([])
    })
  })

  describe('Frame processing', () => {
    it('should process frame with all fields present', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                layout: { x: 10, y: 20, width: 100, height: 200 },
                transform: { a: 1, b: 0.5, c: 0.5, d: 1, tx: 10, ty: 20 },
                clipPath: 'M0,0 L10,10',
                shapes: [createMockShape()]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      expect(videoEntity.sprites).toHaveLength(1)
      expect(videoEntity.sprites[0].frames).toHaveLength(1)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.layout).toEqual({ x: 10, y: 20, width: 100, height: 200 })
      expect(frame.transform).toEqual({ a: 1, b: 0.5, c: 0.5, d: 1, tx: 10, ty: 20 })
      expect(frame.clipPath).toBe('M0,0 L10,10')
    })

    it('should default null layout to zero values', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                layout: null as any
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.layout).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    })

    it('should default null transform to identity matrix', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                transform: null
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 })
    })

    it('should default null clipPath to empty string', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                clipPath: null as any
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.clipPath).toBe('')
    })
  })

  describe('Shape conversion - SHAPE type', () => {
    it('should convert SHAPE type', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    type: SHAPE_TYPE_CODE.SHAPE,
                    shape: { d: 'M0,0 L10,10 L20,0 Z' },
                    rect: null,
                    ellipse: null
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes).toHaveLength(1)
      expect(frame.shapes[0].type).toBe('shape')
      if (frame.shapes[0].type === 'shape') {
        expect(frame.shapes[0].path.d).toBe('M0,0 L10,10 L20,0 Z')
      }
    })
  })

  describe('Shape conversion - RECT type', () => {
    it('should convert RECT type', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    type: SHAPE_TYPE_CODE.RECT,
                    shape: null,
                    rect: { x: 10, y: 20, width: 100, height: 200, cornerRadius: 5 },
                    ellipse: null
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes).toHaveLength(1)
      expect(frame.shapes[0].type).toBe('rect')
      if (frame.shapes[0].type === 'rect') {
        expect(frame.shapes[0].path).toEqual({ x: 10, y: 20, width: 100, height: 200, cornerRadius: 5 })
      }
    })
  })

  describe('Shape conversion - ELLIPSE type', () => {
    it('should convert ELLIPSE type', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    type: SHAPE_TYPE_CODE.ELLIPSE,
                    shape: null,
                    rect: null,
                    ellipse: { x: 50, y: 50, radiusX: 25, radiusY: 15 }
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes).toHaveLength(1)
      expect(frame.shapes[0].type).toBe('ellipse')
      if (frame.shapes[0].type === 'ellipse') {
        expect(frame.shapes[0].path).toEqual({ x: 50, y: 50, radiusX: 25, radiusY: 15 })
      }
    })
  })

  describe('Shape conversion - KEEP type reuses shapes', () => {
    it('should reuse shapes from previous frame when KEEP type', () => {
      const firstShape = createMockShape({
        type: SHAPE_TYPE_CODE.SHAPE,
        shape: { d: 'M0,0 L10,10' }
      })

      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              // First frame with shapes
              createMockFrame({
                shapes: [firstShape]
              }),
              // Second frame with KEEP type
              createMockFrame({
                shapes: [
                  createMockShape({
                    type: SHAPE_TYPE_CODE.KEEP,
                    shape: null,
                    rect: null,
                    ellipse: null
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const firstFrame = videoEntity.sprites[0].frames[0]
      const secondFrame = videoEntity.sprites[0].frames[1]

      expect(firstFrame.shapes).toHaveLength(1)
      expect(secondFrame.shapes).toHaveLength(1)
      expect(secondFrame.shapes).toBe(firstFrame.shapes)
    })
  })

  describe('Shape with null styles is skipped', () => {
    it('should skip shapes with null styles', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({ styles: null }),
                  createMockShape({ styles: createMockStyles() })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes).toHaveLength(1)
    })
  })

  describe('Shape with type but null path data', () => {
    it('should skip SHAPE type with null shape', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    type: SHAPE_TYPE_CODE.SHAPE,
                    shape: null
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes).toHaveLength(0)
    })

    it('should skip RECT type with null rect', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    type: SHAPE_TYPE_CODE.RECT,
                    rect: null
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes).toHaveLength(0)
    })

    it('should skip ELLIPSE type with null ellipse', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    type: SHAPE_TYPE_CODE.ELLIPSE,
                    ellipse: null
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes).toHaveLength(0)
    })
  })

  describe('Frame alpha default', () => {
    it('should default null alpha to 0', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                alpha: null as any
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.alpha).toBe(0)
    })
  })

  describe('RGBA color conversion', () => {
    it('should convert RGBA with rounding', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({
                      fill: { r: 0.5, g: 0.33, b: 0.99, a: 0.8 },
                      stroke: { r: 0.1, g: 0.9, b: 0.7, a: 1 }
                    })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      const styles = frame.shapes[0].styles
      expect(styles.fill).toBe('rgba(128, 84, 252, 0.8)')
      expect(styles.stroke).toBe('rgba(26, 230, 179, 1)')
    })
  })

  describe('LineCap enum mapping', () => {
    it('should map LINE_CAP_CODE.BUTT to "butt"', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineCap: LINE_CAP_CODE.BUTT })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineCap).toBe('butt')
    })

    it('should map LINE_CAP_CODE.ROUND to "round"', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineCap: LINE_CAP_CODE.ROUND })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineCap).toBe('round')
    })

    it('should map LINE_CAP_CODE.SQUARE to "square"', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineCap: LINE_CAP_CODE.SQUARE })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineCap).toBe('square')
    })

    it('should handle null lineCap', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineCap: null })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineCap).toBeNull()
    })

    it('should handle unknown lineCap value', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineCap: 999 })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      // Unknown lineCap values should return null
      expect(frame.shapes[0].styles.lineCap).toBeNull()
    })
  })

  describe('LineJoin enum mapping', () => {
    it('should map LINE_JOIN_CODE.MITER to "miter"', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineJoin: LINE_JOIN_CODE.MITER })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineJoin).toBe('miter')
    })

    it('should map LINE_JOIN_CODE.ROUND to "round"', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineJoin: LINE_JOIN_CODE.ROUND })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineJoin).toBe('round')
    })

    it('should map LINE_JOIN_CODE.BEVEL to "bevel"', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineJoin: LINE_JOIN_CODE.BEVEL })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineJoin).toBe('bevel')
    })

    it('should handle unknown lineJoin value', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineJoin: 999 })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      // Unknown lineJoin values should return null
      expect(frame.shapes[0].styles.lineJoin).toBeNull()
    })
  })

  describe('LineDash array construction', () => {
    it('should construct array with lineDashI only', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineDashI: 10, lineDashII: null, lineDashIII: null })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineDash).toEqual([10])
    })

    it('should construct array with lineDashI and lineDashII', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineDashI: 10, lineDashII: 5, lineDashIII: null })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineDash).toEqual([10, 5])
    })

    it('should construct array with lineDashII only (no lineDashI)', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineDashI: null, lineDashII: 5, lineDashIII: null })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineDash).toEqual([0, 5])
    })

    it('should construct array with all three lineDash values', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineDashI: 10, lineDashII: 5, lineDashIII: 3 })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineDash).toEqual([10, 5, 3])
    })

    it('should construct array with lineDashIII only (no lineDashI or lineDashII)', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineDashI: null, lineDashII: null, lineDashIII: 3 })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineDash).toEqual([0, 0, 3])
    })

    it('should construct array with lineDashII and lineDashIII (no lineDashI)', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                shapes: [
                  createMockShape({
                    styles: createMockStyles({ lineDashI: null, lineDashII: 5, lineDashIII: 3 })
                  })
                ]
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.shapes[0].styles.lineDash).toEqual([0, 5, 3])
    })
  })

  describe('nx, ny bounds calculation', () => {
    it('should calculate nx, ny from transformed layout corners', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                layout: { x: 10, y: 20, width: 100, height: 50 },
                transform: { a: 1, b: 0, c: 0, d: 1, tx: 5, ty: 10 }
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      // With identity transform and tx=5, ty=10:
      // All x coordinates get +5, so nx = 10 + 5 = 15
      // All y coordinates get +10, so ny = 20 + 10 = 30
      expect(frame.nx).toBe(15)
      expect(frame.ny).toBe(30)
    })
  })

  describe('clipPath and maskPath conversion', () => {
    it('should create null maskPath for empty clipPath', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                clipPath: ''
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.maskPath).toBeNull()
    })

    it('should create maskPath for non-empty clipPath', () => {
      const movie = createMockMovie({
        sprites: [
          createMockSprite({
            frames: [
              createMockFrame({
                clipPath: 'M0,0 L10,10 L20,0 Z'
              })
            ]
          })
        ]
      })
      const images: RawImages = {}

      const videoEntity = new VideoEntity(movie, images)

      const frame = videoEntity.sprites[0].frames[0]
      expect(frame.maskPath).not.toBeNull()
      expect(frame.maskPath?.d).toBe('M0,0 L10,10 L20,0 Z')
      expect(frame.maskPath?.styles.fill).toBe('rgba(0, 0, 0, 0)')
      expect(frame.maskPath?.styles.stroke).toBeNull()
    })
  })
})
