import { describe, expect, it } from 'vitest'

import { Utils } from '../../src/utils'

describe('Utils.getVersion', () => {
  it('recognizes ZIP-based SVGA v1 data', () => {
    expect(Utils.getVersion(Uint8Array.from([80, 75, 3, 4, 0]).buffer)).toBe(1)
  })

  it('treats non-ZIP data as SVGA v2', () => {
    expect(Utils.getVersion(Uint8Array.from([0, 1, 2, 3]).buffer)).toBe(2)
  })
})
