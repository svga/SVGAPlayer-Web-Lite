## 1. Capability Types and Helpers

- [x] 1.1 Replace the flat `RenderCapabilities` interface with the structured texture, shape paint, stroke style, mask, and snapshot capability tree
- [x] 1.2 Add typed capability paths for every leaf capability used by diffing, events, warnings, and tests
- [x] 1.3 Add helper constructors for empty required capabilities, Canvas capabilities, and WebGL capabilities
- [x] 1.4 Add a recursive capability diff helper that returns unsupported capability paths

## 2. Compiler Migration

- [x] 2.1 Migrate texture scanning from `imageRendering` and `dynamicTextures` to `texture.static` and `texture.dynamic`
- [x] 2.2 Migrate shape fill/stroke scanning to `shape.rect`, `shape.roundedRect`, `shape.ellipse`, and `shape.path` capability paths
- [x] 2.3 Migrate stroke style scanning to `shape.strokeStyle.width`, `lineCap`, `lineJoin`, `miterLimit`, and `lineDash`
- [x] 2.4 Migrate mask scanning to the structured `masks` capability path
- [x] 2.5 Move unsupported path command state out of `RenderCapabilities` and preserve it through compile diagnostics

## 3. Backend Capability Declarations

- [x] 3.1 Update CanvasBackend capabilities to declare current Canvas support in the structured capability tree
- [x] 3.2 Update WebGLBackend capabilities to declare current texture support and unsupported shape, stroke style, mask, and snapshot capabilities
- [x] 3.3 Update backend type imports and call sites to use the structured capability helpers

## 4. Unsupported Capability Reporting

- [x] 4.1 Add typed `unsupportedCapabilities` event payload with backend type, unsupported paths, required capabilities, and backend capabilities
- [x] 4.2 Compare compiled required capabilities with the selected backend capabilities after compile or prepare
- [x] 4.3 Emit `unsupportedCapabilities` only when unsupported paths exist
- [x] 4.4 Add `console.warn(message, payload)` for unsupported paths with a message explaining that unsupported parts will be skipped
- [x] 4.5 Preserve `renderMode: 'auto'` backend selection behavior so unsupported animation capabilities do not trigger Canvas fallback

## 5. WebGL Partial Rendering

- [x] 5.1 Remove the WebGLBackend throw that aborts rendering when commands contain unsupported shapes or masks
- [x] 5.2 Render supported texture work when a command also contains unsupported shape work
- [x] 5.3 Skip shape-only commands that require unsupported WebGL shape capabilities without throwing
- [x] 5.4 Skip unsupported mask application while still rendering supported non-mask command work
- [x] 5.5 Ensure WebGLBackend does not use Canvas rasterization fallback for unsupported capability work

## 6. Verification

- [x] 6.1 Add or update compiler tests for structured texture, shape, stroke style, mask, and unsupported path diagnostic scanning
- [x] 6.2 Add tests for Canvas and WebGL structured backend capability declarations
- [x] 6.3 Add tests for capability diff path output
- [x] 6.4 Add tests for `unsupportedCapabilities` event and `console.warn` behavior
- [x] 6.5 Add WebGLBackend tests proving unsupported shape and mask work is skipped without aborting supported texture rendering
- [x] 6.6 Run `npm run type:check`
- [x] 6.7 Run `npm run format:check`
- [x] 6.8 Run `npm run test:unit`
