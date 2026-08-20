import { aggregateVersionRounds, compareCorrectness, compareMetric, compareWarmCorrectness } from './comparison.js'

const metricPaths = [
  ['runtimeLoadMs', 'startup.runtimeLoadMs'], ['parseMs', 'startup.parseMs'], ['mountMs', 'startup.mountMs'],
  ['startMs', 'startup.startMs'], ['firstPaintMs', 'startup.firstPaintMs'], ['playerReadyMs', 'startup.playerReadyMs'],
  ['runtimeReadyMs', 'startup.runtimeReadyMs'], ['actualFps', 'playback.actualFps'], ['skippedFrames', 'playback.skippedFrames'],
  ['skippedRate', 'playback.skippedRate'], ['lateRate', 'playback.lateRate'], ['intervalP95Ms', 'playback.intervalP95Ms'],
  ['jitterMs', 'playback.jitterMs'], ['longTaskTotalMs', 'runtime.longTaskTotalMs'], ['longTaskMaxMs', 'runtime.longTaskMaxMs'],
  ['blockingMs', 'runtime.blockingMs'], ['heapBeforeBytes', 'runtime.heapBeforeBytes'], ['heapMountBytes', 'runtime.heapMountBytes'],
  ['heapAfterBytes', 'runtime.heapAfterBytes'], ['heapPeakBytes', 'runtime.heapPeakBytes'], ['heapDeltaBytes', 'runtime.heapDeltaBytes']
]

const warmMetricPaths = [
  ['startMs', 'warm.startMs'], ['firstPaintMs', 'warm.firstPaintMs'], ['actualFps', 'warm.playback.actualFps'],
  ['skippedFrames', 'warm.playback.skippedFrames'], ['skippedRate', 'warm.playback.skippedRate'],
  ['lateRate', 'warm.playback.lateRate'], ['intervalP95Ms', 'warm.playback.intervalP95Ms'],
  ['jitterMs', 'warm.playback.jitterMs'], ['longTaskTotalMs', 'warm.runtime.longTaskTotalMs'],
  ['longTaskMaxMs', 'warm.runtime.longTaskMaxMs'], ['blockingMs', 'warm.runtime.blockingMs'],
  ['heapBeforeBytes', 'warm.runtime.heapBeforeBytes'], ['heapMountBytes', 'warm.runtime.heapMountBytes'],
  ['heapAfterBytes', 'warm.runtime.heapAfterBytes'], ['heapPeakBytes', 'warm.runtime.heapPeakBytes'], ['heapDeltaBytes', 'warm.runtime.heapDeltaBytes']
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
