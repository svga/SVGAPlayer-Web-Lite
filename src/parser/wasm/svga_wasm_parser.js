// src/parser/wasm/svga_wasm_parser.js
export async function init() {
  console.log('Mock WASM init called');
  return Promise.resolve();
}

export function parse_svga(binary_data) {
  // console.log('Mock parse_svga called with data of length:', binary_data.length);
  // This structure should be compatible with what `VideoEntity` constructor expects
  // after the `movie.images` part is processed by `src/parser/index.ts` into `RawImages`.
  // The `images` field here represents the direct output from the parser,
  // which would be `map<string, bytes>` in the proto, translating to `{[key: string]: Uint8Array}`.
  return {
    version: "2.0",
    params: {
      viewBoxWidth: 300,
      viewBoxHeight: 200,
      fps: 20,
      frames: 100
    },
    images: {
      // Example: "img_1": new Uint8Array([1,2,3,4])
      // For most tests, an empty images object is fine, as the parser worker
      // handles turning these into ImageBitmaps or base64 strings.
    },
    sprites: [
      {
        imageKey: "spriteKey1", // Corresponds to SpriteEntity.imageKey
        frames: [               // Corresponds to SpriteEntity.frames (repeated FrameEntity)
          {
            alpha: 1.0,
            layout: { x: 0, y: 0, width: 100, height: 100 },
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
            clipPath: null, // clipPath is a string in .proto, can be null if not present
            shapes: []      // shapes is a repeated ShapeEntity
          }
        ],
        // matteKey: null,    // Optional: Corresponds to SpriteEntity.matteKey
      }
    ],
    audios: [] // Corresponds to MovieEntity.audios (repeated AudioEntity)
  };
}
