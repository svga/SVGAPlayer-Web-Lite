const lowerBetterMetrics = new Set([
  'runtimeLoadMs', 'runtimeReadyMs', 'playerReadyMs', 'parseMs', 'mountMs', 'startMs', 'firstPaintMs', 'readyMs',
  'skippedFrames', 'skippedRate', 'lateFrames', 'lateRate', 'intervalAverageMs', 'intervalP50Ms',
  'intervalP95Ms', 'intervalP99Ms', 'intervalMaxMs', 'jitterMs', 'longTaskCount',
  'longTaskTotalMs', 'longTaskMaxMs', 'blockingMs'
])

function finiteValues (values) {
  return values.filter(value => typeof value === 'number' && Number.isFinite(value))
}

export function median (values) {
  const sorted = finiteValues(values).sort((first, second) => first - second)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function relativeMad (values) {
  const center = median(values)
  if (center === null) return null
  const deviation = median(finiteValues(values).map(value => Math.abs(value - center)))
  if (deviation === null || deviation === 0) return 0
  return center === 0 ? 1 : deviation / Math.abs(center)
}

export function aggregateRounds (values) {
  const samples = finiteValues(values)
  return { samples: samples.length, median: median(samples), relativeMad: relativeMad(samples) }
}

export function aggregateVersionRounds (rounds, metric) {
  const read = typeof metric === 'function'
    ? metric
    : round => String(metric).split('.').reduce((value, key) => value?.[key], round)
  return aggregateRounds(rounds.map(read))
}

function aggregateValue (value) {
  if (Array.isArray(value)) return aggregateRounds(value)
  return value && typeof value === 'object' && Number.isFinite(value.median)
    ? value
    : aggregateRounds([])
}

export function comparisonBand (baseline, local) {
  const baselineMad = baseline.relativeMad || 0
  const localMad = local.relativeMad || 0
  return Math.max(0.05, 2 * Math.max(baselineMad, localMad))
}

export function metricDirection (name) {
  if (name.startsWith('heap')) return 'approximate'
  if (name === 'actualFps') return 'target-distance'
  return lowerBetterMetrics.has(name) ? 'lower' : 'higher'
}

export function compareMetric (name, baselineInput, localInput, options = {}) {
  const baseline = aggregateValue(baselineInput)
  const local = aggregateValue(localInput)
  const direction = metricDirection(name)
  const targetFps = options.targetFps
  const baselineMedian = baseline.median
  const localMedian = local.median
  if (baselineMedian === null || localMedian === null) {
    return {
      name, direction, baseline, local, baselineValue: baselineMedian, localValue: localMedian,
      absoluteDelta: null, percentDelta: null, bandPercent: comparisonBand(baseline, local), outcome: 'limited'
    }
  }
  if (direction === 'target-distance' && !Number.isFinite(targetFps)) {
    return {
      name, direction, baseline, local, baselineValue: baselineMedian, localValue: localMedian,
      absoluteDelta: null, percentDelta: null, bandPercent: comparisonBand(baseline, local), outcome: 'limited'
    }
  }
  if (direction === 'approximate') {
    const absoluteDelta = localMedian - baselineMedian
    return {
      name,
      direction,
      baseline,
      local,
      baselineValue: baselineMedian,
      localValue: localMedian,
      absoluteDelta,
      percentDelta: baselineMedian === 0 ? null : absoluteDelta / Math.abs(baselineMedian),
      bandPercent: comparisonBand(baseline, local),
      outcome: 'limited',
      approximate: true
    }
  }
  const baselineValue = direction === 'target-distance' ? Math.abs(baselineMedian - targetFps) : baselineMedian
  const localValue = direction === 'target-distance' ? Math.abs(localMedian - targetFps) : localMedian
  const absoluteDelta = localValue - baselineValue
  const percentDelta = baselineValue === 0 ? null : absoluteDelta / Math.abs(baselineValue)
  const bandPercent = comparisonBand(baseline, local)
  const threshold = Math.abs(baselineValue) * bandPercent
  const worsened = direction === 'higher' ? -absoluteDelta > threshold : absoluteDelta > threshold
  const improved = direction === 'higher' ? absoluteDelta > threshold : -absoluteDelta > threshold
  return {
    name,
    direction,
    baseline,
    local,
    baselineValue,
    localValue,
    absoluteDelta,
    percentDelta,
    bandPercent,
    outcome: worsened ? 'regression' : improved ? 'improvement' : 'within-band'
  }
}

function sameValue (left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

const profileCoreFields = [
  'fileBytes', 'width', 'height', 'pixels', 'fps', 'frames', 'durationMs', 'images',
  'imageBytes', 'sprites', 'spriteFrames', 'shapes', 'rgbaBytes'
]

function sameProfile (baseline, local) {
  return profileCoreFields.every(field => Number.isFinite(baseline?.[field]) && Number.isFinite(local?.[field]) && baseline[field] === local[field])
}

function sameVisual (baseline, local) {
  return baseline.rgbaHash === local.rgbaHash &&
    baseline.width === local.width && baseline.height === local.height &&
    baseline.nonEmptyPixels === local.nonEmptyPixels
}

function successful (result) {
  return result?.status === 'completed' || result?.status === 'sampled'
}

export function compareCorrectness ({ baseline, local }) {
  const baselineSuccess = successful(baseline)
  const localSuccess = successful(local)
  if (baseline?.limited || local?.limited || baseline?.sampleSufficient === false || local?.sampleSufficient === false) {
    return { state: 'limited', performanceComparable: false }
  }
  if (baseline?.status === 'expected-rejection' && local?.status === 'expected-rejection') {
    return { state: 'expected-rejection', performanceComparable: false }
  }
  if (!baselineSuccess && !localSuccess) return { state: 'both-failed', performanceComparable: false }
  if (baselineSuccess && !localSuccess) return { state: 'local-regression', performanceComparable: false }
  if (!baselineSuccess || !localSuccess) return { state: 'capability-change', performanceComparable: false }
  if (!sameValue(baseline.capabilities, local.capabilities)) return { state: 'capability-change', performanceComparable: false }
  if (!baseline.profile || !local.profile || !profileCoreFields.every(field => Number.isFinite(baseline.profile[field]) && Number.isFinite(local.profile[field]))) {
    return { state: 'limited', performanceComparable: false }
  }
  if (!sameProfile(baseline.profile, local.profile)) return { state: 'metadata-change', performanceComparable: false }
  if (!baseline.visual || !local.visual || baseline.visual.frame !== local.visual.frame) {
    return { state: 'limited', performanceComparable: false }
  }
  if (!sameVisual(baseline.visual, local.visual)) return { state: 'visual-change', performanceComparable: false }
  return { state: 'match', performanceComparable: true }
}
