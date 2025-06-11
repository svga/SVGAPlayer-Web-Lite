import {
  MockWebWorker,
  Movie,
  ParserPostMessageArgs,
  RawImages
} from '../types'
// Removed protobufjs and SVGA_PROTO
import * as pako from 'pako'
import { init as initWasm, parse_svga } from './wasm/svga_wasm_parser.js' // Assuming placement and named export for init
import { VideoEntity } from './video-entity'
import { Utils } from '../utils'

function uint8ArrayToString (u8a: Uint8Array): string {
  let dataString = ''
  for (let i = 0; i < u8a.length; i++) {
    dataString += String.fromCharCode(u8a[i])
  }
  return dataString
}

// Initialize WASM module when worker loads.
// The `initWasm` function is the default export from the wasm-bindgen JS glue.
const wasmInitialized = initWasm().catch(error => {
  console.error("Failed to initialize WASM module:", error);
  // Post an error back to the main thread or handle appropriately
  // This is crucial, otherwise the worker might silently fail to init.
  if (worker && worker.postMessage) {
    worker.postMessage(new Error(`[SVGA Parser Error] WASM module initialization failed: ${error.message}`));
  }
  return null; // Ensure wasmInitialized promise resolves to null on failure after logging
});


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

    if (Utils.getVersion(dataHeader) !== 2) { // This checks if first 4 bytes are "SVGA"
      throw new Error('this parser only support version@2 of SVGA (magic word "SVGA" not found or mismatch).')
    }

    // Ensure WASM is initialized before proceeding
    const wasmInstance = await wasmInitialized;
    if (!wasmInstance) {
      // WASM failed to initialize, error already posted by the init catch block.
      // Or, throw a new error to be caught by the try...catch below.
      throw new Error("WASM module not initialized.");
    }

    // For SVGA v2, the data after the 4-byte "SVGA" magic word is the zlib-compressed MovieEntity.
    const inflateData: Uint8Array = pako.inflate(new Uint8Array(buffer.slice(4)))

    // Use WASM's parse_svga function
    // The returned object structure should match `ParsedSvgaOutput` from Rust,
    // which was designed to be compatible with the existing `Movie` type.
    const movie = parse_svga(inflateData) as unknown as Movie;
    // Note: parse_svga from wasm-bindgen will throw an exception if the Rust function returns Err.
    // So, no need to check for Result<Ok,Err> explicitly here.

    const images: RawImages = {}
    // The `movie.images` from WASM (originally HashMap<String, Vec<u8>>)
    // should be a JS object like { [key: string]: Uint8Array }
    for (const key in movie.images) {
      if (key.startsWith('audio')) continue
      const image = movie.images[key] as unknown as Uint8Array // Explicit cast if necessary for type safety
      if (!options.isDisableImageBitmapShim && self.createImageBitmap !== undefined) {
        // Assuming `image` is Uint8Array, Blob constructor is fine.
        images[key] = await self.createImageBitmap(new Blob([image]))
      } else {
        // uint8ArrayToString expects Uint8Array, so this should work.
        const value = uint8ArrayToString(image)
        images[key] = btoa(value)
      }
    }
    worker.postMessage(new VideoEntity(movie, images))
  } catch (error) {
    let errorMessage: string = (error as any).toString()
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
