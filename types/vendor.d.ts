declare interface Window {
  OffscreenCanvas: null | OffscreenCanvas
}

declare module 'pako/lib/inflate' {
  export function inflate (data: Uint8Array): Uint8Array
}

declare module 'zlibjs/bin/inflate.min.js' {
  export const Zlib: any
}
