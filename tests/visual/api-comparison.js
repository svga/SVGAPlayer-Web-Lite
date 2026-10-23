import { aggregateRounds, compareMetric } from './comparison.js'

function sameValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function aggregateTimings(values) {
  return aggregateRounds(Array.isArray(values) ? values : [])
}

function timingDirection(metric) {
  if (metric.endsWith('Ms')) return 'lower'
  return undefined
}

// Sub-millisecond medians are dominated by timer resolution and scheduling.
// Treat them as noise instead of reporting e.g. 0 ms -> 0.02 ms as +300%.
const timingResolutionMs = 1

export function compareCaseRuns({
  definition,
  instance,
  localSupport,
  baselineSupport,
  baselineAvailable,
  local,
  baseline,
  sameVersion = false,
  rounds = 1,
}) {
  const row = {
    key: instance.key,
    caseId: definition.id,
    fixtureName: instance.fixtureName || null,
    group: definition.group,
    name: definition.name,
    api: definition.api,
    versions: definition.versions,
    observationOnly: definition.observationOnly === true,
    support: {
      local: localSupport?.state || 'supported',
      baseline: baselineSupport?.state || 'supported',
    },
    local: local || null,
    baseline: baseline || null,
    timingComparisons: {},
    parity: { state: 'not-compared', local: local?.parity, baseline: baseline?.parity },
    warnings: [],
    outcome: 'pass',
    rounds,
  }

  const localStatus = local?.status
  if (localStatus === 'cancelled') {
    row.outcome = 'cancelled'
    return row
  }
  if (localStatus === 'skipped') {
    row.outcome = 'skipped'
    if (local.reason) row.warnings.push(`用例跳过：${local.reason}`)
    return row
  }
  if (localStatus !== 'passed') {
    row.outcome = 'failed'
    if (localStatus === undefined) row.warnings.push('本地版本未执行该用例')
    return row
  }
  if (localSupport && !localSupport.supported) {
    row.outcome = 'skipped'
    row.warnings.push(`本地环境不支持：${localSupport.reason}`)
    return row
  }

  if (baselineSupport?.state === 'local-only') {
    row.outcome = 'local-only'
    return row
  }
  if (!baselineAvailable) {
    row.outcome = 'baseline-unavailable'
    return row
  }
  if (baselineSupport?.state === 'unsupported') {
    row.outcome = 'baseline-unsupported'
    row.warnings.push(`基线不支持：${baselineSupport.reason}`)
    return row
  }
  if (baseline?.status === 'cancelled') {
    row.outcome = 'cancelled'
    return row
  }
  if (baseline?.status === 'skipped' || baseline?.status === 'unsupported') {
    row.outcome = 'baseline-unsupported'
    return row
  }
  if (baseline?.status !== 'passed') {
    row.outcome = 'baseline-failed'
    return row
  }

  if (!sameValue(local.parity, baseline.parity)) {
    row.parity.state = 'mismatch'
    row.outcome = 'parity-mismatch'
    return row
  }
  row.parity.state = 'match'

  if (row.observationOnly) {
    row.outcome = 'observation'
    for (const metric of definition.timingMetrics) {
      row.timingComparisons[metric] = comparisonFor(metric, baseline, local, sameVersion)
    }
    return row
  }

  if (definition.timingMetrics.length === 0) {
    row.outcome = 'pass'
    return row
  }

  const outcomes = []
  for (const metric of definition.timingMetrics) {
    const comparison = comparisonFor(metric, baseline, local, sameVersion)
    row.timingComparisons[metric] = comparison
    outcomes.push(comparison.outcome)
    if (comparison.relativeMadWarning) {
      row.warnings.push(`${metric} 的相对 MAD 超过 10%，样本波动较大`)
    }
  }
  if (outcomes.includes('regression')) row.outcome = 'regression'
  else if (outcomes.every((outcome) => outcome === 'limited')) row.outcome = 'limited'
  else if (outcomes.includes('improvement')) row.outcome = 'improvement'
  else if (outcomes.includes('within-band')) row.outcome = 'within-band'
  else row.outcome = 'pass'
  return row
}

function comparisonFor(metric, baseline, local, sameVersion) {
  const baselineValues = baseline?.timings?.[metric]
  const localValues = local?.timings?.[metric]
  const comparison = compareMetric(metric, baselineValues || [], localValues || [], {
    direction: timingDirection(metric),
  })
  const baselineAggregate = aggregateTimings(baselineValues)
  const localAggregate = aggregateTimings(localValues)
  const result = {
    ...comparison,
    baseline: baselineAggregate,
    local: localAggregate,
    sameVersion,
  }
  if (sameVersion && result.outcome !== 'limited') {
    result.outcome = 'within-band'
    result.sameVersion = true
  }
  if (
    timingDirection(metric) === 'lower' &&
    Number.isFinite(baselineAggregate.median) &&
    Number.isFinite(localAggregate.median) &&
    Math.max(baselineAggregate.median, localAggregate.median) < timingResolutionMs
  ) {
    result.outcome = 'within-band'
    result.resolutionLimited = true
  }
  result.relativeMadWarning =
    (baselineAggregate.relativeMad || 0) > 0.1 || (localAggregate.relativeMad || 0) > 0.1
  return result
}

export function summarizeApiCases(rows, { cancelled = false, baselineAvailable = true } = {}) {
  const summary = {
    total: rows.length,
    passed: 0,
    failed: 0,
    localOnly: 0,
    baselineUnsupported: 0,
    baselineUnavailable: 0,
    parityMismatch: 0,
    baselineFailure: 0,
    regressions: 0,
    improvements: 0,
    withinBand: 0,
    limited: 0,
    observation: 0,
    skipped: 0,
    cancelled: 0,
    verdict: 'pass',
  }
  for (const row of rows) {
    switch (row.outcome) {
      case 'failed':
        summary.failed++
        break
      case 'parity-mismatch':
        summary.parityMismatch++
        summary.failed++
        break
      case 'local-only':
        summary.localOnly++
        break
      case 'baseline-unsupported':
        summary.baselineUnsupported++
        break
      case 'baseline-unavailable':
        summary.baselineUnavailable++
        break
      case 'baseline-failed':
        summary.baselineFailure++
        break
      case 'regression':
        summary.regressions++
        break
      case 'improvement':
        summary.improvements++
        summary.passed++
        break
      case 'within-band':
        summary.withinBand++
        summary.passed++
        break
      case 'limited':
        summary.limited++
        break
      case 'observation':
        summary.observation++
        break
      case 'skipped':
        summary.skipped++
        break
      case 'cancelled':
        summary.cancelled++
        break
      case 'pass':
        summary.passed++
        break
      default:
        summary.failed++
    }
  }
  if (cancelled) summary.verdict = 'cancelled'
  else if (summary.failed > 0) summary.verdict = 'fail'
  else if (!baselineAvailable && summary.total > 0) summary.verdict = 'local-only'
  else if (summary.regressions > 0 || summary.baselineFailure > 0 || summary.limited > 0)
    summary.verdict = 'review'
  else if (summary.total > 0 && summary.localOnly === summary.total) summary.verdict = 'local-only'
  else summary.verdict = 'pass'
  return summary
}

export function buildCaseTimings(rows) {
  const timings = {}
  for (const row of rows) {
    if (!row.local && !row.baseline) continue
    const entry = {}
    for (const [metric, comparison] of Object.entries(row.timingComparisons || {})) {
      entry[metric] = {
        local: comparison.local,
        baseline: comparison.baseline,
        comparison: {
          direction: comparison.direction,
          outcome: comparison.outcome,
          absoluteDelta: comparison.absoluteDelta,
          percentDelta: comparison.percentDelta,
          bandPercent: comparison.bandPercent,
          sameVersion: comparison.sameVersion === true,
          limited: comparison.outcome === 'limited',
          resolutionLimited: comparison.resolutionLimited === true,
        },
      }
    }
    if (Object.keys(entry).length > 0) timings[row.key] = entry
  }
  return timings
}

export function apiComparisonWarnings({ rounds, sameVersion, baselineAvailable, rows = [] }) {
  const warnings = []
  if (!baselineAvailable) warnings.push('基线运行时不可用：仅运行本地套件，不做跨版本计时比较。')
  if (sameVersion) warnings.push('基线与本地版本相同，计时差异只代表同版本噪声，不作为回退结论。')
  if (
    rows.some((row) => row.timingComparisons && Object.keys(row.timingComparisons).length > 0) &&
    rounds === 1
  )
    warnings.push('单轮计时为方向性数据；请使用 3 轮或 5 轮复测后再判断趋势。')
  const noisy = rows.flatMap((row) =>
    Object.entries(row.timingComparisons || {})
      .filter(([, comparison]) => comparison.relativeMadWarning)
      .map(([metric]) => `${row.key}:${metric}`),
  )
  if (noisy.length > 0)
    warnings.push(`${noisy.length} 个计时指标相对 MAD 超过 10%，相关结论仅供观察。`)
  const resolutionLimited = rows.flatMap((row) =>
    Object.entries(row.timingComparisons || {})
      .filter(([, comparison]) => comparison.resolutionLimited)
      .map(([metric]) => `${row.key}:${metric}`),
  )
  if (resolutionLimited.length > 0)
    warnings.push(
      `${resolutionLimited.length} 个计时指标低于 1 ms，受计时分辨率限制，按波动带内处理。`,
    )
  return warnings
}

export function createApiReport({
  schemaVersion = 1,
  runtimes,
  environment,
  config,
  rows,
  warnings,
  startedAt,
  finishedAt,
  cancelled,
  baselineAvailable,
}) {
  const summary = summarizeApiCases(rows, { cancelled, baselineAvailable })
  return {
    schemaVersion,
    kind: 'api-lab',
    createdAt: finishedAt || new Date().toISOString(),
    startedAt: startedAt || null,
    runId: config?.runId || null,
    runtimes,
    environment,
    config,
    cases: rows.map((row) => ({
      key: row.key,
      id: row.caseId,
      group: row.group,
      name: row.name,
      api: row.api,
      versions: row.versions,
      fixture: row.fixtureName,
      support: row.support,
      outcome: row.outcome,
      parity: row.parity,
      warnings: row.warnings,
      local: row.local,
      baseline: row.baseline,
      timings: row.timingComparisons,
    })),
    timings: buildCaseTimings(rows),
    summary,
    warnings: warnings || [],
  }
}
