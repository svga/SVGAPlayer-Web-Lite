import {
  MockWebWorker,
  Movie,
  RawImages
} from '../types'
import { unzlibSync } from 'fflate'
import { Root } from 'protobufjs'
import SVGA_PROTO from './svga-proto'
import { VideoEntity } from './video-entity'
import { Utils } from '../utils'

function uint8ArrayToString (u8a: Uint8Array): string {
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let offset = 0; offset < u8a.length; offset += chunkSize) {
    const chunk = u8a.subarray(offset, Math.min(offset + chunkSize, u8a.length))
    chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]))
  }
  return chunks.join('')
}

const proto = Root.fromJSON(SVGA_PROTO)
const message = proto.lookupType('com.opensource.svga.MovieEntity')

interface DirectWorker extends MockWebWorker {
  onresponse: (data: ParserWorkerResponse) => void
}

let worker: DirectWorker | Worker

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
  video?: VideoEntity
  error?: {
    name: string
    message: string
  }
}

const controllers = new Map<number, AbortController>()
const activeControllers = new Set<AbortController>()

async function download (url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal })
  if (!response.ok && response.status !== 304) {
    throw Error('Fetch, ' + (response.statusText || response.status))
  }
  return await response.arrayBuffer()
}

const isFinitePositive = (value: number): boolean => Number.isFinite(value) && value > 0

const validateMovie = (movie: Movie): void => {
  const params = movie.params
  if (
    params === undefined ||
    !isFinitePositive(params.viewBoxWidth) ||
    !isFinitePositive(params.viewBoxHeight) ||
    !isFinitePositive(params.fps) ||
    !isFinitePositive(params.frames) ||
    !Number.isInteger(params.frames) ||
    !Array.isArray(movie.sprites) ||
    movie.sprites.some(sprite => !Array.isArray(sprite.frames) || sprite.frames.length < params.frames)
  ) {
    throw Error('Invalid SVGA movie')
  }
}

const ownImageEntries = (images: Movie['images']): Array<[string, Uint8Array]> => {
  const entries = Object.keys(images).map<[string, Uint8Array]>(key => [key, images[key]])
  const prototype = Object.getPrototypeOf(images)
  if (prototype instanceof Uint8Array) entries.unshift(['__proto__', prototype])
  return entries
}

const decodeImages = async (
  entries: Array<[string, Uint8Array]>,
  isDisableImageBitmapShim: boolean,
  images: RawImages,
  createdBitmaps: ImageBitmap[],
  signal: AbortSignal
): Promise<RawImages> => {
  for (const [key, image] of entries) {
    if (key.indexOf('audio') === 0) continue
    if (!isDisableImageBitmapShim && self.createImageBitmap !== undefined) {
      const bitmap = await self.createImageBitmap(new Blob([new Uint8Array(image)]))
      createdBitmaps.push(bitmap)
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      images[key] = bitmap
    } else {
      images[key] = btoa(uint8ArrayToString(image))
    }
  }
  return images
}

async function onmessage (event: { data: ParserWorkerRequest }): Promise<void> {
  const { requestId } = event.data
  if (event.data.cancel) {
    if (requestId === undefined) {
      for (const controller of activeControllers) controller.abort()
    } else {
      controllers.get(requestId)?.abort()
    }
    return
  }
  const createdBitmaps: ImageBitmap[] = []
  const { url, options } = event.data
  const controller = new AbortController()
  activeControllers.add(controller)
  if (requestId !== undefined) controllers.set(requestId, controller)
  try {
    if (url === undefined || options === undefined) throw Error('Invalid parser request')
    const buffer = await download(url, controller.signal)
    if (Utils.getVersion(buffer) !== 2) throw Error('this parser only support version@2 of SVGA.')
    const inflateData = unzlibSync(new Uint8Array(buffer))
    const movie = message.decode(inflateData) as unknown as Movie
    validateMovie(movie)
    const images: RawImages = Object.create(null)
    await decodeImages(
      ownImageEntries(movie.images),
      options.isDisableImageBitmapShim,
      images,
      createdBitmaps,
      controller.signal
    )
    const video = new VideoEntity(movie, images)
    if (self.document && requestId === undefined) {
      worker.postMessage(video)
    } else {
      const response: ParserWorkerResponse = { requestId: requestId as number, video }
      ;(worker.postMessage as (data: VideoEntity, transfer?: ImageBitmap[]) => void)(
        response as unknown as VideoEntity,
        self.document ? undefined : createdBitmaps
      )
    }
  } catch (error) {
    for (const bitmap of createdBitmaps) bitmap.close()
    const source = error instanceof Error ? error : Error(String(error))
    const message = '[SVGA Parser Error] ' + source.message
    if (self.document && requestId === undefined) {
      const legacyError = Error(message)
      legacyError.name = source.name
      worker.postMessage(legacyError)
    } else {
      const response: ParserWorkerResponse = {
        requestId: requestId as number,
        error: { name: source.name, message }
      }
      worker.postMessage(response as unknown as VideoEntity)
    }
  } finally {
    activeControllers.delete(controller)
    if (requestId !== undefined) controllers.delete(requestId)
  }
}

if (self.document) {
  const mockWorker: DirectWorker = {
    onmessageCallback: () => {},
    onresponse: () => {},
    postMessage (data) {
      if (data && typeof data === 'object' && 'requestId' in data) {
        this.onresponse(data as unknown as ParserWorkerResponse)
      } else {
        this.onmessageCallback(data)
      }
    },
    onmessage: onmessage as unknown as MockWebWorker['onmessage']
  }
  worker = window.SVGAParserMockWorker = mockWorker
} else {
  worker = self as unknown as Worker
  worker.onmessage = onmessage as unknown as Worker['onmessage']
}
