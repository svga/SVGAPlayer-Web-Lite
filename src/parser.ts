import type { ParserConfigOptions, Video } from './types'
import type { ParserWorkerRequest, ParserWorkerResponse, ParserWorkerScope } from './parser/protocol'
import { validateVideo } from './validate-video'

const INLINE_WORKER_FLAG = '#PARSER_V2_INLINE_WROKER#'
const maxInFlight = 4
const timeoutMilliseconds = 30_000

interface PendingLoad {
  requestId: number
  url: string
  resolve: (video: Video) => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

interface ParserState {
  port: Worker | ParserWorkerScope
  direct: boolean
  pending: Map<number, PendingLoad>
  queue: PendingLoad[]
  inFlight: number
}

const states = new WeakMap<Parser, ParserState>()
let nextRequestId = 0

function parserError (message: string): Error {
  return Error(`[SVGA Parser Error] ${message}`)
}

function send (state: ParserState, request: ParserWorkerRequest): void {
  if (state.direct) {
    const port = state.port as ParserWorkerScope
    void port.onmessage?.({ data: request } as MessageEvent<ParserWorkerRequest>)
  } else {
    ;(state.port as Worker).postMessage(request)
  }
}

function copyNullMap<T> (source: Record<string, T>): Record<string, T> {
  const target = Object.create(null) as Record<string, T>
  for (const key of Object.keys(source)) target[key] = source[key]
  return target
}

function normalizeVideo (video: Video): Video {
  video.images = copyNullMap(video.images)
  video.replaceElements = copyNullMap(video.replaceElements)
  video.dynamicElements = copyNullMap(video.dynamicElements)
  return validateVideo(video)
}

function drain (parser: Parser, state: ParserState): void {
  if (states.get(parser) !== state) return
  while (state.inFlight < maxInFlight && state.queue.length > 0) {
    const request = state.queue.shift() as PendingLoad
    state.pending.set(request.requestId, request)
    state.inFlight++
    request.timer = setTimeout(() => {
      if (state.pending.get(request.requestId) !== request) return
      state.pending.delete(request.requestId)
      state.inFlight--
      request.reject(parserError('Request timeout'))
      try { send(state, { requestId: request.requestId, cancel: true }) } catch {}
      drain(parser, state)
    }, timeoutMilliseconds)
    try {
      send(state, { requestId: request.requestId, url: request.url })
    } catch (error) {
      clearTimeout(request.timer)
      state.pending.delete(request.requestId)
      state.inFlight--
      request.reject(error instanceof Error ? error : Error(String(error)))
    }
  }
}

function handleResponse (parser: Parser, response: ParserWorkerResponse): void {
  const state = states.get(parser)
  if (state === undefined) return
  const request = state.pending.get(response.requestId)
  if (request === undefined) return
  state.pending.delete(response.requestId)
  state.inFlight--
  clearTimeout(request.timer)

  if (response.error !== undefined) {
    const error = Error(response.error.message)
    error.name = response.error.name
    request.reject(error)
  } else if (response.video !== undefined) {
    try { request.resolve(normalizeVideo(response.video)) } catch (error) { request.reject(error as Error) }
  } else {
    request.reject(parserError('Invalid worker response'))
  }
  drain(parser, state)
}

function release (parser: Parser, error: Error): void {
  const state = states.get(parser)
  if (state === undefined) return
  states.delete(parser)
  for (const request of state.queue) request.reject(error)
  state.queue.length = 0
  for (const request of state.pending.values()) {
    clearTimeout(request.timer)
    request.reject(error)
  }
  state.pending.clear()
  state.inFlight = 0

  if (state.direct) {
    try { send(state, { cancel: true }) } catch {}
    ;(state.port as ParserWorkerScope).onmessage = undefined
  } else {
    ;(state.port as Worker).terminate()
  }
}

export class Parser {
  constructor (options: ParserConfigOptions = {}) {
    let state: ParserState
    if (options.isDisableWebWorker === true) {
      const port: ParserWorkerScope = {
        postMessage: response => { handleResponse(this, response) }
      }
      state = { port, direct: true, pending: new Map(), queue: [], inFlight: 0 }
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
      } finally {
        setTimeout(window.URL.revokeObjectURL, 0, blobUrl)
      }
      state = { port: worker, direct: false, pending: new Map(), queue: [], inFlight: 0 }
      states.set(this, state)
      worker.onmessage = ({ data }: MessageEvent<ParserWorkerResponse>) => { handleResponse(this, data) }
      worker.onerror = event => { release(this, parserError(event.message || 'Worker failure')) }
      worker.onmessageerror = () => { release(this, parserError('Worker message failure')) }
    }
  }

  async load (source: string): Promise<Video> {
    const state = states.get(this)
    if (state === undefined) throw parserError('Parser destroyed')
    const url = new URL(source, document.baseURI)
    if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) throw parserError('Unsupported URL protocol')

    return await new Promise<Video>((resolve, reject) => {
      state.queue.push({ requestId: nextRequestId++, url: url.href, resolve, reject })
      drain(this, state)
    })
  }

  public destroy (): void {
    release(this, parserError('Parser destroyed'))
  }
}
