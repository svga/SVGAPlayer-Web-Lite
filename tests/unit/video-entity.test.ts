import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

import { Root } from 'protobufjs'
import { describe, expect, it } from 'vitest'

import SVGA_PROTO from '../../src/parser/svga-proto'
import { VideoEntity } from '../../src/parser/video-entity'
import {
  LINE_CAP_CODE,
  LINE_JOIN_CODE,
  Movie,
  MovieFrame,
  SHAPE_TYPE_CODE
} from '../../src/types'

const frame = (shapes: MovieFrame['shapes'] = []): MovieFrame => ({
  alpha: 1,
  layout: { x: 0, y: 0, width: 10, height: 10 },
  transform: null,
  clipPath: '',
  maskPath: null,
  nx: 0,
  ny: 0,
  shapes
})

const movie = (frames: MovieFrame[] = [frame()]): Movie => ({
  version: '2.0',
  images: {},
  params: { fps: 20, frames: frames.length, viewBoxHeight: 100, viewBoxWidth: 100 },
  sprites: [{ imageKey: 'image', frames }]
})

const styles = {
  fill: { r: 2, g: -1, b: 0.5, a: 0.375 },
  stroke: { r: Number.NaN, g: 0.25, b: 1.5, a: -0.5 },
  strokeWidth: 1,
  lineCap: LINE_CAP_CODE.ROUND,
  lineJoin: LINE_JOIN_CODE.BEVEL,
  miterLimit: 2,
  lineDashI: 0,
  lineDashII: 0,
  lineDashIII: 0
}

describe('VideoEntity', () => {
  it('clamps integer RGB channels while preserving fractional alpha', () => {
    const entity = new VideoEntity(movie([frame([{
      type: SHAPE_TYPE_CODE.SHAPE,
      shape: { d: 'M0 0' },
      rect: null,
      ellipse: null,
      styles,
      transform: null
    }])]))

    expect(entity.sprites[0].frames[0].shapes[0].styles.fill)
      .toBe('rgba(255, 0, 127, 0.375)')
    expect(entity.sprites[0].frames[0].shapes[0].styles.stroke)
      .toBe('rgba(0, 63, 255, 0)')
  })

  it('reuses the previous shape array for KEEP frames', () => {
    const entity = new VideoEntity(movie([
      frame([{
        type: SHAPE_TYPE_CODE.SHAPE,
        shape: { d: 'M0 0' },
        rect: null,
        ellipse: null,
        styles,
        transform: null
      }]),
      frame([{
        type: SHAPE_TYPE_CODE.KEEP,
        shape: null,
        rect: null,
        ellipse: null,
        styles: null,
        transform: null
      }])
    ]))

    expect(entity.sprites[0].frames[1].shapes)
      .toBe(entity.sprites[0].frames[0].shapes)
  })

  it('skips a missing path and preserves an explicitly empty path', () => {
    const entity = new VideoEntity(movie([frame([
      {
        type: SHAPE_TYPE_CODE.SHAPE,
        shape: null,
        rect: null,
        ellipse: null,
        styles,
        transform: null
      },
      {
        type: SHAPE_TYPE_CODE.SHAPE,
        shape: { d: '' },
        rect: null,
        ellipse: null,
        styles,
        transform: null
      }
    ])]))

    expect(entity.sprites[0].frames[0].shapes).toHaveLength(1)
    expect(entity.sprites[0].frames[0].shapes[0].path).toEqual({ d: '' })
  })

  it('applies frame defaults when optional decoded values are absent', () => {
    const entity = new VideoEntity(movie([{
      alpha: undefined,
      layout: undefined,
      transform: undefined,
      clipPath: undefined,
      maskPath: null,
      nx: 0,
      ny: 0,
      shapes: []
    } as unknown as Movie['sprites'][number]['frames'][number]]))
    const parsed = entity.sprites[0].frames[0]

    expect(parsed.alpha).toBe(0)
    expect(parsed.layout).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(parsed.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 })
    expect(parsed.clipPath).toBe('')
    expect(parsed.maskPath).toBeNull()
    expect(parsed.shapes).toEqual([])
    expect(parsed.nx).toBe(0)
    expect(parsed.ny).toBe(0)
  })

  it('preserves fractional alpha values decoded from soundwave.svga', async () => {
    const compressed = await readFile('__test__/svga/soundwave.svga')
    const root = Root.fromJSON(SVGA_PROTO)
    const type = root.lookupType('com.opensource.svga.MovieEntity')
    const decoded = type.decode(inflateSync(compressed)) as unknown as Movie
    const entity = new VideoEntity(decoded)
    const colors = entity.sprites.flatMap(sprite => sprite.frames)
      .flatMap(item => item.shapes)
      .flatMap(shape => [shape.styles.fill, shape.styles.stroke])
      .filter((color): color is NonNullable<typeof color> => color !== null)

    expect(colors.some(color => /, 0\.[0-9]+\)$/.test(color))).toBe(true)
  })
})
