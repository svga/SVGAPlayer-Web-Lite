import {
  MockWebWorker,
  Movie,
  ParserPostMessageArgs,
  RawImages
} from '../types'
import { Root } from 'protobufjs'
import Zlib from 'zlibjs/bin/inflate.min.js'
import SVGA_PROTO from './svga-proto'
import { VideoEntity } from './video-entity'
import { Utils } from '../utils'

function uint8ArrayToString (u8a: Uint8Array): string {
  let dataString = ''
  for (let i = 0; i < u8a.length; i++) {
    dataString += String.fromCharCode(u8a[i])
  }
  return dataString
}

const proto = Root.fromJSON(SVGA_PROTO)
const message = proto.lookupType('com.opensource.svga.MovieEntity')

let worker: MockWebWorker | Worker

async function download (url: string): Promise<ArrayBuffer> {
  return await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('GET', url, true)
    request.responseType = 'arraybuffer'
    request.onloadend = () => {
      if (request.response !== undefined && (request.status === 200 || request.status === 304)) {
        resolve(request.response)
      } else {
        reject(new Error(`XMLHttpRequest, ${request.statusText}`))
      }
    }
    request.send()
  })
}

async function onmessage (event: { data: ParserPostMessageArgs }): Promise<void> {
  try {
    const { url, options } = event.data
    const buffer = await download(url)
    const dataHeader = new Uint8Array(buffer, 0, 4)
    if (Utils.getVersion(dataHeader) !== 2) throw new Error('this parser only support version@2 of SVGA.')
    const inflateData: Uint8Array = new Zlib.Inflate(new Uint8Array(buffer)).decompress()
    const movie = message.decode(inflateData) as unknown as Movie
    const images: RawImages = {}
    for (const key in movie.images) {
      const image = movie.images[key]
      if (!options.isDisableImageBitmapShim && self.createImageBitmap !== undefined) {
        images[key] = await self.createImageBitmap(new Blob([image]))
      } else {
        const value = uint8ArrayToString(image)
        images[key] = btoa(value)
      }
    }
    worker.postMessage(new VideoEntity(movie, images))
  } catch (error) {
    let errorMessage: string = (error as unknown as any).toString()
    if (error instanceof Error) errorMessage = error.message
    worker.postMessage(
      new Error(`[SVGA Parser Error] ${errorMessage}`)
    )
  }
}

if (self.document !== undefined) {
  worker = window.SVGAParserMockWorker = {
    onmessageCallback: () => {},
    postMessage (data) { this.onmessageCallback(data) },
    onmessage
  }
} else {
  worker = self as unknown as Worker
  worker.onmessage = onmessage
}
