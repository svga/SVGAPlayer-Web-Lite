import { describe, expect, it } from 'vitest'

import { DBError, ParserError, PlayerError, SVGAError, VideoError } from '../../src/internal/errors'

describe('typed errors', () => {
  it('keeps the public Error name while exposing a code', () => {
    const error = new ParserError('parser/timeout', '[SVGA Parser Error] Request timeout')
    expect(error).toBeInstanceOf(SVGAError)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('Error')
    expect(error.message).toBe('[SVGA Parser Error] Request timeout')
    expect(error.code).toBe('parser/timeout')
    expect(error.cause).toBeUndefined()
  })

  it('records an optional cause', () => {
    const cause = new Error('underlying')
    const error = new VideoError('video/header', 'Invalid SVGA video: header', cause)
    expect(error.cause).toBe(cause)
  })

  it('provides a class per domain', () => {
    expect(new PlayerError('player/config', 'loop')).toBeInstanceOf(SVGAError)
    expect(new DBError('db/failure', 'IndexedDB operation failed')).toBeInstanceOf(SVGAError)
  })
})
