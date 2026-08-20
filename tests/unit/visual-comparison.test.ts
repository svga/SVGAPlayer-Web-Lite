import { describe, expect, it } from 'vitest'

import {
  aggregateRounds,
  aggregateVersionRounds,
  compareCorrectness,
  compareMetric,
  median,
  relativeMad
} from '../visual/comparison.js'
import { comparisonCorrectness, warmComparisonAggregates, warmComparisonMetrics, warmComparisonCorrectness } from '../visual/comparison-orchestrator.js'

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
    expect(compareMetric('playerReadyMs', aggregateRounds([100]), aggregateRounds([120])).direction).toBe('lower')
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

  it('keeps heap readings as approximate trends instead of performance verdicts', () => {
    const result = compareMetric('heapDeltaBytes', aggregateRounds([100]), aggregateRounds([10]))
    expect(result).toMatchObject({ direction: 'approximate', outcome: 'limited', approximate: true })
  })
})

describe('visual comparison correctness states', () => {
  const successful = {
    status: 'completed',
    profile: {
      fileBytes: 10, width: 100, height: 100, pixels: 10_000, fps: 20, frames: 10, durationMs: 500,
      images: 1, imageBytes: 10, sprites: 1, spriteFrames: 10, shapes: 1, rgbaBytes: 40_000
    },
    visual: { rgbaHash: 'aa', frame: 0, width: 100, height: 100, nonEmptyPixels: 20 }
  }

  it.each([
    ['match', successful, successful, true],
    ['expected-rejection', { status: 'expected-rejection' }, { status: 'expected-rejection' }, false],
    ['local-regression', successful, { status: 'failed' }, false],
    ['capability-change', successful, { ...successful, capabilities: { imageBitmap: false } }, false],
    ['metadata-change', successful, { ...successful, profile: { ...successful.profile, frames: 11 } }, false],
    ['limited', successful, { ...successful, profile: undefined }, false],
    ['visual-change', successful, { ...successful, visual: { ...successful.visual, rgbaHash: 'bb' } }, false],
    ['limited', successful, { ...successful, visual: undefined }, false],
    ['limited', successful, { ...successful, visual: { ...successful.visual, frame: 1 } }, false],
    ['limited', { ...successful, limited: true }, successful, false],
    ['both-failed', { status: 'failed' }, { status: 'failed' }, false]
  ])('classifies %s', (state, baseline, local, performanceComparable) => {
    expect(compareCorrectness({ baseline, local })).toEqual({ state, performanceComparable })
  })

  it.each([
    ['rgbaHash', 'bb'], ['nonEmptyPixels', 21], ['width', 101], ['height', 101]
  ])('marks same-frame visual %s changes as visual-change', (field, value) => {
    const local = { ...successful, visual: { ...successful.visual, [field]: value } }
    expect(compareCorrectness({ baseline: successful, local })).toEqual({ state: 'visual-change', performanceComparable: false })
  })

  it('treats incomplete profiles as limited instead of a match', () => {
    const incomplete = { status: 'completed', profile: { width: 100 }, visual: successful.visual, capabilities: undefined }
    expect(compareCorrectness({ baseline: incomplete, local: incomplete })).toEqual({ state: 'limited', performanceComparable: false })
  })

  it('matches profiles when only the legacy baseline image byte count is unavailable', () => {
    const legacyBaseline = { ...successful, profile: { ...successful.profile, imageBytes: null } }
    expect(compareCorrectness({ baseline: legacyBaseline, local: successful })).toEqual({ state: 'match', performanceComparable: true })
  })

  it.each([
    ['width', 101], ['fps', 21], ['frames', 11], ['images', 2], ['sprites', 2], ['shapes', 2]
  ])('keeps %s profile changes as metadata-change when image bytes are unavailable', (field, value) => {
    const legacyBaseline = { ...successful, profile: { ...successful.profile, imageBytes: null } }
    const local = { ...successful, profile: { ...successful.profile, [field]: value } }
    expect(compareCorrectness({ baseline: legacyBaseline, local })).toEqual({ state: 'metadata-change', performanceComparable: false })
  })

  it('prioritizes metadata and visual changes ahead of capability changes', () => {
    const metadataAndCapability = {
      ...successful,
      profile: { ...successful.profile, frames: 11 },
      capabilities: { imageBitmap: false }
    }
    const visualAndCapability = {
      ...successful,
      visual: { ...successful.visual, rgbaHash: 'bb' },
      capabilities: { imageBitmap: false }
    }
    expect(compareCorrectness({ baseline: successful, local: metadataAndCapability }).state).toBe('metadata-change')
    expect(compareCorrectness({ baseline: successful, local: visualAndCapability }).state).toBe('visual-change')
  })
})

describe('visual comparison round summaries', () => {
  const profile = {
    fileBytes: 10, width: 100, height: 100, pixels: 10_000, fps: 20, frames: 10, durationMs: 500,
    images: 1, imageBytes: 10, sprites: 1, spriteFrames: 10, shapes: 1, rgbaBytes: 40_000
  }
  const matching = {
    status: 'completed', profile, capabilities: { worker: true },
    visual: { rgbaHash: 'aa', frame: 0, width: 100, height: 100, nonEmptyPixels: 20 },
    warm: {
      status: 'sampled', sampleSufficient: true, startMs: 1, firstPaintMs: 2,
      visual: { rgbaHash: 'aa', frame: 0, width: 100, height: 100, nonEmptyPixels: 20 },
      playback: { targetFps: 20, actualFps: 20, skippedFrames: 0, skippedRate: 0, lateRate: 0, intervalP95Ms: 50, jitterMs: 0 },
      runtime: { longTaskTotalMs: 0, longTaskMaxMs: 0, blockingMs: 0, heapDeltaBytes: 1 }
    }
  }

  it('retains an early local regression even when later round pairs match', () => {
    const rounds = {
      baseline: [matching, matching, matching],
      local: [{ ...matching, status: 'failed' }, matching, matching]
    }
    expect(comparisonCorrectness(rounds)).toEqual({ state: 'local-regression', performanceComparable: false })
  })

  it('returns expected rejection only when every complete pair is expected', () => {
    const expected = { status: 'expected-rejection' }
    expect(comparisonCorrectness({ baseline: [expected, expected], local: [expected, expected] }))
      .toEqual({ state: 'expected-rejection', performanceComparable: false })
  })

  it('prioritizes an actual two-version failure over metadata review changes', () => {
    const failed = { status: 'failed' }
    expect(comparisonCorrectness({ baseline: [{ ...matching, profile: { ...profile, frames: 11 } }, failed], local: [matching, failed] }))
      .toEqual({ state: 'both-failed', performanceComparable: false })
  })

  it('keeps warm correctness separate from a matching cold result', () => {
    const coldMatchWarmVisualChange = {
      baseline: [matching],
      local: [{ ...matching, warm: { ...matching.warm, visual: { ...matching.warm.visual, rgbaHash: 'bb' } } }]
    }
    expect(comparisonCorrectness(coldMatchWarmVisualChange)).toEqual({ state: 'match', performanceComparable: true })
    expect(warmComparisonCorrectness(coldMatchWarmVisualChange)).toEqual({ state: 'visual-change', performanceComparable: false })
  })

  it.each([
    ['missing', { ...matching, warm: undefined }, 'limited'],
    ['insufficient', { ...matching, warm: { ...matching.warm, sampleSufficient: false } }, 'limited'],
    ['local failure', { ...matching, warm: { ...matching.warm, status: 'failed' } }, 'local-regression']
  ])('marks %s warm data independently', (_, local, state) => {
    expect(warmComparisonCorrectness({ baseline: [matching], local: [local] })).toEqual({ state, performanceComparable: false })
  })

  it('aggregates and compares warm-only start, playback, and runtime metrics', () => {
    const rounds = { baseline: [matching], local: [{ ...matching, warm: { ...matching.warm, startMs: 3 } }] }
    expect(warmComparisonAggregates(rounds).baseline.startMs.median).toBe(1)
    expect(warmComparisonMetrics(rounds, 20).startMs.outcome).toBe('regression')
    expect(warmComparisonMetrics(rounds, 20).heapDeltaBytes.outcome).toBe('limited')
  })
})
