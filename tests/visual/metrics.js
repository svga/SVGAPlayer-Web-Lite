const round = (value, digits = 2) => Number(value.toFixed(digits))

function percentile (values, fraction) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((first, second) => first - second)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  return sorted[index]
}

function deviation (values) {
  if (values.length < 2) return 0
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function profileVideo (video, fileBytes) {
  const spriteFrames = video.sprites.reduce((sum, sprite) => sum + sprite.frames.length, 0)
  const shapes = video.sprites.reduce((sum, sprite) => {
    return sum + sprite.frames.reduce((frameSum, frame) => frameSum + frame.shapes.length, 0)
  }, 0)
  const imageBytes = Object.values(video.images).reduce((sum, bytes) => sum + bytes.byteLength, 0)
  const pixels = video.size.width * video.size.height
  return {
    fileBytes,
    width: video.size.width,
    height: video.size.height,
    pixels,
    fps: video.fps,
    frames: video.frames,
    durationMs: round(video.frames / video.fps * 1000),
    images: Object.keys(video.images).length,
    imageBytes,
    sprites: video.sprites.length,
    spriteFrames,
    shapes,
    rgbaBytes: pixels * 4
  }
}

export class PlaybackCollector {
  constructor (targetFps) {
    this.targetFps = targetFps
    this.intervalTarget = 1000 / targetFps
    this.intervals = []
    this.ticks = []
    this.advancedFrames = 0
    this.skippedFrames = 0
    this.updateCount = 0
    this.lastFrame = undefined
    this.lastTimestamp = undefined
  }

  record (frame, timestamp) {
    if (this.lastFrame !== undefined && this.lastTimestamp !== undefined) {
      const delta = Math.abs(frame - this.lastFrame)
      const interval = timestamp - this.lastTimestamp
      if (delta > 0) {
        const skipped = Math.max(0, delta - 1)
        this.advancedFrames += delta
        this.skippedFrames += skipped
        this.updateCount++
        this.intervals.push(interval)
        this.ticks.push({
          frame,
          interval: round(interval),
          kind: skipped > 0 ? 'skip' : interval > this.intervalTarget * 1.5 ? 'late' : 'ok',
          skipped
        })
      }
    }
    this.lastFrame = frame
    this.lastTimestamp = timestamp
  }

  split () {
    this.lastFrame = undefined
    this.lastTimestamp = undefined
  }

  summarize (activeDurationMs, rafFrames) {
    const average = this.intervals.length
      ? this.intervals.reduce((sum, value) => sum + value, 0) / this.intervals.length
      : 0
    const lateFrames = this.intervals.filter(value => value > this.intervalTarget * 1.5).length
    return {
      targetFps: this.targetFps,
      actualFps: activeDurationMs > 0 ? round(this.advancedFrames / activeDurationMs * 1000) : 0,
      activeDurationMs: round(activeDurationMs),
      updateCount: this.updateCount,
      advancedFrames: this.advancedFrames,
      skippedFrames: this.skippedFrames,
      skippedRate: this.advancedFrames > 0 ? round(this.skippedFrames / this.advancedFrames * 100) : 0,
      intervalAverageMs: round(average),
      intervalP50Ms: round(percentile(this.intervals, 0.5)),
      intervalP95Ms: round(percentile(this.intervals, 0.95)),
      intervalP99Ms: round(percentile(this.intervals, 0.99)),
      intervalMaxMs: round(this.intervals.length ? Math.max(...this.intervals) : 0),
      jitterMs: round(deviation(this.intervals)),
      lateFrames,
      lateRate: this.intervals.length ? round(lateFrames / this.intervals.length * 100) : 0,
      rafFps: activeDurationMs > 0 ? round(rafFrames / activeDurationMs * 1000) : 0,
      ticks: this.ticks.slice(-160)
    }
  }
}

export function createLongTaskMonitor () {
  const supported = typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes('longtask')
  const durations = []
  let observer
  let result
  if (supported) {
    observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) durations.push(entry.duration)
    })
    observer.observe({ type: 'longtask' })
  }
  return {
    finish () {
      if (result) return result
      observer?.disconnect()
      result = supported
        ? {
            supported: true,
            count: durations.length,
            totalMs: round(durations.reduce((sum, value) => sum + value, 0)),
            maxMs: round(durations.length ? Math.max(...durations) : 0),
            blockingMs: round(durations.reduce((sum, value) => sum + Math.max(0, value - 50), 0))
          }
        : { supported: false }
      return result
    }
  }
}

export function createRuntimeMonitor () {
  const memory = performance.memory
  const heapSamples = []
  let rafFrames = 0
  let stopped = false
  let rafId = 0
  let result
  const sampleHeap = () => {
    if (memory && Number.isFinite(memory.usedJSHeapSize)) heapSamples.push(memory.usedJSHeapSize)
  }
  sampleHeap()
  const heapTimer = window.setInterval(sampleHeap, 250)
  const frame = () => {
    if (stopped) return
    rafFrames++
    rafId = requestAnimationFrame(frame)
  }
  rafId = requestAnimationFrame(frame)
  return {
    finish () {
      if (result) return result
      stopped = true
      cancelAnimationFrame(rafId)
      clearInterval(heapTimer)
      sampleHeap()
      const lastHeapSample = heapSamples[heapSamples.length - 1] || 0
      result = {
        rafFrames,
        heap: memory
          ? {
              supported: true,
              beforeBytes: heapSamples[0] || 0,
              afterBytes: lastHeapSample,
              peakBytes: heapSamples.length ? Math.max(...heapSamples) : 0,
              deltaBytes: lastHeapSample - (heapSamples[0] || 0)
            }
          : { supported: false }
      }
      return result
    }
  }
}

export function environmentProfile () {
  return {
    browser: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    crossOriginIsolated: window.crossOriginIsolated,
    worker: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    imageBitmap: typeof createImageBitmap === 'function',
    longTask: typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask'),
    advancedMemory: typeof performance.measureUserAgentSpecificMemory === 'function' && window.crossOriginIsolated
  }
}

export function readHeapBytes () {
  const value = performance.memory?.usedJSHeapSize
  return Number.isFinite(value) ? value : null
}

export async function nextPaint () {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

export function formatBytes (bytes) {
  if (!Number.isFinite(bytes)) return '不可用'
  const absolute = Math.abs(bytes)
  if (absolute < 1024) return `${Math.round(bytes)} B`
  if (absolute < 1024 ** 2) return `${round(bytes / 1024, 1)} KiB`
  return `${round(bytes / 1024 ** 2, 2)} MiB`
}

export function formatMilliseconds (value) {
  return `${round(value)} ms`
}
