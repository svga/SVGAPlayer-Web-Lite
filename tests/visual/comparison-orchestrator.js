import { aggregateVersionRounds, compareCorrectness, compareMetric, compareWarmCorrectness } from './comparison.js'

const playbackMetricNames = [
  'actualFps', 'activeDurationMs', 'updateCount', 'advancedFrames', 'skippedFrames', 'skippedRate',
  'intervalAverageMs', 'intervalP50Ms', 'intervalP95Ms', 'intervalP99Ms', 'intervalMaxMs', 'jitterMs',
  'lateFrames', 'lateRate', 'rafFps'
]
const runtimeMetricNames = ['longTaskCount', 'longTaskTotalMs', 'longTaskMaxMs', 'blockingMs']
const heapMetricNames = ['heapBeforeBytes', 'heapMountBytes', 'heapAfterBytes', 'heapPeakBytes', 'heapDeltaBytes']
const prefixedMetrics = (prefix, names) => names.map(name => [name, `${prefix}.${name}`])

const metricPaths = [
  ['runtimeLoadMs', 'startup.runtimeLoadMs'], ['parseMs', 'startup.parseMs'], ['mountMs', 'startup.mountMs'],
  ['startMs', 'startup.startMs'], ['firstPaintMs', 'startup.firstPaintMs'], ['playerReadyMs', 'startup.playerReadyMs'],
  ['runtimeReadyMs', 'startup.runtimeReadyMs'],
  ...prefixedMetrics('playback', playbackMetricNames),
  ...prefixedMetrics('runtime', runtimeMetricNames),
  ...prefixedMetrics('runtime', heapMetricNames)
]

const warmMetricPaths = [
  ['startMs', 'warm.startMs'], ['firstPaintMs', 'warm.firstPaintMs'],
  ...prefixedMetrics('warm.playback', playbackMetricNames),
  ...prefixedMetrics('warm.runtime', runtimeMetricNames),
  ...prefixedMetrics('warm.runtime', heapMetricNames)
]

function round (value) {
  return Number(value.toFixed(2))
}

function terminalResult (event) {
  if (event?.event === 'result') return event.result
  if (event?.event === 'cancelled') return { status: 'cancelled', warnings: ['人工取消'] }
  return { status: 'failed', error: event?.error || { stage: 'runner', message: '隔离运行器没有返回结果' }, warnings: [] }
}

export function comparisonCorrectness (rounds) {
  const pairCount = Math.min(rounds.baseline.length, rounds.local.length)
  if (pairCount === 0 || rounds.baseline.length !== rounds.local.length) return { state: 'limited', performanceComparable: false }
  const states = Array.from({ length: pairCount }, (_, index) => {
    return compareCorrectness({ baseline: rounds.baseline[index], local: rounds.local[index] }).state
  })
  if (states.every(state => state === 'expected-rejection')) return { state: 'expected-rejection', performanceComparable: false }
  if (states.every(state => state === 'match')) return { state: 'match', performanceComparable: true }
  for (const state of ['local-regression', 'both-failed', 'metadata-change', 'visual-change', 'capability-change', 'limited']) {
    if (states.includes(state)) return { state, performanceComparable: false }
  }
  return { state: 'limited', performanceComparable: false }
}

export function warmComparisonCorrectness (rounds) {
  const pairCount = Math.min(rounds.baseline.length, rounds.local.length)
  if (pairCount === 0 || rounds.baseline.length !== rounds.local.length) return { state: 'limited', performanceComparable: false }
  const states = Array.from({ length: pairCount }, (_, index) => {
    return compareWarmCorrectness({ baseline: rounds.baseline[index], local: rounds.local[index] }).state
  })
  if (states.every(state => state === 'match')) return { state: 'match', performanceComparable: true }
  for (const state of ['local-regression', 'both-failed', 'visual-change', 'limited']) {
    if (states.includes(state)) return { state, performanceComparable: false }
  }
  return { state: 'limited', performanceComparable: false }
}

export function comparisonAggregates (rounds) {
  return Object.fromEntries(['baseline', 'local'].map(runtime => [runtime, Object.fromEntries(
    metricPaths.map(([name, path]) => [name, aggregateVersionRounds(rounds[runtime], path)])
  )]))
}

export function comparisonMetrics (rounds, targetFps) {
  const aggregates = comparisonAggregates(rounds)
  return Object.fromEntries(metricPaths.map(([name]) => [name, compareMetric(name, aggregates.baseline[name], aggregates.local[name], { targetFps })]))
}

export function warmComparisonAggregates (rounds) {
  return Object.fromEntries(['baseline', 'local'].map(runtime => [runtime, Object.fromEntries(
    warmMetricPaths.map(([name, path]) => [name, aggregateVersionRounds(rounds[runtime], path)])
  )]))
}

export function warmComparisonMetrics (rounds, targetFps) {
  const aggregates = warmComparisonAggregates(rounds)
  return Object.fromEntries(warmMetricPaths.map(([name]) => [name, compareMetric(name, aggregates.baseline[name], aggregates.local[name], { targetFps })]))
}

export function comparisonSummaryWarnings (aggregates, rounds, { scope = '冷启动', directional = true } = {}) {
  const warnings = []
  if (directional && rounds === 1) warnings.push('单轮结果为方向性数据；请使用稳定 3 轮复测后再判断趋势。')
  const names = new Set([...Object.keys(aggregates?.baseline || {}), ...Object.keys(aggregates?.local || {})])
  const noisy = [...names].filter(name => {
    const baselineMad = aggregates?.baseline?.[name]?.relativeMad
    const localMad = aggregates?.local?.[name]?.relativeMad
    return (Number.isFinite(baselineMad) && baselineMad > 0.1) || (Number.isFinite(localMad) && localMad > 0.1)
  })
  if (noisy.length) warnings.push(`${scope}有 ${noisy.length} 个指标的相对 MAD 超过 10%，结果噪声较大。`)
  const insufficient = [...names].filter(name => {
    const baselineSamples = aggregates?.baseline?.[name]?.samples || 0
    const localSamples = aggregates?.local?.[name]?.samples || 0
    return baselineSamples + localSamples > 0 && (baselineSamples < rounds || localSamples < rounds)
  })
  if (insufficient.length) warnings.push(`${scope}有 ${insufficient.length} 个指标样本不足，相关结论仅供参考。`)
  return warnings
}

export class ComparisonOrchestrator {
  constructor ({ canvas, createRunner, getBuffer, getOptions, onProgress = () => {}, onVisible = () => {} }) {
    this.canvas = canvas
    this.createRunner = createRunner
    this.getBuffer = getBuffer
    this.getOptions = getOptions
    this.onProgress = onProgress
    this.onVisible = onVisible
    this.cancelled = false
    this.activeRunner = null
    this.runToken = 0
  }

  async runFixture (fixture, { fixtureIndex = 0, rounds = 1, maxPlaybackMs = 2_000, includeWarm = false, runnerOptions = {} } = {}) {
    this.cancelled = false
    const runToken = ++this.runToken
    let sharedRead
    try {
      sharedRead = await this.getBuffer(fixture)
    } catch (error) {
      if (this.cancelled || error?.name === 'AbortError') return { cancelled: true, fixture, warnings: ['人工取消：文件读取已中止。'] }
      throw error
    }
    if (this.cancelled || runToken !== this.runToken) return { cancelled: true, fixture, warnings: ['人工取消：文件读取完成后未启动运行器。'] }
    const result = {
      fixture,
      read: sharedRead.read,
      orders: [],
      rounds: { baseline: [], local: [] },
      aggregates: {},
      correctness: { state: 'limited', performanceComparable: false },
      warmCorrectness: { state: 'limited', performanceComparable: false },
      warmPerformanceComparable: false,
      metricComparisons: {},
      warmAggregates: {},
      warmMetricComparisons: {},
      warnings: []
    }
    for (let roundIndex = 0; roundIndex < rounds && !this.cancelled; roundIndex++) {
      const order = (fixtureIndex + roundIndex) % 2 === 0 ? ['baseline', 'local'] : ['local', 'baseline']
      result.orders.push(order)
      for (const runtime of order) {
        if (this.cancelled) break
        this.onProgress({ fixture, fixtureIndex, roundIndex, rounds, runtime, stage: 'ready' })
        const event = await this.runRuntime(runtime, sharedRead.buffer, fixture, {
          maxPlaybackMs,
          includeWarm,
          ...this.getOptions(),
          ...runnerOptions
        }, progress => this.onProgress({ fixture, fixtureIndex, roundIndex, rounds, runtime, ...progress }))
        const raw = terminalResult(event)
        result.rounds[runtime].push(raw)
        result.warnings.push(...(raw.warnings || []))
        if (raw.status === 'cancelled') this.cancelled = true
      }
    }
    result.warnings = [...new Set(result.warnings)]
    result.aggregates = comparisonAggregates(result.rounds)
    const targetFps = result.rounds.baseline.find(round => Number.isFinite(round?.playback?.targetFps))?.playback.targetFps
    result.metricComparisons = comparisonMetrics(result.rounds, targetFps)
    result.warmAggregates = warmComparisonAggregates(result.rounds)
    result.warmMetricComparisons = warmComparisonMetrics(result.rounds, targetFps)
    result.correctness = comparisonCorrectness(result.rounds)
    result.warmCorrectness = warmComparisonCorrectness(result.rounds)
    result.warmPerformanceComparable = result.correctness.state === 'match' && result.warmCorrectness.state === 'match'
    result.warnings.push(...comparisonSummaryWarnings(result.aggregates, rounds, { scope: `${fixture.name} 冷启动` }))
    if (includeWarm) result.warnings.push(...comparisonSummaryWarnings(result.warmAggregates, rounds, { scope: `${fixture.name} 热播放`, directional: false }))
    result.warnings = [...new Set(result.warnings)]
    if (this.cancelled || runToken !== this.runToken) return { cancelled: true, fixture, warnings: [...new Set([...result.warnings, '人工取消：未保留不完整素材。'])] }
    result.complete = result.rounds.baseline.length === rounds && result.rounds.local.length === rounds
    return result
  }

  async runRuntime (runtime, buffer, fixture, options, onEvent) {
    const runToken = this.runToken
    const runner = this.createRunner(runtime, {
      target: this.canvas,
      visible: true,
      onEvent: event => {
        if (runToken === this.runToken && event.event === 'stage') onEvent({ stage: event.stage })
      }
    })
    this.activeRunner = runner
    this.onVisible(true)
    try {
      await runner.ready
      if (this.cancelled) return await runner.cancel()
      const event = await runner.run({ buffer, fixture, options })
      return runToken === this.runToken ? event : { event: 'cancelled' }
    } catch (error) {
      return { event: 'error', error: { stage: 'startup', message: error instanceof Error ? error.message : String(error) } }
    } finally {
      runner.dispose()
      if (this.activeRunner === runner) this.activeRunner = null
      this.onVisible(false)
    }
  }

  cancel () {
    this.cancelled = true
    return this.activeRunner?.cancel()
  }
}

export function createComparisonReport ({ runtimes, environment, config, fixtures, warnings = [] }) {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    runtimes,
    environment,
    config,
    fixtures,
    warnings
  }
}

export function sharedReadResult (buffer, readMs) {
  return {
    buffer,
    read: {
      bytes: buffer.byteLength,
      readMs: round(readMs),
      throughputBytesPerSecond: Math.round(buffer.byteLength / Math.max(readMs, 0.01) * 1000)
    }
  }
}
