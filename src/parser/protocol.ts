import type { ParserErrorCode } from '../internal/errors'
import type { Video } from '../types'

export type ParserWorkerRequest =
  | { requestId: number; url: string }
  | { requestId: number; cancel: true }
  | { cancel: true }

export interface ParserWorkerResult {
  requestId: number
  video?: Video
  error?: { name: string; message: string; code?: ParserErrorCode }
}

export type ParserWorkerResponse = { ready: true } | ParserWorkerResult

export interface ParserWorkerScope {
  onmessage?: (event: MessageEvent<ParserWorkerRequest>) => void | Promise<void>
  postMessage: (response: ParserWorkerResponse, transfer?: Transferable[]) => void
}
