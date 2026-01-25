import {
  MockWebWorker,
  Movie,
  ParserPostMessageArgs,
  RawImages,
  Video,
  AUDIO_PREFIX
} from '../types'
// @ts-ignore - protobufjs types may not be available
import { Root } from 'protobufjs'
// @ts-ignore - zlibjs types may not be available
import Zlib from 'zlibjs/bin/inflate.min.js'
import SVGA_PROTO from './svga-proto'
import { VideoEntity } from './video-entity'
import { Utils } from '../utils'

const HTTP_STATUS_OK = 200
const HTTP_STATUS_NOT_MODIFIED = 304
const ERROR_NETWORK = 'XMLHttpRequest network error'
const ERROR_HTTP_FAILED = 'XMLHttpRequest failed with status'

export interface ParserWorkerHost {
  postMessage: (data: Video | Error) => void
}

function uint8ArrayToString (u8a: Uint8Array): string {
  return Array.from(u8a).map(byte => String.fromCharCode(byte)).join('')
}

const proto = Root.fromJSON(SVGA_PROTO)
const message = proto.lookupType('com.opensource.svga.MovieEntity')

function isHttpRequestSuccessful (status: number, response: any): boolean {
  return response !== undefined && (status === HTTP_STATUS_OK || status === HTTP_STATUS_NOT_MODIFIED)
}

async function download (url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('GET', url, true)
    request.responseType = 'arraybuffer'

    request.onloadend = () => {
      if (isHttpRequestSuccessful(request.status, request.response)) {
        resolve(request.response)
      } else {
        reject(new Error(`${ERROR_HTTP_FAILED}: ${request.status}`))
      }
    }

    request.onerror = () => reject(new Error(ERROR_NETWORK))

    request.send()
  })
}

function extractImageBytes (image: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = image
  if (buffer instanceof ArrayBuffer) {
    return buffer.slice(byteOffset, byteOffset + byteLength)
  }
  return new Uint8Array(image).buffer
}

export const createParserOnMessage = (host: ParserWorkerHost) => async (event: { data: ParserPostMessageArgs }): Promise<void> => {
  const { url, options } = event.data
  const buffer = await download(url)

  if (Utils.getVersion(buffer) !== 2) {
    throw new Error('This parser only supports version 2 of SVGA.')
  }

  const uint8ArrayBuffer = new Uint8Array(buffer)
  const inflateData = new Zlib.Inflate(uint8ArrayBuffer).decompress()
  const movie = message.decode(inflateData) as unknown as Movie
  const images = await processMovieImages(movie, options.isDisableImageBitmapShim)

  host.postMessage(new VideoEntity(movie, images))
}

async function processMovieImages (movie: Movie, isDisableImageBitmapShim: boolean): Promise<RawImages> {
  const images: RawImages = {}
  const shouldCreateBitmap = !isDisableImageBitmapShim && createImageBitmap !== undefined

  for (const key in movie.images) {
    if (key.startsWith(AUDIO_PREFIX)) continue

    const image = movie.images[key]

    try {
      images[key] = await createImageFromBytes(image, shouldCreateBitmap)
    } catch {
      // Skip corrupted or invalid image
    }
  }

  return images
}

async function createImageFromBytes (image: Uint8Array, useBitmap: boolean): Promise<string | ImageBitmap> {
  if (useBitmap) {
    return await createImageBitmap(new Blob([extractImageBytes(image)]))
  }
  return btoa(uint8ArrayToString(image))
}

export const createParserMockWorker = (): MockWebWorker => {
  const mockWorker: MockWebWorker = {
    onmessageCallback: () => {},
    postMessage (data) { this.onmessageCallback(data) },
    onmessage: () => {}
  }

  mockWorker.onmessage = createParserOnMessage(mockWorker)

  return mockWorker
}
