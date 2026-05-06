## Why

The current player couples playback control, Canvas 2D resource preparation, frame clearing, frame caching, and immediate-mode rendering in `Player` and `render.ts`. This makes WebGL support hard to add without either copying Canvas semantics into WebGL or hiding Canvas rasterization inside the WebGL backend.

This change introduces a cleaner parse -> compile -> play architecture so SVGA rendering can support Canvas now, WebGL next, and WebGPU later through explicit render plans and backend capabilities.

## What Changes

- **BREAKING**: Replace the public multi-class API with a single exported `SVGAPlayer` facade class instantiated by consumers.
- Add `SVGAPlayer.parse()`, `SVGAPlayer.compile()`, playback methods, and `SVGAPlayer.on()` event subscription.
- Preserve the existing parser worker boundary for download, inflate, protobuf decode, and image extraction.
- Introduce a `RenderCompiler` stage after parsing that normalizes resources, scans animation features, compiles per-frame render commands, evaluates backend capabilities, and prepares the selected backend.
- Move the old `Player.mount()` initialization responsibilities into compile-time preparation.
- Introduce backend selection for `canvas`, `webgl`, and `auto` render modes.
- Enforce that WebGL falls back to Canvas only at backend selection time; WebGL must not use Canvas rasterization as an internal feature fallback.
- Add a compiled animation contract so playback consumes prepared frame commands instead of parsing SVGA/path data during frame rendering.
- Preserve future room for optional CPU compile work in a worker without replacing the parser worker.

## Capabilities

### New Capabilities

- `svga-player-facade`: Public single-class player API with parse, compile, playback, lifecycle events, and cleanup behavior.
- `render-compiler`: Compilation stage that converts parsed `VideoEntity` data into render commands, resource metadata, capability requirements, and a compiled animation plan.
- `render-backends`: Canvas/WebGL/backend-selection behavior, capability matching, fallback semantics, and GPU-native rendering constraints.

### Modified Capabilities

- None.

## Impact

- Public API exported from `src/index.ts`.
- Current `Parser` usage becomes internal to `SVGAPlayer.parse()` while retaining the parser worker implementation.
- Current `Player.mount()` responsibilities move into `RenderCompiler.compile()` and backend preparation.
- Current Canvas renderer becomes a `CanvasBackend` implementation rather than the only render path.
- WebGL support requires new backend, resource, shader, geometry, capability, and context-lost handling surfaces.
- Tests and README examples must be updated for `SVGAPlayer` and the explicit parse -> compile -> play flow.
