import { Unzlib } from 'fflate'

import { ParserError, type ParserErrorCode } from '../internal/errors'
import {
  DOWNLOAD_CHUNK_BYTES,
  MAX_COMPRESSED_BYTES,
  MAX_DECOMPRESSED_BYTES,
} from '../internal/limits'
import { createNullMap } from '../internal/maps'
import type { Movie, ParserProgress, RawImages, Video } from '../types'
import { validateVideo } from '../validate-video'
import { com } from './svga.generated'
import type { ParserWorkerRequest, ParserWorkerResult, ParserWorkerScope } from './protocol'
import { createVideo } from './video-entity'
import { scanMovieWire } from './wire-scan'

async function download(
  url: string,
  signal: AbortSignal,
  headers: Record<string, string> | undefined,
  report: (loaded: number, stage: ParserProgress['stage'], total?: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url, { signal, headers })
  if (response.status < 200 || response.status >= 300)
    throw new ParserError('parser/fetch', `Fetch, ${response.statusText || response.status}`)

  const declared = response.headers.get('content-length')
  const parsed = Number(declared)
  const total = declared === null || !Number.isFinite(parsed) || parsed < 0 ? undefined : parsed
  const chunks: Uint8Array[] = []
  let length = 0
  let reported = 0
  const progress = (loaded: number): void => {
    if (loaded - reported < DOWNLOAD_CHUNK_BYTES) return
    reported = loaded
    report(loaded, 'download', total)
  }
  const reader = response.body?.getReader()
  if (reader !== undefined) {
    try {
      for (;;) {
        const result = await reader.read()
        if (result.done) break
        const chunk = result.value
        length += chunk.byteLength
        if (length > MAX_COMPRESSED_BYTES)
          throw new ParserError('parser/limit', 'Compressed SVGA exceeds 8 MiB')
        chunks.push(chunk)
        progress(length)
      }
    } catch (error) {
      try {
        await reader.cancel(error)
      } catch {}
      throw error
    } finally {
      reader.releaseLock()
    }
  } else {
    const chunk = new Uint8Array(await response.arrayBuffer())
    length = chunk.byteLength
    if (length > MAX_COMPRESSED_BYTES)
      throw new ParserError('parser/limit', 'Compressed SVGA exceeds 8 MiB')
    chunks.push(chunk)
  }

  if (reported !== length) report(length, 'download', total)
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function inflate(source: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  let length = 0
  const stream = new Unzlib((chunk) => {
    length += chunk.byteLength
    if (length > MAX_DECOMPRESSED_BYTES)
      throw new ParserError('parser/limit', 'Decompressed SVGA exceeds 16 MiB')
    chunks.push(chunk.slice())
  })
  const chunkSize = DOWNLOAD_CHUNK_BYTES
  if (source.length === 0) stream.push(source, true)
  for (let offset = 0; offset < source.length; offset += chunkSize) {
    const end = Math.min(source.length, offset + chunkSize)
    stream.push(source.subarray(offset, end), end === source.length)
  }
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function imageEntries(images: Movie['images']): Array<[string, Uint8Array]> {
  return Object.keys(images).map((key) => [key, images[key]])
}

function imageMap(movie: Movie): RawImages {
  const images = createNullMap<Uint8Array>()
  for (const [key, value] of imageEntries(movie.images)) {
    if (!key.startsWith('audio')) images[key] = value
  }
  return images
}

function transferList(video: Video): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>()
  for (const image of Object.values(video.images)) {
    if (image.buffer instanceof ArrayBuffer) buffers.add(image.buffer)
  }
  return [...buffers]
}

function installParserWorker(scope: ParserWorkerScope): void {
  const controllers = new Map<number, AbortController>()

  scope.onmessage = async (event: MessageEvent<ParserWorkerRequest>): Promise<void> => {
    const request = event.data
    if ('cancel' in request) {
      if ('requestId' in request) controllers.get(request.requestId)?.abort()
      else for (const controller of controllers.values()) controller.abort()
      return
    }

    const controller = new AbortController()
    controllers.set(request.requestId, controller)
    const report = (loaded: number, stage: ParserProgress['stage'], total?: number): void => {
      scope.postMessage({ requestId: request.requestId, progress: { loaded, stage, total } })
    }
    let response: ParserWorkerResult
    let completed = false
    try {
      const compressed =
        request.bytes === undefined
          ? await download(request.url as string, controller.signal, request.headers, report)
          : new Uint8Array(request.bytes)
      if (request.bytes !== undefined) report(compressed.length, 'download', compressed.length)
      if (
        compressed[0] === 80 &&
        compressed[1] === 75 &&
        compressed[2] === 3 &&
        compressed[3] === 4
      ) {
        throw new ParserError('parser/version', 'this parser only support version@2 of SVGA.')
      }
      report(compressed.length, 'decode', compressed.length)
      const inflated = inflate(compressed)
      scanMovieWire(inflated)
      const decoded = (com as any).opensource.svga.MovieEntity.decode(inflated) as Movie
      const video = validateVideo(createVideo(decoded, imageMap(decoded)))
      response = { requestId: request.requestId, video }
      scope.postMessage(response, transferList(video))
      completed = true
      return
    } catch (error) {
      const source = error instanceof Error ? error : Error(String(error))
      const code = 'code' in source ? (source.code as ParserErrorCode) : undefined
      response = {
        requestId: request.requestId,
        error: { name: source.name, message: `[SVGA Parser Error] ${source.message}`, code },
      }
      scope.postMessage(response)
    } finally {
      if (!completed) controller.abort()
      controllers.delete(request.requestId)
    }
  }

  scope.postMessage({ ready: true })
}

installParserWorker(self as unknown as ParserWorkerScope)
