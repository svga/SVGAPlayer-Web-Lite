import { describe, expect, it } from 'vitest'

import {
  aggregateRounds,
  aggregateVersionRounds,
  compareCorrectness,
  compareMetric,
  median,
  relativeMad
} from '../visual/comparison.js'

describe('visual comparison statistics', () => {
  it('uses the middle value for odd, even, and singleton rounds', () => {
    expect(median([9, 1, 5])).toBe(5)
    expect(median([9, 1, 5, 3])).toBe(4)
    expect(median([7])).toBe(7)
  })

  it('expresses median absolute deviation relative to the median', () => {
    expect(relativeMad([90, 100, 110])).toBe(0.1)
    expect(relativeMad([0, 0, 0])).toBe(0)
    expect(aggregateRounds([10, 11, 9])).toEqual({ samples: 3, median: 10, relativeMad: 0.1 })
    expect(aggregateVersionRounds([{ startup: { parseMs: 7 } }, { startup: { parseMs: 9 } }, { startup: { parseMs: 8 } }], 'startup.parseMs'))
      .toEqual({ samples: 3, median: 8, relativeMad: 0.125 })
  })

  it('flags a lower-is-better timing regression outside the noise band', () => {
    const result = compareMetric('parseMs', aggregateRounds([100, 101, 99]), aggregateRounds([112, 111, 113]))
    expect(result.bandPercent).toBe(0.05)
    expect(result.direction).toBe('lower')
    expect(result.outcome).toBe('regression')
  })

  it('preserves a zero baseline as an absolute-only difference', () => {
    const result = compareMetric('skippedFrames', aggregateRounds([0, 0, 0]), aggregateRounds([2, 2, 2]))
    expect(result.absoluteDelta).toBe(2)
    expect(result.percentDelta).toBeNull()
    expect(result.outcome).toBe('regression')
  })

  it('compares actual FPS by absolute distance from the target', () => {
    const result = compareMetric(
      'actualFps',
      aggregateRounds([29, 30, 31]),
      aggregateRounds([24, 25, 26]),
      { targetFps: 30 }
    )
    expect(result.direction).toBe('target-distance')
    expect(result.baselineValue).toBe(0)
    expect(result.localValue).toBe(5)
    expect(result.outcome).toBe('regression')
  })
})

describe('visual comparison correctness states', () => {
  const successful = { status: 'completed', metadata: { frames: 10 }, visual: { hash: 'aa', frame: 0 } }

  it.each([
    ['match', successful, successful, true],
    ['expected-rejection', { status: 'expected-rejection' }, { status: 'expected-rejection' }, false],
    ['local-regression', successful, { status: 'failed' }, false],
    ['capability-change', successful, { ...successful, capabilities: { imageBitmap: false } }, false],
    ['metadata-change', successful, { ...successful, metadata: { frames: 11 } }, false],
    ['visual-change', successful, { ...successful, visual: { hash: 'bb', frame: 0 } }, false],
    ['limited', { ...successful, limited: true }, successful, false],
    ['both-failed', { status: 'failed' }, { status: 'failed' }, false]
  ])('classifies %s', (state, baseline, local, performanceComparable) => {
    expect(compareCorrectness({ baseline, local })).toEqual({ state, performanceComparable })
  })
})
