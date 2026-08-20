import { describe, expect, it } from 'vitest'

import { runnerTimeoutFor } from '../visual/runner-client.js'

describe('isolated runner timeout budget', () => {
  it('keeps the startup budget plus every requested playback segment', () => {
    expect(runnerTimeoutFor({ maxPlaybackMs: 1_000 })).toBe(31_000)
    expect(runnerTimeoutFor({ maxPlaybackMs: 1_000, includeWarm: true })).toBe(32_000)
    expect(runnerTimeoutFor({ maxPlaybackMs: Infinity, includeWarm: true })).toBe(30_000)
  })

  it('reserves the full startup allowance before timing either playback segment', () => {
    const budget = runnerTimeoutFor({ maxPlaybackMs: 1_000, includeWarm: true })
    expect(budget - 2_000).toBe(30_000)
  })

  it('honors an explicit overall deadline so slow parsing is not mistaken for playback timeout', () => {
    expect(runnerTimeoutFor({ maxPlaybackMs: 1_000, includeWarm: true, timeoutMs: 90_000 })).toBe(90_000)
  })
})
