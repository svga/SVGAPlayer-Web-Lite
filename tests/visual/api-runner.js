import { API_CASE_RUNNERS } from './api-case-runners.js'
import { caseById } from './api-cases.js'
import { environmentProfile, nextPaint } from './metrics.js'

const protocol = 'svga-api-lab'
const query = new URLSearchParams(location.search)
const runtime = query.get('runtime')
const runId = query.get('runId')
const parentOrigin = location.origin
const stage = document.querySelector('#api-stage')
const fixtureCache = new Map()
let active = null
let nameCounter = 0

class ApiSkip extends Error {}
class ApiTimeout extends Error {}
class ApiCancel extends Error {}

function send(event, payload = {}) {
  window.parent.postMessage({ protocol, event, runId, ...payload }, parentOrigin)
}

function captureAsyncError(error) {
  if (!active || active.terminal) return
  active.asyncError = {
    stage: active.stage,
    message: error instanceof Error ? error.message : String(error),
  }
}

window.addEventListener('error', (event) => {
  if (active) {
    captureAsyncError(event.error || event.message)
    event.preventDefault()
  }
})
window.addEventListener('unhandledrejection', (event) => {
  if (active) {
    captureAsyncError(event.reason)
    event.preventDefault()
  }
})

function canEvaluate() {
  try {
    // oxlint-disable-next-line no-new-func
    new Function('return 1')()
    return true
  } catch {
    return false
  }
}

function probeCapabilities(warnings) {
  const capabilities = {
    worker: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    imageBitmap: typeof createImageBitmap === 'function',
    indexedDB: typeof indexedDB !== 'undefined',
    dbList: typeof indexedDB?.databases === 'function',
    eval: canEvaluate(),
  }
  try {
    const canvas = document.createElement('canvas')
    const player = new window.SVGA.Player({ container: canvas })
    capabilities.playerState = typeof player.state === 'string'
    capabilities.playerProgress = typeof player.progress === 'number'
    capabilities.playerIsPlaying = typeof player.isPlaying === 'boolean'
    capabilities.playerStepToFrame = typeof player.stepToFrame === 'function'
    capabilities.playerFrozenConfig = Object.isFrozen(player.config)
    capabilities.playerDisableOffscreen = 'isDisableOffscreenCanvas' in player.config
    capabilities.db = typeof window.SVGA.DB === 'function'
    player.destroy()
  } catch (error) {
    warnings.push(`Player 能力探测失败：${error instanceof Error ? error.message : String(error)}`)
  }
  return capabilities
}

async function fixtureBytes(name) {
  if (fixtureCache.has(name)) return fixtureCache.get(name)
  const response = await fetch(`/fixtures/${encodeURIComponent(name)}`, { cache: 'no-store' })
  if (!response.ok) throw Error(`读取素材失败：${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  fixtureCache.set(name, bytes)
  return bytes
}

function createContext({ caseId, fixtureName, options }) {
  const meta = caseById(caseId)
  const checks = []
  const parity = {}
  const timings = {}
  const warnings = []
  const cleanups = []
  let cleanupPromise = null

  const runCleanups = () => {
    if (cleanupPromise !== null) return cleanupPromise
    cleanupPromise = (async () => {
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup()
        } catch {}
      }
    })()
    return cleanupPromise
  }

  const createCanvas = () => {
    const canvas = document.createElement('canvas')
    canvas.className = 'api-case-canvas'
    stage.append(canvas)
    cleanups.push(() => canvas.remove())
    return canvas
  }

  const newParser = (parserOptions) => {
    const parser =
      parserOptions === undefined ? new window.SVGA.Parser() : new window.SVGA.Parser(parserOptions)
    cleanups.push(() => parser.destroy())
    return parser
  }

  const newPlayer = (playerOptions = {}) => {
    const container = createCanvas()
    const player = new window.SVGA.Player({ container, ...playerOptions })
    cleanups.push(() => player.destroy())
    return player
  }

  const fixtureUrl = (name) =>
    new URL(`/fixtures/${encodeURIComponent(name)}`, location.origin).href

  const context = {
    SVGA: window.SVGA,
    runtime,
    meta,
    fixture: fixtureName ? { name: fixtureName } : null,
    options: options || {},
    checks,
    parity,
    timings,
    warnings,
    check(id, label, passed, detail) {
      checks.push({
        id,
        label,
        passed: Boolean(passed),
        ...(detail === undefined ? {} : { detail: String(detail) }),
      })
    },
    warning(message) {
      warnings.push(String(message))
    },
    timing(name, value) {
      if (!Number.isFinite(value)) return
      if (!timings[name]) timings[name] = []
      timings[name].push(value)
    },
    cleanup(fn) {
      cleanups.push(fn)
    },
    createCanvas,
    newParser,
    newPlayer,
    fixtureUrl,
    fixtureBytes,
    uniqueName(prefix) {
      nameCounter++
      const safe = String(prefix).replace(/[^0-9A-Za-z_-]/g, '-')
      return `${safe}-${runId.slice(0, 8)}-${nameCounter}-${Date.now().toString(36)}`
    },
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    },
    nextPaint,
    skip(reason) {
      throw new ApiSkip(String(reason))
    },
    async parseFixture() {
      const bytes = await fixtureBytes(fixtureName)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
      try {
        return await newParser().load(url)
      } finally {
        URL.revokeObjectURL(url)
      }
    },
  }
  return { context, runCleanups }
}

function mergeChecks(target, source) {
  for (const check of source) {
    const existing = target.find((candidate) => candidate.id === check.id)
    if (!existing) target.push({ ...check })
    else if (!check.passed) {
      existing.passed = false
      existing.detail = check.detail ?? existing.detail
    }
  }
}

function mergeTimings(target, source) {
  for (const [name, values] of Object.entries(source)) {
    if (!Array.isArray(values)) continue
    if (!target[name]) target[name] = []
    target[name].push(...values.filter((value) => Number.isFinite(value)))
  }
}

function roundClamp(value) {
  if (!Number.isInteger(value)) return 1
  return Math.min(5, Math.max(1, value))
}

async function runCase(message) {
  if (active) {
    send('error', {
      key: message.key,
      attempt: message.attempt,
      error: { message: 'API 运行器正忙' },
    })
    return
  }
  const definition = caseById(message.caseId)
  if (definition === undefined) {
    send('case-result', {
      key: message.key,
      attempt: message.attempt,
      result: {
        status: 'error',
        error: { message: `未知用例：${message.caseId}` },
      },
    })
    return
  }
  const executor = API_CASE_RUNNERS[message.caseId]
  if (executor === undefined) {
    send('case-result', {
      key: message.key,
      attempt: message.attempt,
      result: {
        status: 'error',
        error: { message: `用例没有执行器：${message.caseId}` },
      },
    })
    return
  }

  let cancelReject
  const cancelPromise = new Promise((_, reject) => {
    cancelReject = () => reject(new ApiCancel())
  })
  // Cancellation can arrive after the race settles; without this handler the
  // rejection would surface as an unhandled rejection in the runner realm.
  cancelPromise.catch(() => {})
  const token = {
    key: message.key,
    attempt: message.attempt,
    cancelled: false,
    terminal: false,
    stage: 'setup',
    ctx: null,
    asyncError: null,
    cancelReject,
  }
  active = token
  const started = performance.now()
  const rounds = definition.repeats > 0 ? roundClamp(message.options?.rounds) : 1
  const warmup = rounds >= 3 ? 1 : 0
  const merged = {
    checks: [],
    parity: null,
    timings: {},
    warnings: [],
  }
  let measured = 0
  let failure = null
  let skippedReason = null

  send('case-start', {
    key: message.key,
    caseId: message.caseId,
    attempt: message.attempt,
    rounds,
    fixtureName: message.fixture?.name || null,
  })

  try {
    for (let iteration = 0; iteration < rounds + warmup; iteration++) {
      if (token.cancelled) break
      token.stage = `round-${iteration + 1}`
      const built = createContext({
        caseId: message.caseId,
        fixtureName: message.fixture?.name || null,
        options: message.options,
      })
      token.ctx = built
      let timer = 0
      try {
        await Promise.race([
          executor(built.context),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new ApiTimeout()), definition.timeoutMs)
          }),
          cancelPromise,
        ])
      } catch (error) {
        if (error instanceof ApiSkip) skippedReason = error.message
        else if (!(error instanceof ApiCancel) && !token.cancelled) failure = error
      } finally {
        clearTimeout(timer)
        await built.runCleanups()
        if (
          token.asyncError !== null &&
          failure === null &&
          skippedReason === null &&
          !token.cancelled
        )
          failure = Error(token.asyncError.message)
        token.asyncError = null
        if (token.ctx === built) token.ctx = null
      }
      if (token.cancelled || skippedReason !== null || failure !== null) break
      if (iteration >= warmup) {
        measured++
        mergeChecks(merged.checks, built.context.checks)
        mergeTimings(merged.timings, built.context.timings)
        for (const warning of built.context.warnings) {
          if (!merged.warnings.includes(warning)) merged.warnings.push(warning)
        }
        if (merged.parity === null) merged.parity = built.context.parity
        else if (
          JSON.stringify(merged.parity) !== JSON.stringify(built.context.parity) &&
          !merged.warnings.includes('不同轮次的行为观测值不一致')
        )
          merged.warnings.push('不同轮次的行为观测值不一致')
      }
    }
  } finally {
    if (active === token) {
      token.terminal = true
      active = null
    }
  }

  const base = {
    key: message.key,
    attempt: message.attempt,
    durationMs: Number((performance.now() - started).toFixed(2)),
    rounds,
    measuredRounds: measured,
  }

  if (token.cancelled) {
    send('case-cancelled', { key: message.key, attempt: message.attempt })
    return
  }
  if (skippedReason !== null) {
    send('case-result', {
      ...base,
      result: {
        status: 'skipped',
        reason: skippedReason,
        checks: merged.checks,
        parity: merged.parity,
        timings: merged.timings,
        warnings: merged.warnings,
      },
    })
    return
  }
  if (failure !== null) {
    const timeout = failure instanceof ApiTimeout
    send('case-result', {
      ...base,
      result: {
        status: timeout ? 'timeout' : 'error',
        error: {
          message: failure instanceof Error ? failure.message : String(failure),
          name: failure?.name || 'Error',
        },
        checks: merged.checks,
        parity: merged.parity,
        timings: merged.timings,
        warnings: merged.warnings,
      },
    })
    return
  }

  const passed = merged.checks.every((check) => check.passed)
  send('case-result', {
    ...base,
    result: {
      status: passed ? 'passed' : 'failed',
      checks: merged.checks,
      parity: merged.parity,
      timings: merged.timings,
      warnings: merged.warnings,
    },
  })
}

function abortActive() {
  if (!active || active.cancelled) return
  active.cancelled = true
  active.cancelReject?.()
  const built = active.ctx
  active.ctx = null
  void built?.runCleanups()
}

function acceptMessage(event) {
  const message = event.data
  return (
    event.origin === parentOrigin &&
    event.source === window.parent &&
    message?.protocol === protocol &&
    message.runId === runId
  )
}

window.addEventListener('message', (event) => {
  if (!acceptMessage(event)) return
  const message = event.data
  if (message.event === 'cancel') abortActive()
  else if (message.event === 'run-case') void runCase(message)
})
window.addEventListener('beforeunload', abortActive)

function startRuntime() {
  if ((runtime !== 'local' && runtime !== 'baseline') || !runId || window.parent === window) {
    send('error', { error: { message: '无效的 runtime 或 runId' } })
    return
  }
  const script = document.createElement('script')
  script.src = `/runtime/${runtime}.js`
  script.onload = () => {
    if (
      typeof window.SVGA?.Parser !== 'function' ||
      typeof window.SVGA?.Player !== 'function' ||
      typeof window.SVGA?.DB !== 'function'
    ) {
      send('error', {
        error: { message: '运行时没有提供 SVGA.Parser、SVGA.Player 和 SVGA.DB' },
      })
      return
    }
    const warnings = []
    const capabilities = probeCapabilities(warnings)
    send('ready', {
      runtime,
      capabilities,
      environment: environmentProfile(),
      warnings,
    })
  }
  script.onerror = () => send('error', { error: { message: '运行时脚本加载失败' } })
  document.head.append(script)
}

startRuntime()
