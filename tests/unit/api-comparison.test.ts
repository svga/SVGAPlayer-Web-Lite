import { describe, expect, it } from 'vitest'

import {
  apiComparisonWarnings,
  buildCaseTimings,
  compareCaseRuns,
  createApiReport,
  summarizeApiCases,
} from '../visual/api-comparison.js'
import type { ApiRunResult } from '../visual/api-comparison.js'

type DefinitionInput = Parameters<typeof compareCaseRuns>[0]['definition']
type CompareInput = Parameters<typeof compareCaseRuns>[0]

function definition(overrides: Partial<DefinitionInput> = {}): DefinitionInput {
  return {
    id: 'case.a',
    group: 'timing',
    name: '测试用例',
    api: 'player.test()',
    versions: 'both',
    observationOnly: false,
    timingMetrics: [],
    ...overrides,
  }
}

const instance = { key: 'case.a', caseId: 'case.a', fixtureName: null }
const supported = { state: 'supported', supported: true, reason: '' }

function result(
  status = 'passed',
  {
    parity = { video: 1 },
    timings = {},
    reason,
  }: { parity?: unknown; timings?: Record<string, number[]>; reason?: string } = {},
): ApiRunResult {
  return {
    status,
    checks: [],
    parity,
    timings,
    ...(reason === undefined ? {} : { reason }),
  }
}

function compare(overrides: Partial<CompareInput> = {}) {
  return compareCaseRuns({
    definition: definition(),
    instance,
    localSupport: supported,
    baselineSupport: supported,
    baselineAvailable: true,
    local: result(),
    baseline: result(),
    ...overrides,
  })
}

describe('API case comparison', () => {
  it('passes when both sides agree and there are no timing metrics', () => {
    const row = compare()
    expect(row.outcome).toBe('pass')
    expect(row.parity.state).toBe('match')
    expect(row.local?.status).toBe('passed')
    expect(row.baseline?.status).toBe('passed')
  })

  it('fails a local error before considering the baseline', () => {
    const row = compare({ local: result('failed') })
    expect(row.outcome).toBe('failed')
  })

  it('fails a local timeout and a missing local result', () => {
    expect(compare({ local: result('timeout') }).outcome).toBe('failed')
    const missing = compare({ local: null })
    expect(missing.outcome).toBe('failed')
    expect(missing.warnings).toContain('本地版本未执行该用例')
  })

  it('reports a skipped case instead of a failure', () => {
    const row = compare({ local: result('skipped', { reason: 'IndexedDB 不可用' }) })
    expect(row.outcome).toBe('skipped')
    expect(row.warnings[0]).toContain('IndexedDB 不可用')
  })

  it('marks local-only and 2.2.0-only cases without treating them as failures', () => {
    const row = compare({
      baselineSupport: { state: 'local-only', supported: false, reason: '仅 2.2.0' },
    })
    expect(row.outcome).toBe('local-only')
  })

  it('reports an unsupported baseline separately from a failure', () => {
    const row = compare({
      baselineSupport: { state: 'unsupported', supported: false, reason: 'Parser 进度回调' },
    })
    expect(row.outcome).toBe('baseline-unsupported')
    expect(row.warnings).toContain('基线不支持：Parser 进度回调')
  })

  it('reports baseline unavailability before capability gaps', () => {
    const row = compare({
      baselineAvailable: false,
      baselineSupport: { state: 'unsupported', supported: false, reason: 'Parser 进度回调' },
      baseline: { status: 'unavailable' },
    })
    expect(row.outcome).toBe('baseline-unavailable')
  })

  it('treats a cancelled baseline as cancelled and a failed baseline as reviewable', () => {
    expect(compare({ baseline: result('cancelled') }).outcome).toBe('cancelled')
    expect(compare({ baseline: result('failed') }).outcome).toBe('baseline-failed')
    expect(compare({ baseline: result('timeout') }).outcome).toBe('baseline-failed')
  })

  it('fails on a parity mismatch', () => {
    const row = compare({ baseline: result('passed', { parity: { video: 2 } }) })
    expect(row.outcome).toBe('parity-mismatch')
    expect(row.parity.state).toBe('mismatch')
  })

  it('compares lower-is-better timings', () => {
    const metric = definition({ timingMetrics: ['parserConstructMs'] })
    const regression = compare({
      definition: metric,
      local: result('passed', { timings: { parserConstructMs: [200, 200, 200] } }),
      baseline: result('passed', { timings: { parserConstructMs: [100, 100, 100] } }),
    })
    expect(regression.outcome).toBe('regression')
    expect(regression.timingComparisons.parserConstructMs.outcome).toBe('regression')
    expect(regression.timingComparisons.parserConstructMs.direction).toBe('lower')

    const improvement = compare({
      definition: metric,
      local: result('passed', { timings: { parserConstructMs: [50, 50, 50] } }),
      baseline: result('passed', { timings: { parserConstructMs: [100, 100, 100] } }),
    })
    expect(improvement.outcome).toBe('improvement')

    const withinBand = compare({
      definition: metric,
      local: result('passed', { timings: { parserConstructMs: [100, 100, 100] } }),
      baseline: result('passed', { timings: { parserConstructMs: [100, 100, 100] } }),
    })
    expect(withinBand.outcome).toBe('within-band')
  })

  it('treats sub-millisecond medians as timer-resolution noise', () => {
    const row = compare({
      definition: definition({ timingMetrics: ['setConfigMs'] }),
      local: result('passed', { timings: { setConfigMs: [0.05, 0.05, 0.05] } }),
      baseline: result('passed', { timings: { setConfigMs: [0, 0, 0] } }),
    })
    expect(row.outcome).toBe('within-band')
    expect(row.timingComparisons.setConfigMs.resolutionLimited).toBe(true)
    expect(
      apiComparisonWarnings({ rounds: 3, baselineAvailable: true, rows: [row] }).some((warning) =>
        warning.includes('低于 1 ms'),
      ),
    ).toBe(true)
  })

  it('forces same-version timings into the band instead of claiming a regression', () => {
    const row = compare({
      definition: definition({ timingMetrics: ['parserConstructMs'] }),
      sameVersion: true,
      local: result('passed', { timings: { parserConstructMs: [300, 300, 300] } }),
      baseline: result('passed', { timings: { parserConstructMs: [100, 100, 100] } }),
    })
    expect(row.outcome).toBe('within-band')
    expect(row.timingComparisons.parserConstructMs.outcome).toBe('within-band')
    expect(row.timingComparisons.parserConstructMs.sameVersion).toBe(true)
  })

  it('marks observation cases as observations and keeps their samples', () => {
    const row = compare({
      definition: definition({
        timingMetrics: ['actualFps'],
        observationOnly: true,
      }),
      local: result('passed', { timings: { actualFps: [60, 59, 61] } }),
      baseline: result('passed', { timings: { actualFps: [60, 60, 60] } }),
    })
    expect(row.outcome).toBe('observation')
    expect(row.timingComparisons.actualFps.local.median).toBe(60)
    expect(row.timingComparisons.actualFps.outcome).not.toBe('regression')
  })

  it('marks every missing sample as limited and warns about noisy samples', () => {
    const limited = compare({
      definition: definition({ timingMetrics: ['mountMs'] }),
    })
    expect(limited.outcome).toBe('limited')

    const noisy = compare({
      definition: definition({ timingMetrics: ['mountMs'] }),
      local: result('passed', { timings: { mountMs: [10, 20, 30] } }),
      baseline: result('passed', { timings: { mountMs: [10, 20, 30] } }),
    })
    expect(noisy.warnings.some((warning) => warning.includes('相对 MAD 超过 10%'))).toBe(true)
  })
})

describe('API summary', () => {
  const outcomes = (...values: string[]) => values.map((outcome) => ({ outcome }))

  it('counts every outcome family', () => {
    const summary = summarizeApiCases(
      outcomes(
        'pass',
        'within-band',
        'improvement',
        'failed',
        'parity-mismatch',
        'local-only',
        'baseline-unsupported',
        'baseline-unavailable',
        'baseline-failed',
        'regression',
        'limited',
        'observation',
        'skipped',
        'cancelled',
      ),
    )
    expect(summary.total).toBe(14)
    expect(summary.passed).toBe(3)
    expect(summary.failed).toBe(2)
    expect(summary.parityMismatch).toBe(1)
    expect(summary.localOnly).toBe(1)
    expect(summary.baselineUnsupported).toBe(1)
    expect(summary.baselineUnavailable).toBe(1)
    expect(summary.baselineFailure).toBe(1)
    expect(summary.regressions).toBe(1)
    expect(summary.limited).toBe(1)
    expect(summary.observation).toBe(1)
    expect(summary.skipped).toBe(1)
    expect(summary.cancelled).toBe(1)
    expect(summary.verdict).toBe('fail')
  })

  it('derives the verdict from failures, review signals, availability and cancellation', () => {
    expect(summarizeApiCases(outcomes('pass')).verdict).toBe('pass')
    expect(summarizeApiCases(outcomes('failed')).verdict).toBe('fail')
    expect(summarizeApiCases(outcomes('parity-mismatch')).verdict).toBe('fail')
    expect(summarizeApiCases(outcomes('regression')).verdict).toBe('review')
    expect(summarizeApiCases(outcomes('baseline-failed')).verdict).toBe('review')
    expect(summarizeApiCases(outcomes('limited')).verdict).toBe('review')
    expect(summarizeApiCases(outcomes('local-only', 'local-only')).verdict).toBe('local-only')
    expect(
      summarizeApiCases(outcomes('baseline-unavailable'), { baselineAvailable: false }).verdict,
    ).toBe('local-only')
    expect(summarizeApiCases(outcomes('failed'), { cancelled: true }).verdict).toBe('cancelled')
    expect(summarizeApiCases([]).verdict).toBe('pass')
  })
})

describe('API report', () => {
  const rows = [
    compare({
      definition: definition({
        id: 'case.a',
        timingMetrics: ['parserConstructMs'],
      }),
      instance: { key: 'case.a', caseId: 'case.a', fixtureName: null },
      local: result('passed', { timings: { parserConstructMs: [100, 100, 100] } }),
      baseline: result('passed', { timings: { parserConstructMs: [100, 100, 100] } }),
    }),
  ]

  it('builds comparable timing entries', () => {
    const timings = buildCaseTimings(rows)
    expect(Object.keys(timings)).toEqual(['case.a'])
    expect(timings['case.a'].parserConstructMs.local.median).toBe(100)
    expect(timings['case.a'].parserConstructMs.comparison.outcome).toBe('within-band')
  })

  it('serializes the run into a stable report shape', () => {
    const report = createApiReport({
      runtimes: { local: { version: '2.2.0' }, baseline: { version: '2.1.1' } },
      environment: { worker: true },
      config: { runId: 'run-1', rounds: 1 },
      rows,
      warnings: ['warn'],
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      cancelled: false,
      baselineAvailable: true,
    })
    expect(report).toMatchObject({
      schemaVersion: 1,
      kind: 'api-lab',
      createdAt: '2026-01-01T00:00:01.000Z',
      startedAt: '2026-01-01T00:00:00.000Z',
      runId: 'run-1',
      warnings: ['warn'],
    })
    expect(report.cases).toHaveLength(1)
    expect(report.cases[0]).toMatchObject({
      id: 'case.a',
      fixture: null,
      outcome: 'within-band',
    })
    expect(report.timings['case.a']).toBeDefined()
    expect(report.summary.passed).toBe(1)
  })
})

describe('API warnings', () => {
  const timedRow = {
    key: 'case.a',
    timingComparisons: { mountMs: { relativeMadWarning: true } },
  }

  it('warns about missing baselines and same-version runs', () => {
    expect(apiComparisonWarnings({ rounds: 3, baselineAvailable: false })).toContain(
      '基线运行时不可用：仅运行本地套件，不做跨版本计时比较。',
    )
    expect(
      apiComparisonWarnings({ rounds: 3, baselineAvailable: true, sameVersion: true }),
    ).toContain('基线与本地版本相同，计时差异只代表同版本噪声，不作为回退结论。')
  })

  it('warns about single-round statistics and noisy metrics', () => {
    const warnings = apiComparisonWarnings({
      rounds: 1,
      baselineAvailable: true,
      rows: [timedRow],
    })
    expect(warnings.some((warning) => warning.includes('方向性数据'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('相对 MAD 超过 10%'))).toBe(true)
  })
})
