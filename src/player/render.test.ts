import { describe, it, expect, vi, beforeEach } from 'vitest'
import render from './render'
import type { Video, VideoSprite, VideoFrameShape, VideoStyles, Transform } from '../types'
import { SHAPE_TYPE } from '../types'

describe('Render', () => {
  let mockCanvas: any
  let mockContext: any
  let mockBitmap: any
  let videoEntity: Video
  let bitmapsCache: any
  let dynamicElements: any
  let replaceElements: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock canvas
    mockCanvas = {
      getContext: vi.fn(() => mockContext),
      width: 400,
      height: 400
    }

    // Mock 2D context with all methods
    mockContext = {
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
      strokeStyle: 'transparent',
      fillStyle: 'transparent',
      lineWidth: 1,
      miterLimit: 10,
      lineCap: 'butt' as CanvasLineCap,
      lineJoin: 'miter' as CanvasLineJoin,
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      arcTo: vi.fn()
    }

    // Mock bitmap
    mockBitmap = {
      width: 100,
      height: 100
    }

    // Create test video entity
    const mockFrame: any = {
      alpha: 1,
      transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      layout: { x: 0, y: 0, width: 100, height: 100 },
      clipPath: '',
      maskPath: null,
      shapes: []
    }

    const mockSprite: VideoSprite = {
      imageKey: 'test-image',
      frames: [mockFrame, mockFrame, mockFrame]
    }

    videoEntity = {
      version: '2.0',
      size: { width: 400, height: 400 },
      fps: 20,
      frames: 3,
      images: {},
      replaceElements: {},
      dynamicElements: {},
      sprites: [mockSprite]
    }

    bitmapsCache = {
      'test-image': mockBitmap
    }

    dynamicElements = {}
    replaceElements = {}
  })

  describe('render()', () => {
    it('should throw when context is null', () => {
      mockCanvas.getContext = vi.fn(() => null)

      expect(() => render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)).toThrow('Render Context cannot be null')
    })

    it('should throw when context does not have save method', () => {
      mockCanvas.getContext = vi.fn(() => ({}))

      expect(() => render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)).toThrow('Render Context is not context2d')
    })

    it('should iterate through all sprites', () => {
      videoEntity.sprites = [
        { imageKey: 'image1', frames: [{ alpha: 1, transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, layout: { x: 0, y: 0, width: 100, height: 100 }, clipPath: '', maskPath: null, shapes: [] }] },
        { imageKey: 'image2', frames: [{ alpha: 1, transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, layout: { x: 0, y: 0, width: 100, height: 100 }, clipPath: '', maskPath: null, shapes: [] }] }
      ] as any

      bitmapsCache = {
        'image1': mockBitmap,
        'image2': mockBitmap
      }

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.save).toHaveBeenCalledTimes(2)
      expect(mockContext.restore).toHaveBeenCalledTimes(2)
    })

    it('should draw sprite with bitmap from cache', () => {
      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.drawImage).toHaveBeenCalledWith(mockBitmap, 0, 0, 100, 100)
    })

    it('should draw sprite with replaceElement', () => {
      const replaceElement = { width: 50, height: 50 }
      replaceElements = { 'test-image': replaceElement }

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.drawImage).toHaveBeenCalledWith(replaceElement, 0, 0, 100, 100)
    })
  })

  describe('drawSprite() - alpha threshold', () => {
    it('should skip drawing when alpha < 0.05', () => {
      (videoEntity.sprites[0].frames[0] as any).alpha = 0.04

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.save).not.toHaveBeenCalled()
    })

    it('should draw when alpha >= 0.05', () => {
      (videoEntity.sprites[0].frames[0] as any).alpha = 0.05

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.save).toHaveBeenCalled()
    })

    it('should apply globalAlpha from frame', () => {
      (videoEntity.sprites[0].frames[0] as any).alpha = 0.5

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.globalAlpha).toBe(0.5)
    })

    it('should apply transform matrix', () => {
      (videoEntity.sprites[0].frames[0] as any).transform = { a: 2, b: 0.5, c: 0.5, d: 2, tx: 10, ty: 20 }

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.transform).toHaveBeenCalledWith(2, 0.5, 0.5, 2, 10, 20)
    })

    it('should use default transform when undefined', () => {
      (videoEntity.sprites[0].frames[0] as any).transform = undefined

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.transform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0)
    })
  })

  describe('drawSprite() - maskPath', () => {
    it('should apply clip when maskPath exists', () => {
      (videoEntity.sprites[0].frames[0] as any).maskPath = {
        d: 'M0,0 L10,10',
        transform: undefined,
        styles: { fill: 'rgba(0,0,0,0)' as any, stroke: null, strokeWidth: null, lineCap: null, lineJoin: null, miterLimit: null, lineDash: null }
      }

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.clip).toHaveBeenCalled()
    })

    it('should not clip when maskPath is null', () => {
      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.clip).not.toHaveBeenCalled()
    })
  })

  describe('drawSprite() - dynamicElement', () => {
    it('should draw dynamicElement centered', () => {
      const dynamicElement = { width: 50, height: 30 }
      dynamicElements = { 'test-image': dynamicElement }

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.drawImage).toHaveBeenCalledWith(dynamicElement, 25, 35) // (100-50)/2, (100-30)/2
    })
  })

  describe('drawShape() - dispatching', () => {
    const createMockShape = (type: SHAPE_TYPE, styles: VideoStyles = { fill: null, stroke: null, strokeWidth: null, lineCap: null, lineJoin: null, miterLimit: null, lineDash: null }): VideoFrameShape => ({
      type,
      path: {} as any,
      styles,
      transform: undefined
    })

    it('should dispatch to drawBezier for SHAPE type', () => {
      (videoEntity.sprites[0].frames[0] as any).shapes = [
        createMockShape(SHAPE_TYPE.SHAPE, {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: 'rgba(0,0,0,1)' as any,
          strokeWidth: 2,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        })
      ]
      ;(videoEntity.sprites[0].frames[0].shapes[0] as any).path = { d: 'M0,0 L10,10' }

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.beginPath).toHaveBeenCalled()
    })

    it('should dispatch to drawEllipse for ELLIPSE type', () => {
      (videoEntity.sprites[0].frames[0] as any).shapes = [
        createMockShape(SHAPE_TYPE.ELLIPSE, {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        })
      ]
      ;(videoEntity.sprites[0].frames[0].shapes[0] as any).path = { x: 50, y: 50, radiusX: 25, radiusY: 15 }

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.beginPath).toHaveBeenCalled()
    })

    it('should dispatch to drawRect for RECT type', () => {
      (videoEntity.sprites[0].frames[0] as any).shapes = [
        createMockShape(SHAPE_TYPE.RECT, {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        })
      ]
      ;(videoEntity.sprites[0].frames[0].shapes[0] as any).path = { x: 10, y: 10, width: 100, height: 50, cornerRadius: 5 }

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.beginPath).toHaveBeenCalled()
    })
  })

  describe('resetShapeStyles()', () => {
    it('should handle shape with no stroke', () => {
      (videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 L10,10' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.beginPath).toHaveBeenCalled()
      expect(mockContext.fill).toHaveBeenCalled()
      expect(mockContext.stroke).not.toHaveBeenCalled()
    })

    it('should apply fill color', () => {
      (videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 L10,10' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.fillStyle).toBe('rgba(255,0,0,1)')
      expect(mockContext.fill).toHaveBeenCalled()
    })

    it('should apply stroke color and width', () => {
      (videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 L10,10' },
        styles: {
          fill: null,
          stroke: 'rgba(0,0,255,1)' as any,
          strokeWidth: 3,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.strokeStyle).toBe('rgba(0,0,255,1)')
      expect(mockContext.lineWidth).toBe(3)
      expect(mockContext.stroke).toHaveBeenCalled()
    })

    it('should apply lineCap', () => {
      (videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 L10,10' },
        styles: {
          fill: null,
          stroke: null,
          strokeWidth: null,
          lineCap: 'round',
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.lineCap).toBe('round')
    })

    it('should apply lineJoin', () => {
      (videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 L10,10' },
        styles: {
          fill: null,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: 'bevel',
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.lineJoin).toBe('bevel')
    })

    it('should apply lineDash', () => {
      (videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 L10,10' },
        styles: {
          fill: null,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: [5, 10]
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.setLineDash).toHaveBeenCalledWith([5, 10])
    })
  })

  describe('drawBezierElement() - path commands', () => {
    const testPathCommand = (command: string, args: number[], expectedCalls: any[]) => {
      const d = `${command}${args.join(' ')}`
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expectedCalls.forEach(({ method, expectedArgs }) => {
        expect(mockContext[method]).toHaveBeenCalledWith(...expectedArgs)
      })
    }

    it('M - absolute moveTo', () => {
      testPathCommand('M', [100, 100], [
        { method: 'moveTo', expectedArgs: [100, 100] }
      ])
    })

    it('m - relative moveTo', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M50,50 m10,10' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.moveTo).toHaveBeenCalledWith(50, 50)
      expect(mockContext.moveTo).toHaveBeenCalledWith(60, 60)
    })

    it('L - absolute lineTo', () => {
      testPathCommand('L', [200, 200], [
        { method: 'lineTo', expectedArgs: [200, 200] }
      ])
    })

    it('l - relative lineTo', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M50,50 l10,20' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.lineTo).toHaveBeenCalledWith(60, 70)
    })

    it('H - absolute horizontal lineTo', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M50,50 H300' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.lineTo).toHaveBeenCalledWith(300, 50)
    })

    it('h - relative horizontal lineTo', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M50,50 h50' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.lineTo).toHaveBeenCalledWith(100, 50)
    })

    it('V - absolute vertical lineTo', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M50,50 V400' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.lineTo).toHaveBeenCalledWith(50, 400)
    })

    it('v - relative vertical lineTo', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M50,50 v25' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.lineTo).toHaveBeenCalledWith(50, 75)
    })

    it('C - absolute cubic bezier', () => {
      testPathCommand('C', [100, 100, 200, 100, 200, 200], [
        { method: 'bezierCurveTo', expectedArgs: [100, 100, 200, 100, 200, 200] }
      ])
    })

    it('c - relative cubic bezier', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 c10,10 20,10 20,20' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.bezierCurveTo).toHaveBeenCalledWith(10, 10, 20, 10, 20, 20)
    })

    it('Q - absolute quadratic curve', () => {
      testPathCommand('Q', [150, 150, 200, 200], [
        { method: 'quadraticCurveTo', expectedArgs: [150, 150, 200, 200] }
      ])
    })

    it('q - relative quadratic curve', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 q30,30 60,60' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.quadraticCurveTo).toHaveBeenCalledWith(30, 30, 60, 60)
    })

    it('Z/z - closePath', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 L10,10 Z' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.closePath).toHaveBeenCalled()
    })
  })

  describe('drawEllipse()', () => {
    it('should draw ellipse with bezier approximation', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.ELLIPSE,
        path: { x: 50, y: 50, radiusX: 25, radiusY: 15 },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      // Should call bezierCurveTo 4 times to approximate ellipse
      expect(mockContext.bezierCurveTo).toHaveBeenCalledTimes(4)
    })

    it('should apply transform to ellipse', () => {
      const transform: Transform = { a: 2, b: 0, c: 0, d: 2, tx: 10, ty: 20 }
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.ELLIPSE,
        path: { x: 50, y: 50, radiusX: 25, radiusY: 15 },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.transform).toHaveBeenCalledWith(2, 0, 0, 2, 10, 20)
    })

    it('should handle default values for x, y, radiusX, radiusY', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.ELLIPSE,
        path: {},
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      expect(() => render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)).not.toThrow()
    })
  })

  describe('drawRect()', () => {
    it('should draw rectangle with rounded corners', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.RECT,
        path: { x: 10, y: 10, width: 100, height: 50, cornerRadius: 5 },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.arcTo).toHaveBeenCalledTimes(4)
    })

    it('should limit radius when width < 2*radius', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.RECT,
        path: { x: 0, y: 0, width: 10, height: 50, cornerRadius: 10 },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      // First arcTo should have radius limited to width/2 = 5
      expect(mockContext.arcTo).toHaveBeenCalledWith(10, 0, 10, 50, 5)
    })

    it('should limit radius when height < 2*radius', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.RECT,
        path: { x: 0, y: 0, width: 50, height: 8, cornerRadius: 10 },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      // First arcTo should have radius limited to height/2 = 4
      expect(mockContext.arcTo).toHaveBeenCalledWith(50, 0, 50, 8, 4)
    })

    it('should apply transform to rectangle', () => {
      const transform: Transform = { a: 1.5, b: 0, c: 0, d: 1.5, tx: 5, ty: 10 }
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.RECT,
        path: { x: 10, y: 10, width: 100, height: 50, cornerRadius: 5 },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.transform).toHaveBeenCalledWith(1.5, 0, 0, 1.5, 5, 10)
    })

    it('should handle default values for rect properties', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.RECT,
        path: {},
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: null,
          strokeWidth: null,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      expect(() => render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)).not.toThrow()
    })
  })

  describe('Integration tests', () => {
    it('should handle complex path with multiple commands', () => {
      ;(videoEntity.sprites[0].frames[0] as any).shapes = [{
        type: SHAPE_TYPE.SHAPE,
        path: { d: 'M0,0 L10,10 L20,0 Z' },
        styles: {
          fill: 'rgba(255,0,0,1)' as any,
          stroke: 'rgba(0,0,0,1)' as any,
          strokeWidth: 2,
          lineCap: null,
          lineJoin: null,
          miterLimit: null,
          lineDash: null
        },
        transform: undefined
      }]

      render(mockCanvas, bitmapsCache, dynamicElements, replaceElements, videoEntity, 0)

      expect(mockContext.moveTo).toHaveBeenCalled()
      expect(mockContext.lineTo).toHaveBeenCalledTimes(2)
      expect(mockContext.closePath).toHaveBeenCalled()
      expect(mockContext.fill).toHaveBeenCalled()
      expect(mockContext.stroke).toHaveBeenCalled()
    })
  })
})
