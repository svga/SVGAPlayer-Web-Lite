import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import render from '../../src/player/render'
import { SHAPE_TYPE } from '../../src/types'
import type {
  BitmapsCache,
  DynamicElements,
  ReplaceElements,
  Transform,
  Video,
  VideoFrame,
  VideoFrameShape,
  VideoStyles
} from '../../src/types'

interface Operation {
  name: string
  args: unknown[]
}

class RecordingContext {
  public readonly operations: Operation[] = []
  public depth = 0
  public throwMethod = ''
  public globalAlpha = 1
  public strokeStyle: string | CanvasGradient | CanvasPattern = ''
  public fillStyle: string | CanvasGradient | CanvasPattern = ''
  public lineWidth = 1
  public miterLimit = 10
  public lineCap: CanvasLineCap = 'butt'
  public lineJoin: CanvasLineJoin = 'miter'
  private record (name: string, args: unknown[] = []): void {
    this.operations.push({ name, args })
    if (this.throwMethod === name) throw new Error(`throw from ${name}`)
  }

  public save (): void {
    this.depth++
    this.record('save')
  }

  public restore (): void {
    this.depth--
    this.record('restore')
  }

  public transform (...args: number[]): void {
    this.record('transform', args)
  }

  public drawImage (...args: unknown[]): void { this.record('drawImage', args) }
  public clip (...args: unknown[]): void { this.record('clip', args) }
  public fill (...args: unknown[]): void { this.record('fill', args) }
  public stroke (...args: unknown[]): void { this.record('stroke', args) }
  public setLineDash (args: number[]): void { this.record('setLineDash', args) }
}

class RecordingPath2D {
  public static readonly instances: RecordingPath2D[] = []
  public readonly operations: Operation[] = []

  constructor (public readonly source?: string) {
    if (source === 'invalid') throw new Error('invalid SVG path')
    RecordingPath2D.instances.push(this)
  }

  public moveTo (...args: number[]): void { this.operations.push({ name: 'moveTo', args }) }
  public arcTo (...args: number[]): void { this.operations.push({ name: 'arcTo', args }) }
  public closePath (): void { this.operations.push({ name: 'closePath', args: [] }) }
  public ellipse (...args: number[]): void {
    if (args[2] < 0 || args[3] < 0) throw new Error('invalid ellipse radius')
    this.operations.push({ name: 'ellipse', args })
  }
}

class RecordingCanvas {
  public readonly context = new RecordingContext()
  public getContext (): RecordingContext { return this.context }
}

const identity: Transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
const emptyStyles: VideoStyles = {
  fill: null,
  stroke: null,
  strokeWidth: null,
  lineCap: null,
  lineJoin: null,
  miterLimit: null,
  lineDash: null
}

function pathShape (d: string, styles: VideoStyles = emptyStyles): VideoFrameShape {
  return { type: SHAPE_TYPE.SHAPE, path: { d }, transform: identity, styles }
}

function frame (shapes: VideoFrameShape[], overrides: Partial<VideoFrame> = {}): VideoFrame {
  return {
    alpha: 1,
    transform: null,
    layout: { x: 0, y: 0, width: 100, height: 100 },
    clipPath: '',
    shapes,
    ...overrides
  }
}

function video (frames: VideoFrame[]): Video {
  return {
    version: '2.0',
    size: { width: 100, height: 100 },
    fps: 20,
    frames: frames.length,
    images: Object.create(null),
    replaceElements: Object.create(null),
    dynamicElements: Object.create(null),
    sprites: [{ imageKey: 'sprite', frames }]
  }
}

function draw (
  frames: VideoFrame[],
  bitmaps: BitmapsCache = {},
  dynamic: DynamicElements = {},
  replacements: ReplaceElements = {}
): RecordingContext {
  const canvas = new RecordingCanvas()
  render(
    canvas as unknown as HTMLCanvasElement,
    bitmaps,
    dynamic,
    replacements,
    video(frames),
    0
  )
  return canvas.context
}

function argsFor (context: RecordingContext, name: string): unknown[][] {
  return context.operations.filter(operation => operation.name === name).map(operation => operation.args)
}

function pathForSource (source: string): RecordingPath2D {
  const path = RecordingPath2D.instances.find(candidate => candidate.source === source)
  if (!path) throw new Error(`missing path: ${source}`)
  return path
}

beforeEach(() => {
  RecordingPath2D.instances.length = 0
  vi.stubGlobal('Path2D', RecordingPath2D)
  vi.stubGlobal('CSS', {
    supports: vi.fn((_property: string, value: string) => !value.includes('invalid') && !value.endsWith(' L")'))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('default renderer native path handling', () => {
  it('delegates SVG parsing and ellipse construction to native Path2D', () => {
    const styles: VideoStyles = { ...emptyStyles, fill: 'rgba(1, 2, 3, 1)', stroke: 'rgba(4, 5, 6, 1)' }
    const context = draw([frame([
      pathShape('M0 0 A10 5 0 0 1 20 0', styles),
      {
        type: SHAPE_TYPE.ELLIPSE,
        path: { x: 10, y: 20, radiusX: 3, radiusY: 4 },
        transform: identity,
        styles
      }
    ])])

    const svgPath = pathForSource('M0 0 A10 5 0 0 1 20 0')
    const ellipsePath = RecordingPath2D.instances.find(path => path.operations.some(operation => operation.name === 'ellipse'))
    expect(ellipsePath?.operations).toContainEqual({ name: 'ellipse', args: [10, 20, 3, 4, 0, 0, Math.PI * 2] })
    expect(argsFor(context, 'fill')).toEqual([[svgPath], [ellipsePath]])
    expect(argsFor(context, 'stroke')).toEqual([[svgPath], [ellipsePath]])
  })

  it('skips malformed native SVG paths without leaking drawing state', () => {
    const context = draw([frame([pathShape('invalid')])])

    expect(argsFor(context, 'fill')).toEqual([])
    expect(argsFor(context, 'stroke')).toEqual([])
    expect(context.depth).toBe(0)
  })

  it('skips empty SVG paths and invalid native shape arguments', () => {
    const context = draw([frame([
      pathShape('', { ...emptyStyles, fill: 'rgba(1, 2, 3, 1)' }),
      {
        type: SHAPE_TYPE.ELLIPSE,
        path: { x: 10, y: 20, radiusX: -1, radiusY: 4 },
        transform: identity,
        styles: { ...emptyStyles, fill: 'rgba(4, 5, 6, 1)' }
      }
    ])])

    expect(argsFor(context, 'fill')).toEqual([])
    expect(argsFor(context, 'stroke')).toEqual([])
    expect(context.depth).toBe(0)
  })

  it('fails closed for an invalid clipPath', () => {
    const bitmap = { kind: 'bitmap' } as unknown as HTMLImageElement
    const dynamic = { kind: 'dynamic', width: 10, height: 10 } as unknown as HTMLImageElement
    const context = draw(
      [frame([pathShape('M0 0 H10 V10 Z', { ...emptyStyles, fill: 'rgba(1, 2, 3, 1)' })], { clipPath: 'invalid' })],
      { sprite: bitmap },
      { sprite: dynamic }
    )

    expect(argsFor(context, 'drawImage')).toEqual([])
    expect(argsFor(context, 'fill')).toEqual([])
    expect(context.depth).toBe(0)
  })

  it('normalizes newline whitespace and validates a clipPath with native CSS path grammar', () => {
    const mask = 'M0 0\n\tH10  V10 H0 Z'
    const context = draw([frame([], { clipPath: mask })], { sprite: {} as HTMLImageElement })

    expect(CSS.supports).toHaveBeenCalledWith('offset-path', 'path("M0 0 H10 V10 H0 Z")')
    expect(argsFor(context, 'clip')).toEqual([[pathForSource('M0 0 H10 V10 H0 Z')]])
  })

  it.each(['M0 0 H10 V10 H0 Z invalid', 'M0 0 L'])(
    'fails closed before Path2D for a clipPath with trailing input: %s',
    mask => {
      const context = draw([frame([], { clipPath: mask })], { sprite: {} as HTMLImageElement })

      expect(argsFor(context, 'drawImage')).toEqual([])
      expect(RecordingPath2D.instances.find(path => path.source === mask)).toBeUndefined()
      expect(context.depth).toBe(0)
    }
  )

  it('fails closed for a nonempty clipPath when CSS.supports is unavailable', () => {
    vi.stubGlobal('CSS', undefined)
    const context = draw([frame([], { clipPath: 'M0 0 H10 V10 H0 Z' })], { sprite: {} as HTMLImageElement })

    expect(argsFor(context, 'drawImage')).toEqual([])
    expect(RecordingPath2D.instances).toHaveLength(0)
    expect(context.depth).toBe(0)
  })

  it.each(['replacement', 'dynamic', 'shape'] as const)(
    'applies a sprite clipPath once to a %s-only sprite',
    visual => {
      const replacement = { kind: 'replacement' } as unknown as HTMLImageElement
      const dynamic = { kind: 'dynamic', width: 10, height: 10 } as unknown as HTMLImageElement
      const shapes = visual === 'shape'
        ? [pathShape('M0 0 H5 V5 Z', { ...emptyStyles, fill: 'rgba(1, 2, 3, 1)' })]
        : []
      const mask = 'M0 0 H10 V10 Z'
      const context = draw(
        [frame(shapes, { clipPath: mask })],
        {},
        visual === 'dynamic' ? { sprite: dynamic } : {},
        visual === 'replacement' ? { sprite: replacement } : {}
      )

      expect(argsFor(context, 'clip')).toEqual([[pathForSource(mask)]])
      if (visual === 'replacement') expect(argsFor(context, 'drawImage').map(args => args[0])).toEqual([replacement])
      if (visual === 'dynamic') expect(argsFor(context, 'drawImage').map(args => args[0])).toEqual([dynamic])
      if (visual === 'shape') expect(argsFor(context, 'fill')).toHaveLength(1)
      expect(context.depth).toBe(0)
    }
  )

  it('does not construct or apply a clip for an empty clipPath', () => {
    const dynamic = { kind: 'dynamic', width: 10, height: 10 } as unknown as HTMLImageElement
    const context = draw([frame([])], {}, { sprite: dynamic })

    expect(argsFor(context, 'clip')).toEqual([])
    expect(RecordingPath2D.instances).toHaveLength(0)
    expect(argsFor(context, 'drawImage').map(args => args[0])).toEqual([dynamic])
  })
})

describe('default renderer lifecycle and preserved drawing behavior', () => {
  it('ignores a sprite whose requested frame is missing', () => {
    const context = draw([])

    expect(context.operations).toEqual([])
    expect(context.depth).toBe(0)
  })

  it('restores both shape and sprite state when drawing throws', () => {
    const canvas = new RecordingCanvas()
    canvas.context.throwMethod = 'stroke'
    const strokeStyles: VideoStyles = { ...emptyStyles, stroke: 'rgba(1, 2, 3, 1)' }

    expect(() => render(
      canvas as unknown as HTMLCanvasElement,
      {},
      {},
      {},
      video([frame([pathShape('M0 0 L1 1', strokeStyles)])]),
      0
    )).toThrow('throw from stroke')
    expect(argsFor(canvas.context, 'save')).toHaveLength(2)
    expect(argsFor(canvas.context, 'restore')).toHaveLength(2)
    expect(canvas.context.depth).toBe(0)
  })

  it('keeps transformed masks, replacements, dynamic elements, ellipses and rounded rectangles working', () => {
    const bitmap = { kind: 'bitmap' } as unknown as HTMLImageElement
    const replacement = { kind: 'replacement' } as unknown as HTMLImageElement
    const dynamic = { kind: 'dynamic', width: 20, height: 10 } as unknown as HTMLImageElement
    const shapes: VideoFrameShape[] = [
      {
        type: SHAPE_TYPE.ELLIPSE,
        path: { x: 10, y: 20, radiusX: 3, radiusY: 4 },
        transform: identity,
        styles: emptyStyles
      },
      {
        type: SHAPE_TYPE.RECT,
        path: { x: 1, y: 2, width: 20, height: 10, cornerRadius: 3 },
        transform: identity,
        styles: emptyStyles
      }
    ]
    const maskTransform: Transform = { a: 2, b: 0, c: 0, d: 2, tx: 5, ty: 6 }
    const maskPath = 'M0 0 L10 0 L10 10 Z'
    const context = draw(
      [frame(shapes, { clipPath: maskPath, transform: maskTransform })],
      { sprite: bitmap },
      { sprite: dynamic },
      { sprite: replacement }
    )

    expect(argsFor(context, 'clip')).toEqual([[pathForSource(maskPath)]])
    expect(argsFor(context, 'transform')).toContainEqual([2, 0, 0, 2, 5, 6])
    expect(argsFor(context, 'drawImage').map(args => args[0])).toEqual([replacement, dynamic])
    const ellipsePath = RecordingPath2D.instances.find(path => path.operations.some(operation => operation.name === 'ellipse'))
    expect(ellipsePath?.operations).toContainEqual({ name: 'ellipse', args: [10, 20, 3, 4, 0, 0, Math.PI * 2] })
    const rectPath = RecordingPath2D.instances.find(path => path.operations.filter(operation => operation.name === 'arcTo').length === 4)
    expect(rectPath?.operations).toEqual([
      { name: 'moveTo', args: [4, 2] },
      { name: 'arcTo', args: [21, 2, 21, 12, 3] },
      { name: 'arcTo', args: [21, 12, 1, 12, 3] },
      { name: 'arcTo', args: [1, 12, 1, 2, 3] },
      { name: 'arcTo', args: [1, 2, 21, 2, 3] },
      { name: 'closePath', args: [] }
    ])
    expect(context.depth).toBe(0)
  })

  it.each(['constructor', '__proto__'])(
    'reads %s from bitmap, replacement, and dynamic maps only when it is an own property',
    imageKey => {
      const source = video([frame([])])
      source.sprites[0].imageKey = imageKey
      const empty = Object.create(null) as Record<string, never>

      const inheritedBitmapCanvas = new RecordingCanvas()
      render(
        inheritedBitmapCanvas as unknown as HTMLCanvasElement,
        {},
        empty,
        empty,
        source,
        0
      )
      expect(argsFor(inheritedBitmapCanvas.context, 'drawImage')).toEqual([])

      const bitmap = { kind: 'bitmap' } as unknown as HTMLImageElement
      const ownBitmap = Object.create(null) as BitmapsCache
      ownBitmap[imageKey] = bitmap
      const inheritedReplacementCanvas = new RecordingCanvas()
      render(
        inheritedReplacementCanvas as unknown as HTMLCanvasElement,
        ownBitmap,
        empty,
        {},
        source,
        0
      )
      expect(argsFor(inheritedReplacementCanvas.context, 'drawImage').map(args => args[0])).toEqual([bitmap])

      const inheritedDynamicCanvas = new RecordingCanvas()
      render(
        inheritedDynamicCanvas as unknown as HTMLCanvasElement,
        empty,
        {},
        empty,
        source,
        0
      )
      expect(argsFor(inheritedDynamicCanvas.context, 'drawImage')).toEqual([])
    }
  )
})
