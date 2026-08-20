const protocol = 'svga-visual-runner'
const cancelGraceMs = 250
const defaultRunTimeoutMs = 30_000

function createRunId () {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint32Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, value => value.toString(16)).join('-')
}

function timeoutFor (options) {
  if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) return options.timeoutMs
  if (Number.isFinite(options.maxPlaybackMs) && options.maxPlaybackMs >= 0) return options.maxPlaybackMs + 1_000
  return defaultRunTimeoutMs
}

export function createIsolatedRunner (runtime, { target = document.body, onEvent = () => {} } = {}) {
  if (runtime !== 'local' && runtime !== 'baseline') throw Error('runtime 必须是 local 或 baseline')
  const runId = createRunId()
  const origin = location.origin
  const frame = document.createElement('iframe')
  frame.title = `SVGA ${runtime} 隔离运行器`
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, {
    border: '0', height: '1px', left: '0', pointerEvents: 'none', position: 'absolute', top: '0', width: '1px'
  })
  frame.src = `/runner.html?runtime=${encodeURIComponent(runtime)}&runId=${encodeURIComponent(runId)}`
  let disposed = false
  let readyState = false
  let readySettled = false
  let coldRunStarted = false
  let runSettled = false
  let cancelRequested = false
  let runTimer = 0
  let cancelTimer = 0
  let readyTimer = 0
  let resolveReady
  let rejectReady
  let resolveRun
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  let completion

  const clearTimers = () => {
    window.clearTimeout(runTimer)
    window.clearTimeout(cancelTimer)
    window.clearTimeout(readyTimer)
    runTimer = 0
    cancelTimer = 0
    readyTimer = 0
  }
  const settleReady = (value, error) => {
    if (readySettled) return
    readySettled = true
    window.clearTimeout(readyTimer)
    readyTimer = 0
    if (error) rejectReady(error)
    else resolveReady(value)
  }
  const settleRun = message => {
    if (runSettled || !resolveRun) return
    runSettled = true
    clearTimers()
    resolveRun(message)
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimers()
    settleReady(undefined, Error('隔离运行器在就绪前被释放'))
    settleRun({ protocol, event: 'cancelled', runId, forced: true })
    window.removeEventListener('message', receive)
    frame.remove()
  }
  const forceDisposeAfterCancel = () => {
    settleRun({ protocol, event: 'cancelled', runId, forced: true })
    dispose()
  }
  const cancel = () => {
    if (disposed || cancelRequested) return completion
    cancelRequested = true
    frame.contentWindow?.postMessage({ protocol, event: 'cancel', runId }, origin)
    cancelTimer = window.setTimeout(forceDisposeAfterCancel, cancelGraceMs)
    return completion
  }
  const receive = event => {
    const message = event.data
    if (
      disposed || event.origin !== origin || event.source !== frame.contentWindow ||
      message?.protocol !== protocol || message.runId !== runId
    ) return
    if (message.event === 'ready') {
      readyState = true
      settleReady(message)
    } else if (message.event === 'error' && !readyState) {
      settleReady(undefined, Error(message.error?.message || '隔离运行器启动失败'))
    }
    if (['result', 'error', 'cancelled'].includes(message.event)) settleRun(message)
    onEvent(message)
    if (message.event === 'cancelled' && cancelRequested) dispose()
  }
  window.addEventListener('message', receive)
  target.append(frame)
  readyTimer = window.setTimeout(dispose, defaultRunTimeoutMs)
  return {
    frame,
    ready,
    run ({ buffer, fixture, options = {} }) {
      if (disposed) throw Error('隔离运行器已释放')
      if (!readyState) throw Error('隔离运行器尚未就绪')
      if (!(buffer instanceof ArrayBuffer)) throw Error('buffer 必须是 ArrayBuffer')
      if (coldRunStarted) throw Error('每个隔离运行器只能执行一次冷启动测量')
      coldRunStarted = true
      const transferred = buffer.slice(0)
      completion = new Promise(resolve => { resolveRun = resolve })
      runTimer = window.setTimeout(cancel, timeoutFor(options))
      try {
        frame.contentWindow?.postMessage({ protocol, event: 'run', runId, buffer: transferred, fixture, options }, origin, [transferred])
      } catch (error) {
        settleRun({ protocol, event: 'error', runId, error: { stage: 'protocol', message: error instanceof Error ? error.message : String(error) } })
      }
      return completion
    },
    cancel,
    dispose
  }
}
