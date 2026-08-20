import type { Video } from '../types'

export type ParserWorkerRequest =
  | { requestId: number, url: string }
  | { requestId: number, cancel: true }
  | { cancel: true }

export interface ParserWorkerResponse {
  requestId: number
  video?: Video
  error?: { name: string, message: string }
}

export interface ParserWorkerScope {
  onmessage?: (event: MessageEvent<ParserWorkerRequest>) => void | Promise<void>
  postMessage: (response: ParserWorkerResponse, transfer?: Transferable[]) => void
}
