import { describe, expect, it } from 'vitest'

import { copyNullMap, createNullMap } from '../../src/internal/maps'

describe('null maps', () => {
  it('creates a map without a prototype', () => {
    const map = createNullMap<number>()
    expect(Object.getPrototypeOf(map)).toBeNull()
    map.answer = 42
    expect(Object.keys(map)).toEqual(['answer'])
  })

  it('copies own keys into a fresh null-prototype map', () => {
    const source = createNullMap<number>()
    source.a = 1
    source.b = 2

    const copy = copyNullMap(source)
    expect(copy).not.toBe(source)
    expect(Object.getPrototypeOf(copy)).toBeNull()
    expect(Object.keys(copy)).toEqual(['a', 'b'])

    copy.a = 3
    expect(source.a).toBe(1)
  })
})
