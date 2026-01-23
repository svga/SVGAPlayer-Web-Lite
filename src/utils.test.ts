import { describe, it, expect } from 'vitest'
import { Utils } from './utils'

describe('Utils', () => {
  describe('getVersion', () => {
    it('should detect SVGA 2.x format', () => {
      const header = new Uint8Array([0x53, 0x56, 0x47, 0x32]) // "SVG2"
      expect(Utils.getVersion(header)).toBe(2)
    })

    it('should detect SVGA 2.x format with ArrayBuffer', () => {
      const buffer = new ArrayBuffer(4)
      const view = new Uint8Array(buffer)
      view[0] = 0x53 // "S"
      view[1] = 0x56 // "V"
      view[2] = 0x47 // "G"
      view[3] = 0x32 // "2"
      expect(Utils.getVersion(buffer)).toBe(2)
    })

    it('should detect SVGA 1.x format', () => {
      const header = new Uint8Array([80, 75, 3, 4]) // PK\x03\x04
      expect(Utils.getVersion(header)).toBe(1)
    })

    it('should handle unknown format', () => {
      const header = new Uint8Array([0x00, 0x00, 0x00, 0x00])
      expect(Utils.getVersion(header)).toBe(0)
    })

    it('should handle invalid input', () => {
      const header = new Uint8Array([])
      expect(Utils.getVersion(header)).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle partial headers', () => {
      const header = new Uint8Array([0x53, 0x56]) // Partial "SV"
      expect(Utils.getVersion(header)).toBe(0)
    })

    it('should handle negative values in header', () => {
      const header = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF])
      expect(Utils.getVersion(header)).toBe(0)
    })

    it('should handle single byte header', () => {
      const header = new Uint8Array([0x53]) // Single byte "S"
      expect(Utils.getVersion(header)).toBe(0)
    })

    it('should handle two byte header', () => {
      const header = new Uint8Array([0x53, 0x56]) // Two bytes "SV"
      expect(Utils.getVersion(header)).toBe(0)
    })

    it('should handle three byte header', () => {
      const header = new Uint8Array([0x53, 0x56, 0x47]) // Three bytes "SVG"
      expect(Utils.getVersion(header)).toBe(0)
    })
  })
})
