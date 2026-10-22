import { describe, expect, expectTypeOf, it } from 'vitest'

import * as root from '../../src/index'
import type {
  DBOptions,
  ParserConfigOptions,
  PlayerConfig,
  PlayerConfigOptions,
  PlayerState,
  Video,
} from '../../src/index'

describe('public entry', () => {
  it('exposes exactly the documented runtime API', () => {
    expect(Object.keys(root).sort()).toEqual(['DB', 'Parser', 'Player'])
  })

  it('keeps the documented prototype methods', () => {
    expect(typeof root.Parser.prototype.load).toBe('function')
    expect(typeof root.Parser.prototype.destroy).toBe('function')

    const playerMethods = [
      'mount',
      'start',
      'pause',
      'resume',
      'stop',
      'clear',
      'destroy',
      'stepToFrame',
      'setConfig',
    ] as const
    for (const method of playerMethods) {
      expect(typeof root.Player.prototype[method], method).toBe('function')
    }

    const dbMethods = ['find', 'insert', 'delete'] as const
    for (const method of dbMethods) {
      expect(typeof root.DB.prototype[method], method).toBe('function')
    }

    expect(typeof Object.getOwnPropertyDescriptor(root.Player.prototype, 'config')?.get).toBe(
      'function',
    )
    expect(typeof Object.getOwnPropertyDescriptor(root.Player.prototype, 'progress')?.get).toBe(
      'function',
    )
    expect(typeof Object.getOwnPropertyDescriptor(root.Player.prototype, 'state')?.get).toBe(
      'function',
    )
    expect(typeof Object.getOwnPropertyDescriptor(root.Player.prototype, 'isPlaying')?.get).toBe(
      'function',
    )
  })

  it('keeps the documented public types', () => {
    expectTypeOf<ParserConfigOptions>().toEqualTypeOf<{ isDisableWebWorker?: boolean }>()
    expectTypeOf<PlayerConfigOptions>().toEqualTypeOf<Partial<PlayerConfig>>()
    expectTypeOf<DBOptions>().toEqualTypeOf<{ name: string; version: number; storeName: string }>()
    expectTypeOf<Video['images']>().toMatchTypeOf<Record<string, Uint8Array>>()
    expectTypeOf<Video['size']>().toEqualTypeOf<{ width: number; height: number }>()
    expectTypeOf<PlayerState>().toEqualTypeOf<
      'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'destroyed'
    >()
  })
})
