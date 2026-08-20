import { Video, MockWebWorker, ParserConfigOptions } from './types'

const INLINE_WORKER_FLAG = '#PARSER_V2_INLINE_WROKER#'

interface ParserWorkerRequest {
  requestId?: number
  url?: string
  options?: {
    isDisableImageBitmapShim: boolean
  }
  cancel?: boolean
}

interface ParserWorkerResponse {
  requestId: number
  video?: Video
  error?: {
    name: string
    message: string
  }
}

interface PendingLoad {
  resolve: (video: Video) => void
  reject: (error: Error) => void
}

interface ParserState {
  blobUrl?: string
  pending: Map<number, PendingLoad>
}

interface DirectWorker extends MockWebWorker {
  onresponse?: (data: ParserWorkerResponse) => void
}

const parserStates = new WeakMap<Parser, ParserState>()
let nextRequestId = 0

const parserState = (parser: Parser): ParserState | undefined => {
  return parserStates.get(parser)
}

const rejectPending = (state: ParserState, error: Error): void => {
  for (const request of state.pending.values()) request.reject(error)
  state.pending.clear()
}

const normalizeVideoImages = (video: Video): Video => {
  const images: Video['images'] = Object.create(null)
  for (const key of Object.keys(video.images)) images[key] = video.images[key]
  video.images = images
  return video
}

const handleResponse = (parser: Parser, response: ParserWorkerResponse): void => {
  const state = parserState(parser)
  if (state === undefined) return
  const pending = state.pending.get(response.requestId)
  if (pending === undefined) return
  state.pending.delete(response.requestId)

  if (response.error !== undefined) {
    const error = Error(response.error.message)
    error.name = response.error.name
    pending.reject(error)
  } else if (response.video !== undefined) {
    pending.resolve(normalizeVideoImages(response.video))
  } else {
    pending.reject(Error())
  }
}

const releaseParser = (parser: Parser, state: ParserState, error: Error): void => {
  if (parserStates.get(parser) !== state) return
  parserStates.delete(parser)
  rejectPending(state, error)
  if (parser.worker instanceof Worker) {
    parser.worker.terminate()
    if (state.blobUrl !== undefined) window.URL.revokeObjectURL(state.blobUrl)
  } else {
    const worker = parser.worker as DirectWorker
    try { worker.onmessage({ data: { cancel: true } } as never) } catch {}
    worker.onresponse = () => {}
    worker.onmessageCallback = () => {}
    if (window.SVGAParserMockWorker === worker) window.SVGAParserMockWorker = undefined
  }
}

/**
 * SVGA 下载解析器
 */
export class Parser {
  public worker: MockWebWorker | Worker
  private readonly isDisableImageBitmapShim: boolean

  constructor (options: ParserConfigOptions = {}) {
    const { isDisableWebWorker, isDisableImageBitmapShim } = options
    this.isDisableImageBitmapShim = isDisableImageBitmapShim === true
    const state: ParserState = { pending: new Map() }
    if (isDisableWebWorker === true) {
      // eslint-disable-next-line no-eval
      window.eval(INLINE_WORKER_FLAG)
      if (window.SVGAParserMockWorker === undefined) throw Error('SVGAParserMockWorker undefined')
      this.worker = window.SVGAParserMockWorker
    } else {
      const blobUrl = window.URL.createObjectURL(new Blob([INLINE_WORKER_FLAG]))
      try {
        this.worker = new Worker(blobUrl)
      } catch (error) {
        window.URL.revokeObjectURL(blobUrl)
        throw error
      }
      state.blobUrl = blobUrl
    }
    parserStates.set(this, state)

    if (this.worker instanceof Worker) {
      this.worker.onmessage = ({ data }: MessageEvent<ParserWorkerResponse>) => {
        handleResponse(this, data)
      }
      this.worker.onerror = event => {
        releaseParser(this, state, Error(event.message || 'Worker'))
      }
      this.worker.onmessageerror = () => {
        releaseParser(this, state, Error())
      }
    } else {
      ;(this.worker as DirectWorker).onresponse = data => {
        handleResponse(this, data)
      }
    }
  }

  /**
   * 通过 url 下载并解析 SVGA 文件
   * @param url SVGA 文件的下载链接
   * @returns Promise<SVGA 数据源>
   */
  async load (url: string): Promise<Video> {
    return new Promise((resolve, reject) => {
      if (url === undefined) throw Error('url undefined')
      if (this.worker === undefined) throw Error('Parser Worker not found')
      const state = parserState(this)
      if (state === undefined) throw Error('[SVGA Parser Error] Parser destroyed')
      url = new URL(url, document.baseURI).href
      const { isDisableImageBitmapShim } = this
      const requestId = nextRequestId++
      const postData: ParserWorkerRequest = { requestId, url, options: { isDisableImageBitmapShim } }
      state.pending.set(requestId, { resolve, reject })
      try {
        if (this.worker instanceof Worker) {
          this.worker.postMessage(postData)
        } else {
          void this.worker.onmessage({ data: postData as never })
        }
      } catch (error) {
        state.pending.delete(requestId)
        reject(error)
      }
    })
  }

  /**
   * 销毁实例
   */
  public destroy (): void {
    const state = parserStates.get(this)
    if (state === undefined) return
    releaseParser(this, state, Error('[SVGA Parser Error] Parser destroyed'))
  }
}
