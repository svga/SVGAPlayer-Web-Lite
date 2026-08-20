const protocol = 'svga-visual-runner'

function createRunId () {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint32Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, value => value.toString(16)).join('-')
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
  let coldRunStarted = false
  let resolveReady
  let rejectReady
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const receive = event => {
    const message = event.data
    if (
      disposed || event.origin !== origin || event.source !== frame.contentWindow ||
      message?.protocol !== protocol || message.runId !== runId
    ) return
    if (message.event === 'ready') {
      readyState = true
      resolveReady(message)
    } else if (message.event === 'error' && !readyState) {
      rejectReady(Error(message.error?.message || '隔离运行器启动失败'))
    }
    onEvent(message)
  }
  window.addEventListener('message', receive)
  target.append(frame)
  return {
    frame,
    ready,
    run ({ buffer, fixture, options = {} }) {
      if (disposed) throw Error('隔离运行器已释放')
      if (!readyState) throw Error('隔离运行器尚未就绪')
      if (!(buffer instanceof ArrayBuffer)) throw Error('buffer 必须是 ArrayBuffer')
      if (coldRunStarted) throw Error('每个隔离运行器只能执行一次冷启动测量')
      coldRunStarted = true
      frame.contentWindow?.postMessage({ protocol, event: 'run', runId, buffer, fixture, options }, origin, [buffer])
    },
    cancel () {
      if (!disposed) frame.contentWindow?.postMessage({ protocol, event: 'cancel', runId }, origin)
    },
    dispose () {
      if (disposed) return
      disposed = true
      window.removeEventListener('message', receive)
      frame.remove()
    }
  }
}
