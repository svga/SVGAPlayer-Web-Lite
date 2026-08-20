import { Unzlib } from 'fflate'

import type { Movie, RawImages, Video } from '../types'
import { validateVideo } from '../validate-video'
import { com } from './svga.generated'
import type { ParserWorkerRequest, ParserWorkerResult, ParserWorkerScope } from './protocol'
import { createVideo } from './video-entity'
import { scanMovieWire } from './wire-scan'

const maxCompressedBytes = 8 * 1024 * 1024
const maxDecompressedBytes = 16 * 1024 * 1024

async function download (url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal })
  if (response.status < 200 || response.status >= 300) throw Error(`Fetch, ${response.statusText || response.status}`)

  const chunks: Uint8Array[] = []
  let length = 0
  const reader = response.body?.getReader()
  if (reader !== undefined) {
    try {
      for (;;) {
        const result = await reader.read()
        if (result.done) break
        const chunk = result.value
        length += chunk.byteLength
        if (length > maxCompressedBytes) throw Error('Compressed SVGA exceeds 8 MiB')
        chunks.push(chunk)
      }
    } catch (error) {
      try { await reader.cancel(error) } catch {}
      throw error
    } finally {
      reader.releaseLock()
    }
  } else {
    const chunk = new Uint8Array(await response.arrayBuffer())
    length = chunk.byteLength
    if (length > maxCompressedBytes) throw Error('Compressed SVGA exceeds 8 MiB')
    chunks.push(chunk)
  }

  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

function inflate (source: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  let length = 0
  const stream = new Unzlib((chunk) => {
    length += chunk.byteLength
    if (length > maxDecompressedBytes) throw Error('Decompressed SVGA exceeds 16 MiB')
    chunks.push(chunk.slice())
  })
  const chunkSize = 64 * 1024
  if (source.length === 0) stream.push(source, true)
  for (let offset = 0; offset < source.length; offset += chunkSize) {
    const end = Math.min(source.length, offset + chunkSize)
    stream.push(source.subarray(offset, end), end === source.length)
  }
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output
}

function imageEntries (images: Movie['images']): Array<[string, Uint8Array]> {
  return Object.keys(images).map(key => [key, images[key]])
}

function imageMap (movie: Movie): RawImages {
  const images = Object.create(null) as RawImages
  for (const [key, value] of imageEntries(movie.images)) {
    if (!key.startsWith('audio')) images[key] = value
  }
  return images
}

function transferList (video: Video): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>()
  for (const image of Object.values(video.images)) {
    if (image.buffer instanceof ArrayBuffer) buffers.add(image.buffer)
  }
  return [...buffers]
}

function installParserWorker (scope: ParserWorkerScope): void {
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
    let response: ParserWorkerResult
    try {
      const compressed = await download(request.url, controller.signal)
      if (compressed[0] === 80 && compressed[1] === 75 && compressed[2] === 3 && compressed[3] === 4) {
        throw Error('this parser only support version@2 of SVGA.')
      }
      const inflated = inflate(compressed)
      scanMovieWire(inflated)
      const decoded = (com as any).opensource.svga.MovieEntity.decode(inflated) as Movie
      const video = validateVideo(createVideo(decoded, imageMap(decoded)))
      response = { requestId: request.requestId, video }
      scope.postMessage(response, transferList(video))
      return
    } catch (error) {
      const source = error instanceof Error ? error : Error(String(error))
      response = {
        requestId: request.requestId,
        error: { name: source.name, message: `[SVGA Parser Error] ${source.message}` }
      }
      scope.postMessage(response)
    } finally {
      controller.abort()
      controllers.delete(request.requestId)
    }
  }

  scope.postMessage({ ready: true })
}

installParserWorker(self as unknown as ParserWorkerScope)
