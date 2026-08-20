import {
  PlaybackCollector,
  createLongTaskMonitor,
  createRuntimeMonitor,
  environmentProfile,
  formatBytes,
  formatMilliseconds,
  nextPaint,
  profileVideo,
  readHeapBytes
} from './metrics.js'

const elements = {
  batchResults: document.querySelector('#batch-results'),
  batchStatus: document.querySelector('[data-testid="batch-status"]'),
  cacheFrames: document.querySelector('#cache-frames'),
  cancelAll: document.querySelector('[data-testid="cancel-all"]'),
  canvas: document.querySelector('[data-testid="player-canvas"]'),
  canvasMessage: document.querySelector('#canvas-message'),
  environmentBadge: document.querySelector('#environment-badge'),
  fixtureCount: document.querySelector('#fixture-count'),
  fixtureList: document.querySelector('#fixture-list'),
  frameTrack: document.querySelector('#frame-track'),
  measurementMode: document.querySelector('#measurement-mode'),
  memoryNote: document.querySelector('#memory-note'),
  memorySnapshot: document.querySelector('[data-testid="memory-snapshot"]'),
  pause: document.querySelector('[data-testid="pause"]'),
  replay: document.querySelector('[data-testid="replay"]'),
  resume: document.querySelector('[data-testid="resume"]'),
  runAll: document.querySelector('[data-testid="run-all"]'),
  runSelected: document.querySelector('[data-testid="run-selected"]'),
  runStatus: document.querySelector('[data-testid="run-status"]'),
  selectedName: document.querySelector('[data-testid="selected-name"]'),
  selectedSize: document.querySelector('#selected-size'),
  stop: document.querySelector('[data-testid="stop"]'),
  summaryCards: document.querySelector('#summary-cards'),
  timerWorker: document.querySelector('#timer-worker'),
  warnings: document.querySelector('#warnings')
}

const metricDefinitions = {
  profile: [
    ['fileBytes', '压缩文件', 'bytes'], ['width', '画布宽度', 'px'], ['height', '画布高度', 'px'],
    ['pixels', '画布像素', 'integer'], ['fps', '声明 FPS', 'number'], ['frames', '总帧数', 'integer'],
    ['durationMs', '理论时长', 'ms'], ['images', '图片数', 'integer'], ['imageBytes', '图片字节', 'bytes'],
    ['sprites', '精灵数', 'integer'], ['spriteFrames', '精灵帧总数', 'integer'], ['shapes', '形状数', 'integer'],
    ['rgbaBytes', '单帧 RGBA 估算', 'bytes']
  ],
  startup: [
    ['readMs', '文件读取', 'ms'], ['throughputBytesPerSecond', '读取吞吐', 'rate'],
    ['parseMs', 'Worker 解析', 'ms'], ['mountMs', '图片解码与挂载', 'ms'],
    ['startMs', '启动及首帧提交', 'ms'], ['firstPaintMs', '到绘制机会', 'ms'],
    ['readyMs', '总启动耗时', 'ms']
  ],
  playback: [
    ['targetFps', '目标 FPS', 'number'], ['actualFps', '实际帧推进 FPS', 'number'],
    ['activeDurationMs', '有效播放时间', 'ms'], ['updateCount', '更新次数', 'integer'],
    ['skippedFrames', '跳帧数', 'integer'], ['skippedRate', '跳帧比例', 'percent'],
    ['intervalAverageMs', '平均帧间隔', 'ms'], ['intervalP50Ms', 'P50 帧间隔', 'ms'],
    ['intervalP95Ms', 'P95 帧间隔', 'ms'], ['intervalP99Ms', 'P99 帧间隔', 'ms'],
    ['intervalMaxMs', '最大帧间隔', 'ms'], ['jitterMs', '帧间隔抖动', 'ms'],
    ['lateFrames', '慢帧数', 'integer'], ['lateRate', '慢帧比例', 'percent'], ['rafFps', '页面 RAF 频率', 'number']
  ],
  runtime: [
    ['longTaskCount', '长任务数', 'integer'], ['longTaskTotalMs', '长任务总时长', 'ms'],
    ['longTaskMaxMs', '最长任务', 'ms'], ['blockingMs', '50 ms 以上阻塞', 'ms'],
    ['heapBeforeBytes', '运行前 JS 堆', 'bytes'], ['heapMountBytes', '挂载后 JS 堆', 'bytes'],
    ['heapAfterBytes', '播放后 JS 堆', 'bytes'],
    ['heapPeakBytes', '峰值 JS 堆', 'bytes'], ['heapDeltaBytes', 'JS 堆增量', 'bytes']
  ]
}

const statusLabels = {
  idle: '等待运行', reading: '读取文件', parsing: 'Worker 解析', mounting: '解码与挂载',
  playing: '播放中', paused: '已暂停', completed: '已完成', sampled: '样本完成',
  stopped: '已停止', cancelled: '已取消', failed: '测试失败', 'expected-rejection': '预期拒绝'
}

let fixtures = []
let selectedFixture
let active = null
let retained = null
let batchCancelled = false
let hiddenDuringRun = false

const setStatus = state => {
  elements.runStatus.dataset.state = state
  elements.runStatus.textContent = statusLabels[state] || state
}

const setPlaybackControls = state => {
  elements.pause.disabled = state !== 'playing'
  elements.resume.disabled = state !== 'paused'
  elements.stop.disabled = !['reading', 'parsing', 'mounting', 'playing', 'paused'].includes(state)
  elements.replay.disabled = !retained || !['completed', 'sampled', 'stopped'].includes(state)
}

function formatValue (value, unit) {
  if (value === undefined || value === null) return '不可用'
  if (unit === 'bytes') return formatBytes(value)
  if (unit === 'ms') return formatMilliseconds(value)
  if (unit === 'rate') return `${formatBytes(value)}/s`
  if (unit === 'percent') return `${value}%`
  if (unit === 'px') return `${value} px`
  return String(value)
}

function renderMetricGroup (group, values = {}, unsupported = new Set()) {
  const target = document.querySelector(`#${group}-metrics`)
  target.replaceChildren(...metricDefinitions[group].flatMap(([key, label, unit]) => {
    const term = document.createElement('dt')
    term.textContent = label
    const detail = document.createElement('dd')
    detail.dataset.metric = `${group}.${key}`
    const value = values[key]
    if (typeof value === 'number' && Number.isFinite(value) && !unsupported.has(key)) {
      detail.dataset.value = String(value)
      detail.dataset.numericMetric = 'true'
      detail.textContent = formatValue(value, unit)
    } else {
      detail.dataset.value = 'unsupported'
      detail.textContent = unsupported.has(key) ? '当前浏览器不提供' : '—'
    }
    return [term, detail]
  }))
}

function renderSummary (result) {
  const cards = [
    ['总启动', result.startup?.readyMs, 'ms'],
    ['实际 FPS', result.playback?.actualFps, 'number'],
    ['跳帧', result.playback?.skippedFrames, 'integer'],
    ['最长任务', result.runtime?.longTaskMaxMs, 'ms']
  ]
  elements.summaryCards.replaceChildren(...cards.map(([label, value, unit]) => {
    const card = document.createElement('div')
    card.className = 'summary-card'
    const heading = document.createElement('span')
    heading.textContent = label
    const output = document.createElement('strong')
    output.textContent = typeof value === 'number' ? formatValue(value, unit) : '不可用'
    card.append(heading, output)
    return card
  }))
}

function renderResult (result, mode = '冷启动') {
  elements.measurementMode.textContent = mode
  renderMetricGroup('profile', result.profile)
  renderMetricGroup('startup', result.startup)
  renderMetricGroup('playback', result.playback)
  const runtimeUnsupported = new Set()
  if (!result.runtime?.longTaskSupported) {
    for (const key of ['longTaskCount', 'longTaskTotalMs', 'longTaskMaxMs', 'blockingMs']) runtimeUnsupported.add(key)
  }
  if (!result.runtime?.heapSupported) {
    for (const key of ['heapBeforeBytes', 'heapMountBytes', 'heapAfterBytes', 'heapPeakBytes', 'heapDeltaBytes']) runtimeUnsupported.add(key)
  }
  renderMetricGroup('runtime', result.runtime, runtimeUnsupported)
  renderSummary(result)
  renderTicks(result.playback?.ticks || [])
  const warnings = [...(result.warnings || [])]
  if (!result.runtime?.longTaskSupported) warnings.push('当前浏览器不提供长任务观察接口。')
  if (!result.runtime?.heapSupported) warnings.push('当前浏览器不提供可采样的 JS 堆数据。')
  elements.warnings.replaceChildren(...warnings.map(message => {
    const item = document.createElement('p')
    item.textContent = message
    return item
  }))
}

function renderTicks (ticks) {
  elements.frameTrack.replaceChildren(...ticks.map(tick => {
    const item = document.createElement('span')
    item.dataset.testid = 'frame-tick'
    item.dataset.kind = tick.kind
    item.title = `第 ${tick.frame} 帧 · ${tick.interval} ms${tick.skipped ? ` · 跳过 ${tick.skipped} 帧` : ''}`
    return item
  }))
}

function resetPublishedResults () {
  for (const group of Object.keys(metricDefinitions)) renderMetricGroup(group)
  renderSummary({})
  elements.frameTrack.replaceChildren()
  elements.warnings.replaceChildren()
  elements.measurementMode.textContent = '冷启动'
}

function selectFixture (fixture) {
  if (active) cancelActive('cancelled')
  if (selectedFixture && selectedFixture.name !== fixture.name) {
    destroyRetained()
    setStatus('idle')
    setPlaybackControls('idle')
    resetPublishedResults()
  }
  selectedFixture = fixture
  for (const button of elements.fixtureList.querySelectorAll('[data-fixture]')) {
    button.setAttribute('aria-pressed', String(button.dataset.fixture === fixture.name))
  }
  elements.selectedName.textContent = fixture.name
  elements.selectedSize.textContent = `${formatBytes(fixture.bytes)} · ${fixture.expectation === 'playable' ? 'SVGA 2.x' : 'SVGA 1.x 预期拒绝'}`
  elements.canvasMessage.textContent = fixture.expectation === 'playable' ? '准备运行真实文件' : '该文件用于验证版本拒绝路径'
  elements.canvasMessage.hidden = false
}

function renderFixtureList () {
  elements.fixtureList.replaceChildren(...fixtures.map(fixture => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'fixture-item'
    item.dataset.testid = 'fixture-item'
    item.dataset.fixture = fixture.name
    item.setAttribute('aria-pressed', 'false')
    const name = document.createElement('strong')
    name.textContent = fixture.name
    const meta = document.createElement('span')
    meta.textContent = fixture.expectation === 'unsupported-v1'
      ? `${formatBytes(fixture.bytes)} · 预期拒绝`
      : formatBytes(fixture.bytes)
    item.append(name, meta)
    item.addEventListener('click', () => selectFixture(fixture))
    return item
  }))
}

function destroyRetained () {
  if (!retained) return
  try { retained.player.destroy() } catch {}
  retained = null
}

function cancelActive (state = 'cancelled') {
  if (!active) return
  active.cancelled = true
  active.abort?.abort()
  try { active.parser?.destroy() } catch {}
  try { active.player?.destroy() } catch {}
  active.finishPlayback?.(state)
  active = null
  setStatus(state)
  setPlaybackControls(state)
}

function collectRuntime (longTasks, runtime) {
  const longTaskResult = longTasks.finish()
  const runtimeResult = runtime.finish()
  return {
    longTaskSupported: longTaskResult.supported,
    longTaskCount: longTaskResult.count,
    longTaskTotalMs: longTaskResult.totalMs,
    longTaskMaxMs: longTaskResult.maxMs,
    blockingMs: longTaskResult.blockingMs,
    heapSupported: runtimeResult.heap.supported,
    heapBeforeBytes: runtimeResult.heap.beforeBytes,
    heapAfterBytes: runtimeResult.heap.afterBytes,
    heapPeakBytes: runtimeResult.heap.peakBytes,
    heapDeltaBytes: runtimeResult.heap.deltaBytes,
    rafFrames: runtimeResult.rafFrames
  }
}

async function playMounted ({ player, video, maxPlaybackMs = Infinity }) {
  const collector = new PlaybackCollector(video.fps)
  const longTasks = createLongTaskMonitor()
  const runtime = createRuntimeMonitor()
  let startedAt = 0
  let pausedAt = 0
  let pausedMs = 0
  let timeoutId
  let finished = false
  let resolvePlayback
  let lastTrackPaint = 0
  const playback = new Promise(resolve => { resolvePlayback = resolve })
  const finish = reason => {
    if (finished) return
    finished = true
    clearTimeout(timeoutId)
    resolvePlayback(reason)
  }
  active.finishPlayback = finish
  active.pause = () => {
    if (finished || pausedAt) return
    player.pause()
    pausedAt = performance.now()
    collector.split()
    setStatus('paused')
    setPlaybackControls('paused')
  }
  active.resume = () => {
    if (finished || !pausedAt) return
    pausedMs += performance.now() - pausedAt
    pausedAt = 0
    player.resume()
    setStatus('playing')
    setPlaybackControls('playing')
  }
  active.stop = () => {
    if (finished) return
    if (pausedAt) pausedMs += performance.now() - pausedAt
    pausedAt = 0
    player.stop()
    finish('stopped')
  }
  player.onProcess = () => {
    const timestamp = performance.now()
    collector.record(player.currentFrame, timestamp)
    if (timestamp - lastTrackPaint >= 100) {
      lastTrackPaint = timestamp
      renderTicks(collector.ticks.slice(-160))
    }
  }
  player.onEnd = () => finish('completed')
  player.onStart = () => {
    setStatus('playing')
    setPlaybackControls('playing')
  }
  player.onResume = () => {
    setStatus('playing')
    setPlaybackControls('playing')
  }
  player.onPause = () => {}
  player.onStop = () => {}

  setStatus('playing')
  setPlaybackControls('playing')
  const startCall = performance.now()
  startedAt = startCall
  player.start()
  collector.record(player.currentFrame, performance.now())
  const startMs = performance.now() - startCall
  const paintStart = performance.now()
  await nextPaint()
  const firstPaintMs = performance.now() - paintStart
  if (Number.isFinite(maxPlaybackMs)) timeoutId = window.setTimeout(() => {
    player.pause()
    finish('sampled')
  }, maxPlaybackMs)

  const reason = await playback
  const endedAt = performance.now()
  if (pausedAt) pausedMs += endedAt - pausedAt
  const runtimeResult = collectRuntime(longTasks, runtime)
  const activeDurationMs = Math.max(0, endedAt - startedAt - pausedMs)
  const playbackResult = collector.summarize(activeDurationMs, runtimeResult.rafFrames)
  return { reason, startMs, firstPaintMs, playback: playbackResult, runtime: runtimeResult }
}

async function runFixture (fixture, { maxPlaybackMs = Infinity, retain = false, publish = true } = {}) {
  cancelActive('cancelled')
  destroyRetained()
  hiddenDuringRun = false
  const token = { abort: new AbortController(), cancelled: false }
  active = token
  if (publish) resetPublishedResults()
  const warnings = []
  const heapBeforeBytes = readHeapBytes()
  let stage = 'reading'
  let parser
  let player
  let blobUrl
  try {
    setStatus(stage)
    setPlaybackControls(stage)
    elements.canvasMessage.textContent = '读取真实文件…'
    elements.canvasMessage.hidden = false
    const readStarted = performance.now()
    const response = await fetch(fixture.url, { cache: 'no-store', signal: token.abort.signal })
    if (!response.ok) throw Error(`文件读取失败：${response.status}`)
    const bytes = await response.arrayBuffer()
    const readMs = performance.now() - readStarted
    if (token.cancelled) throw DOMException('Cancelled', 'AbortError')

    stage = 'parsing'
    setStatus(stage)
    parser = token.parser = new window.SVGA.Parser()
    blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
    const parseStarted = performance.now()
    let video
    try { video = await parser.load(blobUrl) } finally {
      parser.destroy()
      token.parser = null
      URL.revokeObjectURL(blobUrl)
      blobUrl = null
    }
    const parseMs = performance.now() - parseStarted
    if (fixture.expectation === 'unsupported-v1') throw Error('旧版素材未被拒绝')

    stage = 'mounting'
    setStatus(stage)
    const profile = profileVideo(video, fixture.bytes)
    player = token.player = new window.SVGA.Player({
      container: elements.canvas,
      loop: false,
      isCacheFrames: retain && elements.cacheFrames.checked,
      isOpenNoExecutionDelay: retain && elements.timerWorker.checked
    })
    const mountStarted = performance.now()
    await player.mount(video)
    const mountMs = performance.now() - mountStarted
    const heapMountBytes = readHeapBytes()
    elements.canvasMessage.hidden = true

    const played = await playMounted({ player, video, maxPlaybackMs })
    const startup = {
      readMs: Number(readMs.toFixed(2)),
      throughputBytesPerSecond: Math.round(bytes.byteLength / Math.max(readMs, 0.01) * 1000),
      parseMs: Number(parseMs.toFixed(2)),
      mountMs: Number(mountMs.toFixed(2)),
      startMs: Number(played.startMs.toFixed(2)),
      firstPaintMs: Number(played.firstPaintMs.toFixed(2)),
      readyMs: Number((readMs + parseMs + mountMs + played.startMs + played.firstPaintMs).toFixed(2))
    }
    if (played.runtime.heapSupported && heapBeforeBytes !== null && heapMountBytes !== null) {
      played.runtime.heapBeforeBytes = heapBeforeBytes
      played.runtime.heapMountBytes = heapMountBytes
      played.runtime.heapPeakBytes = Math.max(played.runtime.heapPeakBytes, heapBeforeBytes, heapMountBytes)
      played.runtime.heapDeltaBytes = played.runtime.heapAfterBytes - heapBeforeBytes
    } else {
      played.runtime.heapSupported = false
    }
    if (hiddenDuringRun) warnings.push('测试期间页面进入后台，结果可能受浏览器调度影响，建议重跑。')
    const result = { fixture, profile, startup, playback: played.playback, runtime: played.runtime, warnings }
    setStatus(played.reason)
    if (retain && ['completed', 'sampled', 'stopped'].includes(played.reason)) {
      retained = { player, video, result }
      token.player = null
    } else {
      player.destroy()
      token.player = null
    }
    active = null
    setPlaybackControls(played.reason)
    if (publish) renderResult(result)
    return { status: played.reason, result }
  } catch (error) {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    try { parser?.destroy() } catch {}
    try { player?.destroy() } catch {}
    if (active === token) active = null
    const cancelled = token.cancelled || error?.name === 'AbortError'
    if (cancelled) {
      setStatus('cancelled')
      setPlaybackControls('cancelled')
      return { status: 'cancelled', error }
    }
    const message = error instanceof Error ? error.message : String(error)
    if (fixture.expectation === 'unsupported-v1' && stage === 'parsing' && message.includes('only support version@2')) {
      elements.canvasMessage.textContent = 'SVGA 1.x 已按预期拒绝'
      elements.canvasMessage.hidden = false
      setStatus('expected-rejection')
      setPlaybackControls('expected-rejection')
      elements.warnings.replaceChildren(Object.assign(document.createElement('p'), { textContent: `解析阶段：${message}` }))
      return { status: 'expected-rejection', error: { stage, message } }
    }
    elements.canvasMessage.textContent = `${stage} 阶段失败`
    elements.canvasMessage.hidden = false
    setStatus('failed')
    setPlaybackControls('failed')
    elements.warnings.replaceChildren(Object.assign(document.createElement('p'), { textContent: `${stage} 阶段：${message}` }))
    return { status: 'failed', error: { stage, message } }
  }
}

async function replayRetained () {
  if (!retained || active) return
  const token = { cancelled: false, player: retained.player }
  active = token
  hiddenDuringRun = false
  const played = await playMounted({ player: retained.player, video: retained.video })
  if (hiddenDuringRun) retained.result.warnings.push('热播放期间页面进入后台，结果可能受浏览器调度影响。')
  retained.result.warm = {
    startMs: Number(played.startMs.toFixed(2)),
    firstPaintMs: Number(played.firstPaintMs.toFixed(2)),
    playback: played.playback,
    runtime: played.runtime
  }
  retained.result.playback = played.playback
  retained.result.runtime = played.runtime
  active = null
  setStatus(played.reason)
  setPlaybackControls(played.reason)
  renderResult(retained.result, '热播放（启动数据保留冷启动结果）')
}

function appendBatchRow (fixture, outcome) {
  const row = document.createElement('tr')
  row.dataset.testid = 'batch-row'
  row.dataset.fixture = fixture.name
  row.dataset.result = outcome.status
  const result = outcome.result
  const statusText = outcome.status === 'expected-rejection'
    ? '预期拒绝'
    : outcome.status === 'sampled' || outcome.status === 'completed'
      ? '通过'
      : outcome.status === 'cancelled' ? '已取消' : '失败'
  const values = [
    fixture.name,
    statusText,
    result ? formatMilliseconds(result.startup.parseMs) : '—',
    result ? formatMilliseconds(result.startup.mountMs) : '—',
    result ? String(result.playback.actualFps) : '—',
    result ? String(result.playback.skippedFrames) : '—',
    outcome.status === 'expected-rejection'
      ? 'SVGA 1.x 版本拒绝路径正常'
      : outcome.error?.message || (result?.warnings || []).join('；') || '—'
  ]
  row.append(...values.map((value, index) => {
    const cell = document.createElement(index === 0 ? 'th' : 'td')
    if (index === 0) cell.scope = 'row'
    cell.textContent = value
    return cell
  }))
  elements.batchResults.append(row)
}

function setBatchState (state, text) {
  elements.batchStatus.dataset.state = state
  elements.batchStatus.textContent = text
  const running = state === 'running'
  elements.runAll.disabled = running
  elements.cancelAll.disabled = !running
  elements.runSelected.disabled = running
  elements.cacheFrames.disabled = running
  elements.timerWorker.disabled = running
  for (const button of elements.fixtureList.querySelectorAll('[data-fixture]')) button.disabled = running
}

async function runBatch () {
  if (elements.batchStatus.dataset.state === 'running') return
  batchCancelled = false
  elements.batchResults.replaceChildren()
  delete elements.batchStatus.dataset.success
  delete elements.batchStatus.dataset.expected
  delete elements.batchStatus.dataset.failed
  setBatchState('running', `准备运行 0/${fixtures.length}`)
  let success = 0
  let expected = 0
  let failed = 0

  for (const [index, fixture] of fixtures.entries()) {
    if (batchCancelled) break
    setBatchState('running', `正在运行 ${index + 1}/${fixtures.length}`)
    selectedFixture = fixture
    for (const button of elements.fixtureList.querySelectorAll('[data-fixture]')) {
      button.setAttribute('aria-pressed', String(button.dataset.fixture === fixture.name))
    }
    elements.selectedName.textContent = fixture.name
    elements.selectedSize.textContent = formatBytes(fixture.bytes)
    const outcome = await runFixture(fixture, { maxPlaybackMs: 2000, retain: false, publish: false })
    if (batchCancelled || outcome.status === 'cancelled') break
    appendBatchRow(fixture, outcome)
    if (outcome.status === 'expected-rejection') expected++
    else if (outcome.status === 'sampled' || outcome.status === 'completed') success++
    else failed++
  }

  if (batchCancelled) {
    setBatchState('cancelled', '已取消')
    return
  }
  elements.batchStatus.dataset.success = String(success)
  elements.batchStatus.dataset.expected = String(expected)
  elements.batchStatus.dataset.failed = String(failed)
  setBatchState(failed === 0 ? 'completed' : 'failed', `${success} 通过 · ${expected} 预期拒绝 · ${failed} 失败`)
}

function cancelBatch () {
  if (elements.batchStatus.dataset.state !== 'running') return
  batchCancelled = true
  cancelActive('cancelled')
  setBatchState('cancelled', '已取消')
}

async function loadFixtures () {
  const response = await fetch('/api/fixtures')
  if (!response.ok) throw Error(`读取素材失败：${response.status}`)
  ;({ fixtures } = await response.json())
  elements.fixtureCount.textContent = String(fixtures.length)
  renderFixtureList()
  selectFixture(fixtures.find(fixture => fixture.name === 'soundwave.svga') || fixtures[0])
}

function renderEnvironment () {
  const environment = environmentProfile()
  const browser = environment.browser.includes('Firefox/')
    ? 'Firefox'
    : environment.browser.includes('AppleWebKit/') && !environment.browser.includes('Chrome/')
      ? 'WebKit'
      : 'Chromium'
  elements.environmentBadge.textContent = `${browser} · ${environment.viewport} · DPR ${environment.devicePixelRatio} · CPU ${environment.hardwareConcurrency || '未知'} · ${environment.worker ? 'Worker' : '无 Worker'} · ${environment.offscreenCanvas ? 'OffscreenCanvas' : 'HTML Canvas'} · ${environment.imageBitmap ? 'ImageBitmap' : '无 ImageBitmap'} · ${environment.crossOriginIsolated ? '跨源隔离' : '未隔离'}`
  elements.environmentBadge.title = environment.browser
  elements.memorySnapshot.disabled = !environment.advancedMemory
  elements.memoryNote.textContent = environment.advancedMemory
    ? '高级内存快照可用；结果仅适合同一浏览器和设备内比较。'
    : '当前浏览器或页面环境不提供高级内存快照。'
}

elements.runSelected.addEventListener('click', () => {
  if (selectedFixture) void runFixture(selectedFixture, { retain: true })
})
elements.pause.addEventListener('click', () => active?.pause?.())
elements.resume.addEventListener('click', () => active?.resume?.())
elements.stop.addEventListener('click', () => active?.stop?.())
elements.replay.addEventListener('click', () => { void replayRetained() })
elements.runAll.addEventListener('click', () => { void runBatch() })
elements.cancelAll.addEventListener('click', cancelBatch)
elements.memorySnapshot.addEventListener('click', async () => {
  elements.memorySnapshot.disabled = true
  elements.memoryNote.textContent = '正在采集高级内存快照…'
  try {
    const result = await performance.measureUserAgentSpecificMemory()
    elements.memoryNote.textContent = `当前页面及 Worker 估算：${formatBytes(result.bytes)}`
  } catch (error) {
    elements.memoryNote.textContent = `采集失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    elements.memorySnapshot.disabled = !environmentProfile().advancedMemory
  }
})
document.addEventListener('visibilitychange', () => {
  if (active && document.hidden) hiddenDuringRun = true
})
window.addEventListener('beforeunload', () => {
  cancelActive('cancelled')
  destroyRetained()
})

renderEnvironment()
for (const group of Object.keys(metricDefinitions)) renderMetricGroup(group)
renderSummary({})
void loadFixtures().catch(error => {
  elements.fixtureCount.textContent = '读取失败'
  elements.warnings.replaceChildren(Object.assign(document.createElement('p'), {
    textContent: error instanceof Error ? error.message : String(error)
  }))
})
