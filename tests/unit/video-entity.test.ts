import { describe, expect, it } from 'vitest'

import { createVideo } from '../../src/parser/video-entity'
import {
  LINE_CAP_CODE,
  LINE_JOIN_CODE,
  type Movie,
  type MovieFrame,
  SHAPE_TYPE_CODE
} from '../../src/types'

const frame = (shapes: MovieFrame['shapes'] = []): MovieFrame => ({
  alpha: 1,
  layout: { x: 0, y: 0, width: 10, height: 10 },
  transform: null,
  clipPath: '',
  shapes
})

const movie = (frames: MovieFrame[] = [frame()]): Movie => ({
  version: '2.0',
  images: Object.create(null),
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

describe('createVideo', () => {
  it('creates a pure data record with null-prototype maps', () => {
    const images = Object.create(null) as Movie['images']
    images.image = Uint8Array.from([1, 2])
    const video = createVideo(movie(), images)

    expect(video.images).toBe(images)
    expect(Object.getPrototypeOf(video.images)).toBeNull()
    expect(Object.getPrototypeOf(video.replaceElements)).toBeNull()
    expect(Object.getPrototypeOf(video.dynamicElements)).toBeNull()
  })

  it('uses clipPath as the only mask source and omits dead conversion fields', () => {
    const source = frame()
    source.clipPath = 'M0 0'
    const parsed = createVideo(movie([source])).sprites[0].frames[0]

    expect(parsed.clipPath).toBe('M0 0')
    expect(parsed).not.toHaveProperty('maskPath')
    expect(parsed).not.toHaveProperty('nx')
    expect(parsed).not.toHaveProperty('ny')
  })

  it('clamps colors and reuses KEEP shape arrays', () => {
    const shape = {
      type: SHAPE_TYPE_CODE.SHAPE,
      shape: { d: 'M0 0' },
      rect: null,
      ellipse: null,
      styles,
      transform: null
    }
    const keep = {
      type: SHAPE_TYPE_CODE.KEEP,
      shape: null,
      rect: null,
      ellipse: null,
      styles: null,
      transform: null
    }
    const video = createVideo(movie([frame([shape]), frame([keep])]))
    const first = video.sprites[0].frames[0].shapes[0]

    expect(first.styles.fill).toBe('rgba(255, 0, 127, 0.375)')
    expect(first.styles.stroke).toBe('rgba(0, 63, 255, 0)')
    expect(video.sprites[0].frames[1].shapes).toBe(video.sprites[0].frames[0].shapes)
  })

  it('copies generated message paths into plain validation-safe records', () => {
    const generatedPath = Object.assign(Object.create({ generated: true }), { d: 'M0 0' })
    const source = frame([{
      type: SHAPE_TYPE_CODE.SHAPE,
      shape: generatedPath,
      rect: null,
      ellipse: null,
      styles,
      transform: null
    }])
    const path = createVideo(movie([source])).sprites[0].frames[0].shapes[0].path
    expect(path).toEqual({ d: 'M0 0' })
    expect(Object.getPrototypeOf(path)).toBe(Object.prototype)
  })
})
