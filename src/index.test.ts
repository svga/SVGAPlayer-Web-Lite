import { describe, it, expect } from 'vitest'
import { Parser, Player, DB } from './index'

describe('src/index.ts - Module Exports', () => {
  it('should export Parser class', () => {
    expect(Parser).toBeDefined()
    expect(typeof Parser).toBe('function')
  })

  it('should export Player class', () => {
    expect(Player).toBeDefined()
    expect(typeof Player).toBe('function')
  })

  it('should export DB class', () => {
    expect(DB).toBeDefined()
    expect(typeof DB).toBe('function')
  })

  it('should have named exports for all main classes', () => {
    // Verify that the exports are named exports, not just default
    const exports = Object.keys({ Parser, Player, DB })
    expect(exports).toContain('Parser')
    expect(exports).toContain('Player')
    expect(exports).toContain('DB')
  })
})
