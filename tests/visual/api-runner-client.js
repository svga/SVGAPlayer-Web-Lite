const protocol = 'svga-api-lab'
const startupTimeoutMs = 30_000
const browserTimeoutMaxMs = 0x7fffffff

export const apiCancelGraceMs = 250
export { protocol as apiProtocol }

function safeTimeout(value) {
  return Math.min(browserTimeoutMaxMs, Math.max(1, Math.floor(value)))
}

function createRunId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint32Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16)).join('-')
}

export function apiRunnerTimeoutFor(definition, rounds = 1) {
  const perRound =
    Number.isFinite(definition?.timeoutMs) && definition.timeoutMs > 0
      ? definition.timeoutMs
      : 6_000
  if (!(definition?.repeats > 0)) return safeTimeout(perRound + 1_500)
  const bounded = Number.isInteger(rounds) ? Math.min(5, Math.max(1, rounds)) : 1
  const warmup = bounded >= 3 ? 1 : 0
  return safeTimeout(perRound * (bounded + warmup) + 2_500)
}

export function isApiRunnerMessage(event, { origin, source, runId }) {
  return (
    event?.origin === origin &&
    event?.source === source &&
    event?.data?.protocol === protocol &&
    event.data.runId === runId
  )
}

export function createApiRunner(
  runtime,
  { target = document.body, onEvent = () => {}, visible = false } = {},
) {
  if (runtime !== 'local' && runtime !== 'baseline') throw Error('runtime 必须是 local 或 baseline')
  const runId = createRunId()
  const origin = location.origin
  const frame = document.createElement('iframe')
  frame.title = `SVGA ${runtime} API 隔离运行器`
  frame.dataset.testid = 'api-runner-frame'
  frame.dataset.runtime = runtime
  frame.setAttribute('aria-hidden', visible ? 'false' : 'true')
  Object.assign(
    frame.style,
    visible
      ? {
          border: '0',
          display: 'block',
          height: '18rem',
          width: '100%',
        }
      : {
          border: '0',
          height: '1px',
          left: '0',
          pointerEvents: 'none',
          position: 'absolute',
          top: '0',
          width: '1px',
        },
  )
  frame.src = `/api-runner.html?runtime=${encodeURIComponent(runtime)}&runId=${encodeURIComponent(runId)}`

  let disposed = false
  let readyState = false
  let readySettled = false
  let readyTimer = 0
  let resolveReady
  let rejectReady
  let attempt = 0
  let active = null
  let cancelTimer = 0
  let lastTimedOut = false

  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  const clearCancelTimer = () => {
    window.clearTimeout(cancelTimer)
    cancelTimer = 0
  }
  const settleReady = (value, error) => {
    if (readySettled) return
    readySettled = true
    window.clearTimeout(readyTimer)
    readyTimer = 0
    if (error) rejectReady(error)
    else resolveReady(value)
  }
  const settleActive = (result, forced = false) => {
    if (!active) return
    const current = active
    active = null
    clearCancelTimer()
    current.resolve({ ...result, forced })
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearCancelTimer()
    settleReady(undefined, Error('API 隔离运行器在就绪前被释放'))
    settleActive({ status: 'cancelled', key: active?.key, attempt: active?.attempt }, true)
    window.removeEventListener('message', receive)
    frame.remove()
  }
  const receive = (event) => {
    if (disposed || !isApiRunnerMessage(event, { origin, source: frame.contentWindow, runId }))
      return
    const message = event.data
    if (message.event === 'ready') {
      readyState = true
      settleReady(message)
    } else if (message.event === 'error' && !readyState) {
      settleReady(undefined, Error(message.error?.message || 'API 隔离运行器启动失败'))
    }
    if (active && message.key === active.key && message.attempt === active.attempt) {
      if (message.event === 'case-result') settleActive(message.result || { status: 'error' })
      else if (message.event === 'case-cancelled')
        settleActive({ status: 'cancelled', key: message.key, attempt: message.attempt })
    }
    try {
      onEvent(message)
    } catch (error) {
      window.setTimeout(() => console.warn('SVGA API runner callback failed', error), 0)
    }
  }

  window.addEventListener('message', receive)
  target.append(frame)
  readyTimer = window.setTimeout(
    () => settleReady(undefined, Error('API 隔离运行器启动超时')),
    startupTimeoutMs,
  )

  return {
    frame,
    ready,
    runtime,
    get disposed() {
      return disposed
    },
    get timedOut() {
      return lastTimedOut
    },
    runCase({ key, caseId, fixtureName, options = {}, timeoutMs }) {
      if (disposed) throw Error('API 隔离运行器已释放')
      if (!readyState) throw Error('API 隔离运行器尚未就绪')
      if (active) throw Error('API 隔离运行器已有进行中的用例')
      const currentAttempt = ++attempt
      lastTimedOut = false
      return new Promise((resolve) => {
        active = {
          key,
          attempt: currentAttempt,
          resolve,
          timedOut: false,
        }
        const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? safeTimeout(timeoutMs) : 8_000
        const timer = window.setTimeout(() => {
          if (!active || active.key !== key || active.attempt !== currentAttempt) return
          active.timedOut = true
          lastTimedOut = true
          frame.contentWindow?.postMessage(
            { protocol, event: 'cancel', runId, attempt: currentAttempt, key },
            origin,
          )
          settleActive({ status: 'timeout', key, attempt: currentAttempt })
        }, budget)
        const originalResolve = active.resolve
        active.resolve = (result) => {
          window.clearTimeout(timer)
          originalResolve(result)
        }
        try {
          frame.contentWindow?.postMessage(
            {
              protocol,
              event: 'run-case',
              runId,
              attempt: currentAttempt,
              key,
              caseId,
              fixture: fixtureName ? { name: fixtureName } : null,
              options,
            },
            origin,
          )
        } catch (error) {
          window.clearTimeout(timer)
          settleActive({
            status: 'error',
            key,
            attempt: currentAttempt,
            error: { message: error instanceof Error ? error.message : String(error) },
          })
        }
      })
    },
    cancelCase() {
      if (disposed || !active) return
      const current = active
      frame.contentWindow?.postMessage(
        { protocol, event: 'cancel', runId, attempt: current.attempt, key: current.key },
        origin,
      )
      cancelTimer = window.setTimeout(() => {
        settleActive({ status: 'cancelled', key: current.key, attempt: current.attempt }, true)
        dispose()
      }, apiCancelGraceMs)
    },
    dispose,
  }
}
