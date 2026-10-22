import type { ParserErrorCode } from '../internal/errors'
import type { ParserProgress, Video } from '../types'

export interface ParserWorkerLoad {
  requestId: number
  url?: string
  bytes?: ArrayBuffer
  headers?: Record<string, string>
}

export type ParserWorkerRequest =
  | ParserWorkerLoad
  | { requestId: number; cancel: true }
  | { cancel: true }

export interface ParserWorkerResult {
  requestId: number
  video?: Video
  error?: { name: string; message: string; code?: ParserErrorCode }
}

export interface ParserWorkerProgress {
  requestId: number
  progress: ParserProgress
}

export type ParserWorkerResponse = { ready: true } | ParserWorkerResult | ParserWorkerProgress

export interface ParserWorkerScope {
  onmessage?: (event: MessageEvent<ParserWorkerRequest>) => void | Promise<void>
  postMessage: (response: ParserWorkerResponse, transfer?: Transferable[]) => void
}
