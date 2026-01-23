import {
  MockWebWorker,
  Movie,
  ParserPostMessageArgs,
  RawImages,
  Video
} from '../types'
// @ts-ignore - protobufjs types may not be available
import { Root } from 'protobufjs'
// @ts-ignore - zlibjs types may not be available
import Zlib from 'zlibjs/bin/inflate.min.js'
import SVGA_PROTO from './svga-proto'
import { VideoEntity } from './video-entity'
import { Utils } from '../utils'

export interface ParserWorkerHost {
  postMessage: (data: Video | Error) => void
}

function uint8ArrayToString (u8a: Uint8Array): string {
  return Array.from(u8a).map(byte => String.fromCharCode(byte)).join('')
}

const proto = Root.fromJSON(SVGA_PROTO)
const message = proto.lookupType('com.opensource.svga.MovieEntity')

async function download (url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('GET', url, true)
    request.responseType = 'arraybuffer'

    request.onloadend = () => {
      const isSuccess = request.response !== undefined && (request.status === 200 || request.status === 304)

      if (isSuccess) {
        resolve(request.response)
      } else {
        reject(new Error(`XMLHttpRequest failed with status: ${request.status}`))
      }
    }

    request.onerror = () => reject(new Error('XMLHttpRequest network error'))

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
  const images: RawImages = {}
  const shouldCreateBitmap = !options.isDisableImageBitmapShim && createImageBitmap !== undefined

  for (const key in movie.images) {
    if (key.startsWith('audio')) continue

    const image = movie.images[key]

    try {
      images[key] = shouldCreateBitmap
        ? await createImageBitmap(new Blob([extractImageBytes(image)]))
        : btoa(uint8ArrayToString(image))
    } catch {
      // Skip corrupted or invalid image
    }
  }

  host.postMessage(new VideoEntity(movie, images))
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
