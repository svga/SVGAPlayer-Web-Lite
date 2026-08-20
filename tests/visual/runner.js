import {
  PlaybackCollector,
  createLongTaskMonitor,
  createRuntimeMonitor,
  environmentProfile,
  profileVideo,
  readHeapBytes
} from './metrics.js'

const protocol = 'svga-visual-runner'
const canvas = document.querySelector('#runner-canvas')
const query = new URLSearchParams(location.search)
const runtime = query.get('runtime')
const runId = query.get('runId')
const parentOrigin = location.origin
const startedAt = performance.now()
let active = null
let hiddenDuringRun = document.hidden
let coldRunStarted = false

function captureAsyncRunnerError (error) {
  if (!active || active.terminal) return
  active.asyncError = error instanceof Error ? error.message : String(error)
  active.finish?.('async-error')
}

window.addEventListener('error', event => {
  captureAsyncRunnerError(event.error || event.message)
})
window.addEventListener('unhandledrejection', event => {
  captureAsyncRunnerError(event.reason)
})

function send (event, payload = {}) {
  window.parent.postMessage({ protocol, event, runId, ...payload }, parentOrigin)
}

function isExpectedV1 (fixture) {
  return fixture?.name === 'show.svga' || fixture?.expectation === 'unsupported-v1'
}

function warningForCapabilities () {
  const environment = environmentProfile()
  const warnings = []
  if (!environment.worker) warnings.push('当前浏览器不提供 Worker，无法运行默认解析路径。')
  if (!environment.imageBitmap) warnings.push('当前浏览器不提供 ImageBitmap，图片解码将使用后备路径。')
  if (!environment.offscreenCanvas) warnings.push('当前浏览器不提供 OffscreenCanvas，渲染将使用 HTML Canvas。')
  if (!environment.longTask) warnings.push('当前浏览器不提供长任务观察接口。')
  if (readHeapBytes() === null) warnings.push('当前浏览器不提供可采样的 JS 堆数据。')
  return { environment, warnings }
}

function round (value) {
  return Number(value.toFixed(2))
}

function fingerprint (frame) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || canvas.width === 0 || canvas.height === 0) return null
  try {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let nonEmptyPixels = 0
    let hash = 2166136261
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3]
      if (alpha > 0) nonEmptyPixels++
      hash = Math.imul(hash ^ (pixels[index] & 0xf8), 16777619)
      hash = Math.imul(hash ^ (pixels[index + 1] & 0xf8), 16777619)
      hash = Math.imul(hash ^ (pixels[index + 2] & 0xf8), 16777619)
      hash = Math.imul(hash ^ (alpha & 0xf8), 16777619)
    }
    return {
      frame,
      width: canvas.width,
      height: canvas.height,
      nonEmptyPixels,
      rgbaHash: (hash >>> 0).toString(16).padStart(8, '0')
    }
  } catch {
    return null
  }
}

function collectRuntime (longTasks, runtimeMonitor) {
  const longTask = longTasks.finish()
  const runtimeResult = runtimeMonitor.finish()
  return {
    longTaskSupported: longTask.supported,
    longTaskCount: longTask.count,
    longTaskTotalMs: longTask.totalMs,
    longTaskMaxMs: longTask.maxMs,
    blockingMs: longTask.blockingMs,
    heapSupported: runtimeResult.heap.supported,
    heapBeforeBytes: runtimeResult.heap.beforeBytes,
    heapAfterBytes: runtimeResult.heap.afterBytes,
    heapPeakBytes: runtimeResult.heap.peakBytes,
    heapDeltaBytes: runtimeResult.heap.deltaBytes,
    rafFrames: runtimeResult.rafFrames
  }
}

function cancelledError () {
  return DOMException('Cancelled', 'AbortError')
}

function waitForPaint (token) {
  return new Promise(resolve => {
    let first = 0
    let second = 0
    let settled = false
    const finish = painted => {
      if (settled) return
      settled = true
      window.cancelAnimationFrame(first)
      window.cancelAnimationFrame(second)
      if (token.paintCancel === cancel) token.paintCancel = null
      resolve(painted)
    }
    const cancel = () => finish(false)
    token.paintCancel = cancel
    first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => finish(true))
    })
  })
}

async function playMounted (token, player, video, maxPlaybackMs) {
  const collector = new PlaybackCollector(video.fps)
  const longTasks = createLongTaskMonitor()
  const runtimeMonitor = createRuntimeMonitor()
  let monitorResult
  const finishMonitors = () => {
    if (!monitorResult) monitorResult = collectRuntime(longTasks, runtimeMonitor)
    return monitorResult
  }
  let timeoutId = 0
  let completed = false
  let resolvePlayback
  const playback = new Promise(resolve => { resolvePlayback = resolve })
  const finish = reason => {
    if (completed) return
    completed = true
    window.clearTimeout(timeoutId)
    resolvePlayback(reason)
  }
  token.finish = finish
  const started = performance.now()
  try {
    if (token.cancelled) throw cancelledError()
    player.onProcess = () => {
      if (token.cancelled) return
      collector.record(player.currentFrame, performance.now())
      const tick = collector.ticks[collector.ticks.length - 1]
      if (tick) send('ticks', { ticks: [tick] })
    }
    player.onEnd = () => finish('completed')
    player.start()
    if (token.cancelled) throw cancelledError()
    collector.record(player.currentFrame, performance.now())
    const startMs = performance.now() - started
    const visual = fingerprint(player.currentFrame)
    const paintStarted = performance.now()
    const painted = await waitForPaint(token)
    if (token.cancelled || !painted) throw cancelledError()
    const firstPaintMs = performance.now() - paintStarted
    if (Number.isFinite(maxPlaybackMs)) {
      timeoutId = window.setTimeout(() => {
        if (token.cancelled || completed) return
        player.pause()
        finish('sampled')
      }, maxPlaybackMs)
    }
    const reason = await playback
    if (token.cancelled || reason === 'cancelled') throw cancelledError()
    if (token.asyncError) throw Error(`运行时异步错误：${token.asyncError}`)
    const runtimeResult = finishMonitors()
    const playbackResult = collector.summarize(Math.max(0, performance.now() - started), runtimeResult.rafFrames)
    return { reason, startMs: round(startMs), firstPaintMs: round(firstPaintMs), visual, playback: playbackResult, runtime: runtimeResult }
  } finally {
    window.clearTimeout(timeoutId)
    token.paintCancel?.()
    token.paintCancel = null
    if (token.finish === finish) token.finish = null
    finishMonitors()
  }
}

function cleanup (token) {
  if (token.cleaned) return
  token.cleaned = true
  token.paintCancel?.()
  token.paintCancel = null
  if (token.blobUrl) {
    try { URL.revokeObjectURL(token.blobUrl) } catch {}
    token.blobUrl = null
  }
  try { token.parser?.destroy() } catch {}
  token.parser = null
  try { token.player?.destroy() } catch {}
  token.player = null
  token.finish = null
}

function sendCancelled (token) {
  if (token.terminal) return
  token.terminal = true
  send('cancelled', { stage: token.stage })
}

function abortActive () {
  if (!active) return
  const token = active
  token.cancelled = true
  token.finish?.('cancelled')
  sendCancelled(token)
  cleanup(token)
}

async function run (message) {
  if (active) abortActive()
  const token = {
    cancelled: false, cleaned: false, terminal: false, stage: 'parse', parser: null,
    player: null, blobUrl: null, finish: null, paintCancel: null
  }
  active = token
  hiddenDuringRun = document.hidden
  const fixture = message.fixture || {}
  const options = message.options || {}
  const maxPlaybackMs = Number.isFinite(options.maxPlaybackMs) && options.maxPlaybackMs >= 0
    ? options.maxPlaybackMs
    : Infinity
  const { environment, warnings } = warningForCapabilities()
  const heapBeforeBytes = readHeapBytes()
  try {
    if (!(message.buffer instanceof ArrayBuffer)) throw Error('run.buffer 必须是 ArrayBuffer')
    send('stage', { stage: token.stage })
    token.parser = new window.SVGA.Parser()
    token.blobUrl = URL.createObjectURL(new Blob([message.buffer], { type: 'application/octet-stream' }))
    const parseStarted = performance.now()
    const video = await token.parser.load(token.blobUrl)
    const parseMs = performance.now() - parseStarted
    try { token.parser.destroy() } catch {}
    token.parser = null
    URL.revokeObjectURL(token.blobUrl)
    token.blobUrl = null
    if (token.cancelled) throw cancelledError()
    if (isExpectedV1(fixture)) throw Error('SVGA 1.x 素材未被拒绝')

    token.stage = 'mount'
    send('stage', { stage: token.stage })
    const profile = profileVideo(video, fixture.bytes || message.buffer.byteLength)
    token.player = new window.SVGA.Player({
      container: canvas,
      loop: false,
      isCacheFrames: options.cacheFrames === true,
      isOpenNoExecutionDelay: options.timerWorker === true
    })
    const mountStarted = performance.now()
    await token.player.mount(video)
    const mountMs = performance.now() - mountStarted
    const heapMountBytes = readHeapBytes()
    if (token.cancelled) throw cancelledError()

    token.stage = 'start'
    send('stage', { stage: token.stage })
    const cold = await playMounted(token, token.player, video, maxPlaybackMs)
    const playerReadyMs = round(parseMs + mountMs + cold.startMs + cold.firstPaintMs)
    const startup = {
      parseMs: round(parseMs),
      mountMs: round(mountMs),
      startMs: cold.startMs,
      firstPaintMs: cold.firstPaintMs,
      playerReadyMs,
      runtimeLoadMs: round(runtimeLoadMs),
      runtimeReadyMs: round(runtimeLoadMs + playerReadyMs)
    }
    if (cold.runtime.heapSupported && heapBeforeBytes !== null && heapMountBytes !== null) {
      cold.runtime.heapBeforeBytes = heapBeforeBytes
      cold.runtime.heapMountBytes = heapMountBytes
      cold.runtime.heapPeakBytes = Math.max(cold.runtime.heapPeakBytes, heapBeforeBytes, heapMountBytes)
      cold.runtime.heapDeltaBytes = cold.runtime.heapAfterBytes - heapBeforeBytes
    } else cold.runtime.heapSupported = false
    if (!cold.visual) warnings.push('首个可观察画面无法读取，未生成视觉指纹。')
    if (cold.playback.updateCount < 2) warnings.push('播放样本不足，播放质量指标仅供参考。')
    if (hiddenDuringRun) warnings.push('测试期间页面进入后台，浏览器调度可能影响结果。')
    const result = {
      status: cold.reason,
      fixture,
      capabilities: environment,
      profile,
      startup,
      playback: cold.playback,
      runtime: cold.runtime,
      visual: cold.visual,
      warnings,
      sampleSufficient: cold.playback.updateCount >= 2
    }
    if (options.includeWarm === true && !token.cancelled) {
      token.stage = 'warm'
      send('stage', { stage: token.stage })
      const warm = await playMounted(token, token.player, video, maxPlaybackMs)
      result.warm = {
        status: warm.reason,
        startMs: warm.startMs,
        firstPaintMs: warm.firstPaintMs,
        playback: warm.playback,
        runtime: warm.runtime,
        visual: warm.visual
      }
      if (warm.playback.updateCount < 2) result.warnings.push('热播放样本不足，播放质量指标仅供参考。')
    }
    if (token.cancelled) {
      sendCancelled(token)
    } else {
      token.terminal = true
      send('result', { result })
    }
  } catch (error) {
    const cancelled = token.cancelled || error?.name === 'AbortError'
    if (cancelled) sendCancelled(token)
    else if (isExpectedV1(fixture) && token.stage === 'parse' && String(error?.message || error).includes('only support version@2')) {
      token.terminal = true
      send('result', {
        result: {
          status: 'expected-rejection', fixture, capabilities: environment, warnings,
          error: { stage: token.stage, message: error.message }
        }
      })
    } else {
      token.terminal = true
      send('error', { error: { stage: token.stage, message: error instanceof Error ? error.message : String(error) } })
    }
  } finally {
    cleanup(token)
    if (active === token) active = null
  }
}

function acceptMessage (event) {
  const message = event.data
  return event.origin === parentOrigin && event.source === window.parent && message?.protocol === protocol && message.runId === runId
}

window.addEventListener('message', event => {
  if (!acceptMessage(event)) return
  if (event.data.event === 'cancel') abortActive()
  else if (event.data.event === 'run') {
    if (coldRunStarted) send('error', { error: { stage: 'protocol', message: '每个隔离运行器只能执行一次冷启动测量' } })
    else {
      coldRunStarted = true
      void run(event.data)
    }
  }
})
document.addEventListener('visibilitychange', () => {
  if (active && document.hidden) hiddenDuringRun = true
})
window.addEventListener('beforeunload', abortActive)

let runtimeLoadMs = 0
if ((runtime === 'local' || runtime === 'baseline') && runId && window.parent !== window) {
  const script = document.createElement('script')
  script.src = `/runtime/${runtime}.js`
  script.onload = () => {
    runtimeLoadMs = performance.now() - startedAt
    if (typeof window.SVGA?.Parser !== 'function' || typeof window.SVGA?.Player !== 'function') {
      send('error', { error: { stage: 'runtime', message: '运行时没有提供 SVGA.Parser 和 SVGA.Player' } })
      return
    }
    send('ready', { runtime, runtimeLoadMs: round(runtimeLoadMs) })
  }
  script.onerror = () => send('error', { error: { stage: 'runtime', message: '运行时脚本加载失败' } })
  document.head.append(script)
} else {
  send('error', { error: { stage: 'runtime', message: '无效的 runtime 或 runId' } })
}
