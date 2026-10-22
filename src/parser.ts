import { ParserError, type ParserErrorCode } from './internal/errors'
import { MAX_IN_FLIGHT, REQUEST_TIMEOUT_MILLISECONDS } from './internal/limits'
import { copyNullMap } from './internal/maps'
import type { ParserConfigOptions, ParserLoadOptions, ParserProgress, Video } from './types'
import type {
  ParserWorkerLoad,
  ParserWorkerRequest,
  ParserWorkerResponse,
  ParserWorkerScope,
} from './parser/protocol'
import { validateVideo } from './validate-video'

const INLINE_WORKER_FLAG = '#PARSER_V2_INLINE_WROKER#'

interface PendingLoad {
  requestId: number
  url?: string
  bytes?: ArrayBuffer
  headers?: Record<string, string>
  timeout: number
  signal?: AbortSignal
  onProgress?: (progress: ParserProgress) => void
  onAbort?: () => void
  resolve: (video: Video) => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

interface ParserState {
  port: Worker | ParserWorkerScope
  direct: boolean
  workerUrl?: string
  pending: Map<number, PendingLoad>
  queue: PendingLoad[]
  inFlight: number
  maxInFlight: number
  headers?: Record<string, string>
}

const states = new WeakMap<Parser, ParserState>()
let nextRequestId = 0

function parserError(message: string, code: ParserErrorCode = 'parser/worker'): ParserError {
  return new ParserError(code, `[SVGA Parser Error] ${message}`)
}

function abortError(): Error {
  const error = Error('Aborted')
  error.name = 'AbortError'
  return error
}

function detach(request: PendingLoad): void {
  clearTimeout(request.timer)
  if (request.signal !== undefined && request.onAbort !== undefined)
    request.signal.removeEventListener('abort', request.onAbort)
}

function send(state: ParserState, request: ParserWorkerRequest, transfer?: Transferable[]): void {
  if (state.direct) {
    const port = state.port as ParserWorkerScope
    void port.onmessage?.({ data: request } as MessageEvent<ParserWorkerRequest>)
  } else {
    ;(state.port as Worker).postMessage(request, transfer as Transferable[])
  }
}

function normalizeVideo(video: Video): Video {
  video.images = copyNullMap(video.images)
  video.replaceElements = copyNullMap(video.replaceElements)
  video.dynamicElements = copyNullMap(video.dynamicElements)
  return validateVideo(video)
}

function revokeWorkerUrl(state: ParserState): void {
  const url = state.workerUrl
  if (url === undefined) return
  state.workerUrl = undefined
  try {
    window.URL.revokeObjectURL(url)
  } catch {}
}

function abortRequest(parser: Parser, state: ParserState, request: PendingLoad): void {
  if (states.get(parser) !== state) return
  detach(request)
  const queued = state.queue.indexOf(request)
  if (queued >= 0) {
    state.queue.splice(queued, 1)
  } else if (state.pending.get(request.requestId) === request) {
    state.pending.delete(request.requestId)
    state.inFlight--
    try {
      send(state, { requestId: request.requestId, cancel: true })
    } catch {}
  } else return
  request.reject(abortError())
  drain(parser, state)
}

function drain(parser: Parser, state: ParserState): void {
  if (states.get(parser) !== state) return
  while (state.inFlight < state.maxInFlight && state.queue.length > 0) {
    const request = state.queue.shift() as PendingLoad
    state.pending.set(request.requestId, request)
    state.inFlight++
    if (request.timeout > 0) {
      request.timer = setTimeout(() => {
        if (state.pending.get(request.requestId) !== request) return
        state.pending.delete(request.requestId)
        state.inFlight--
        detach(request)
        request.reject(parserError('Request timeout', 'parser/timeout'))
        try {
          send(state, { requestId: request.requestId, cancel: true })
        } catch {}
        drain(parser, state)
      }, request.timeout)
    }
    const message: ParserWorkerLoad = {
      requestId: request.requestId,
      url: request.url,
      bytes: request.bytes,
      headers: request.headers,
    }
    try {
      send(state, message, request.bytes === undefined ? undefined : [request.bytes])
    } catch (error) {
      detach(request)
      state.pending.delete(request.requestId)
      state.inFlight--
      request.reject(error instanceof Error ? error : Error(String(error)))
    }
  }
}

function handleResponse(parser: Parser, response: ParserWorkerResponse): void {
  const state = states.get(parser)
  if (state === undefined) return
  if ('ready' in response) {
    revokeWorkerUrl(state)
    return
  }
  if ('progress' in response) {
    const request = state.pending.get(response.requestId)
    if (request?.onProgress !== undefined) {
      try {
        request.onProgress(response.progress)
      } catch {}
    }
    return
  }
  const request = state.pending.get(response.requestId)
  if (request === undefined) return
  state.pending.delete(response.requestId)
  state.inFlight--
  detach(request)

  if (response.error !== undefined) {
    const error = new ParserError(response.error.code ?? 'parser/decode', response.error.message)
    error.name = response.error.name
    request.reject(error)
  } else if (response.video !== undefined) {
    try {
      request.resolve(normalizeVideo(response.video))
    } catch (error) {
      request.reject(error as Error)
    }
  } else {
    request.reject(parserError('Invalid worker response', 'parser/response'))
  }
  drain(parser, state)
}

function release(parser: Parser, error: Error): void {
  const state = states.get(parser)
  if (state === undefined) return
  states.delete(parser)
  for (const request of state.queue) {
    detach(request)
    request.reject(error)
  }
  state.queue.length = 0
  for (const request of state.pending.values()) {
    detach(request)
    request.reject(error)
  }
  state.pending.clear()
  state.inFlight = 0
  revokeWorkerUrl(state)

  if (state.direct) {
    try {
      send(state, { cancel: true })
    } catch {}
    ;(state.port as ParserWorkerScope).onmessage = undefined
  } else {
    ;(state.port as Worker).terminate()
  }
}

function mergeHeaders(
  base: Record<string, string> | undefined,
  override: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (base === undefined && override === undefined) return undefined
  return { ...base, ...override }
}

function copyBytes(source: ArrayBuffer | Uint8Array): ArrayBuffer {
  return source instanceof Uint8Array ? source.slice().buffer : source.slice(0)
}

export class Parser {
  constructor(options: ParserConfigOptions = {}) {
    const maxInFlight = options.maxInFlight ?? MAX_IN_FLIGHT
    if (!Number.isInteger(maxInFlight) || maxInFlight < 1 || maxInFlight > 8)
      throw parserError('Invalid maxInFlight', 'parser/config')
    const headers = options.headers
    const common = {
      pending: new Map<number, PendingLoad>(),
      queue: [],
      inFlight: 0,
      maxInFlight,
      headers,
    }
    let state: ParserState
    if (options.isDisableWebWorker === true) {
      const port: ParserWorkerScope = {
        postMessage: (response) => {
          handleResponse(this, response)
        },
      }
      state = { ...common, port, direct: true }
      states.set(this, state)
      try {
        // oxlint-disable-next-line no-new-func
        new Function('self', INLINE_WORKER_FLAG)(port)
      } catch (error) {
        states.delete(this)
        throw error
      }
    } else {
      const blobUrl = window.URL.createObjectURL(new Blob([INLINE_WORKER_FLAG]))
      let worker: Worker
      try {
        worker = new Worker(blobUrl)
      } catch (error) {
        try {
          window.URL.revokeObjectURL(blobUrl)
        } catch {}
        throw error
      }
      state = { ...common, port: worker, direct: false, workerUrl: blobUrl }
      states.set(this, state)
      worker.onmessage = ({ data }: MessageEvent<ParserWorkerResponse>) => {
        handleResponse(this, data)
      }
      worker.onerror = (event) => {
        event.preventDefault()
        release(this, parserError(event.message || 'Worker failure', 'parser/worker'))
      }
      worker.onmessageerror = () => {
        release(this, parserError('Worker message failure', 'parser/worker'))
      }
    }
  }

  async load(
    source: string | URL | ArrayBuffer | Uint8Array,
    options: ParserLoadOptions = {},
  ): Promise<Video> {
    const state = states.get(this)
    if (state === undefined) throw parserError('Parser destroyed', 'parser/destroyed')
    const signal = options.signal
    if (signal?.aborted === true) throw abortError()
    const timeout = options.timeout ?? REQUEST_TIMEOUT_MILLISECONDS
    if (!Number.isFinite(timeout) || timeout < 0)
      throw parserError('Invalid timeout', 'parser/config')

    let url: string | undefined
    let bytes: ArrayBuffer | undefined
    if (typeof source === 'string' || source instanceof URL) {
      const resolved = new URL(source, document.baseURI)
      if (!['http:', 'https:', 'data:', 'blob:'].includes(resolved.protocol))
        throw parserError('Unsupported URL protocol', 'parser/protocol')
      url = resolved.href
    } else {
      bytes = copyBytes(source)
    }
    const headers = mergeHeaders(state.headers, options.headers)

    return await new Promise<Video>((resolve, reject) => {
      const request: PendingLoad = {
        requestId: nextRequestId++,
        url,
        bytes,
        headers,
        timeout,
        signal,
        onProgress: options.onProgress,
        resolve,
        reject,
      }
      if (signal !== undefined) {
        request.onAbort = () => abortRequest(this, state, request)
        signal.addEventListener('abort', request.onAbort, { once: true })
      }
      state.queue.push(request)
      drain(this, state)
    })
  }

  public destroy(): void {
    release(this, parserError('Parser destroyed', 'parser/destroyed'))
  }
}
