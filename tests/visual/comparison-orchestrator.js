import { aggregateVersionRounds, compareCorrectness, compareMetric } from './comparison.js'

const metricPaths = [
  ['runtimeLoadMs', 'startup.runtimeLoadMs'], ['parseMs', 'startup.parseMs'], ['mountMs', 'startup.mountMs'],
  ['startMs', 'startup.startMs'], ['firstPaintMs', 'startup.firstPaintMs'], ['playerReadyMs', 'startup.playerReadyMs'],
  ['runtimeReadyMs', 'startup.runtimeReadyMs'], ['actualFps', 'playback.actualFps'], ['skippedFrames', 'playback.skippedFrames'],
  ['skippedRate', 'playback.skippedRate'], ['lateRate', 'playback.lateRate'], ['intervalP95Ms', 'playback.intervalP95Ms'],
  ['jitterMs', 'playback.jitterMs'], ['longTaskTotalMs', 'runtime.longTaskTotalMs'], ['longTaskMaxMs', 'runtime.longTaskMaxMs'],
  ['blockingMs', 'runtime.blockingMs'], ['heapBeforeBytes', 'runtime.heapBeforeBytes'], ['heapMountBytes', 'runtime.heapMountBytes'],
  ['heapAfterBytes', 'runtime.heapAfterBytes'], ['heapPeakBytes', 'runtime.heapPeakBytes'], ['heapDeltaBytes', 'runtime.heapDeltaBytes']
]

function round (value) {
  return Number(value.toFixed(2))
}

function terminalResult (event) {
  if (event?.event === 'result') return event.result
  if (event?.event === 'cancelled') return { status: 'cancelled', warnings: ['人工取消'] }
  return { status: 'failed', error: event?.error || { stage: 'runner', message: '隔离运行器没有返回结果' }, warnings: [] }
}

function correctnessFor (rounds) {
  const baseline = rounds.baseline[rounds.baseline.length - 1]
  const local = rounds.local[rounds.local.length - 1]
  return compareCorrectness({ baseline, local })
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
  }

  async runFixture (fixture, { fixtureIndex = 0, rounds = 1, maxPlaybackMs = 2_000, includeWarm = false, runnerOptions = {} } = {}) {
    this.cancelled = false
    const sharedRead = await this.getBuffer(fixture)
    const result = {
      fixture,
      read: sharedRead.read,
      orders: [],
      rounds: { baseline: [], local: [] },
      aggregates: {},
      correctness: { state: 'limited', performanceComparable: false },
      metricComparisons: {},
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
    result.correctness = correctnessFor(result.rounds)
    if (this.cancelled) result.warnings.push('人工取消：保留已完成轮次。')
    return result
  }

  async runRuntime (runtime, buffer, fixture, options, onEvent) {
    const runner = this.createRunner(runtime, {
      target: this.canvas,
      visible: true,
      onEvent: event => {
        if (event.event === 'stage') onEvent({ stage: event.stage })
      }
    })
    this.activeRunner = runner
    this.onVisible(true)
    try {
      await runner.ready
      if (this.cancelled) return await runner.cancel()
      return await runner.run({ buffer, fixture, options })
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
