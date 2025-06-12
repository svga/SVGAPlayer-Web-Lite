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

let worker: MockWebWorker | Worker; // Ensure worker is declared to be accessible in initializeWasm's catch
let wasmInitializationPromise: Promise<void> | null = null;
let wasmInitializationError: Error | null = null;

function initializeWasm(): void {
  if (wasmInitializationPromise) {
    return; // Already initializing or initialized
  }
  wasmInitializationPromise = initWasm()
    .then(() => {
      console.log("WASM module initialized successfully.");
      wasmInitializationError = null; // Explicitly set to null on success
    })
    .catch(error => {
      console.error("Failed to initialize WASM module:", error);
      const initError = new Error(`[SVGA Parser Error] WASM module initialization failed: ${error.message}`);
      wasmInitializationError = initError;
      // If worker is already set up, post error back. Otherwise, onmessage will throw this error.
      if (worker && worker.postMessage && typeof worker.postMessage === 'function') {
         // Check if it's the mock worker or a real worker
        if ('onmessageCallback' in worker) { // Likely MockWebWorker
          // Mock worker might not handle direct error objects well unless designed for it.
          // For now, we rely on onmessage throwing the error.
        } else { // Real Worker
          worker.postMessage(initError);
        }
      }
      // Ensure the promise chain still rejects so awaiters can catch it
      throw initError;
    });
}

// Start WASM initialization when the worker script loads.
initializeWasm();

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

    // Check for WASM initialization status at the beginning of message processing
    if (wasmInitializationError) {
      throw wasmInitializationError; // Throw the stored initialization error
    }
    if (!wasmInitializationPromise) {
      // This case should ideally not be hit if initializeWasm() is called at script load.
      throw new Error("[SVGA Parser Error] WASM initialization not started.");
    }
    await wasmInitializationPromise; // Wait for initialization to complete (or throw if it failed)

    // If we reach here, WASM is initialized successfully.
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
    let errorMessage: string = (error as any).toString();
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    // Ensure worker and postMessage are available before trying to use them
    if (worker && worker.postMessage && typeof worker.postMessage === 'function') {
      worker.postMessage(
        new Error(`[SVGA Parser Error] ${errorMessage}`)
      );
    } else {
      // Fallback if worker is not set up when an error occurs (e.g., early WASM init error)
      console.error(`[SVGA Parser Error] Worker not available to post message: ${errorMessage}`);
    }
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
