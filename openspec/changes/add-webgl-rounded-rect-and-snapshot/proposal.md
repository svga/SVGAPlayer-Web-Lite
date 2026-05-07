## Why

WebGL now handles texture rendering plus non-rounded rectangle fill and stroke, but rounded `RECT` shapes are still reported as unsupported and skipped even though Canvas renders them. WebGL also lacks the backend snapshot capability that Canvas already exposes, leaving callers without a consistent way to capture the current rendered frame.

## What Changes

- Add WebGL rendering support for filled rounded SVGA `RECT` shapes with `cornerRadius > 0`.
- Add WebGL rendering support for solid stroked rounded SVGA `RECT` shapes with positive stroke width.
- Generate real local SVGA version 2 fixtures for rounded-rect fill and rounded-rect stroke through the project's protobuf/zlib path.
- Expose the new rounded-rect fixtures in the manual player source presets for canvas, auto, and webgl visual comparison.
- Declare WebGL support for `shape.roundedRect.fill`, `shape.roundedRect.stroke`, and `snapshot` only after the implementation exists.
- Add WebGL backend snapshot support and a public player snapshot path when the selected backend supports snapshots.
- Keep unsupported diagnostics accurate for dashed strokes, line cap/join/miter style details, ellipse/path rendering, and masks.

## Capabilities

### New Capabilities
- `webgl-rounded-rect`: WebGL can render filled and solid stroked rounded SVGA rectangle shapes and report the corresponding capabilities accurately.
- `svga-rounded-rect-fixtures`: The repository provides real rounded-rect `.svga` fixtures usable by tests and the manual demo page.
- `player-snapshot`: The player exposes current-frame snapshot behavior consistently for backends that support it, including WebGL.

### Modified Capabilities

## Impact

- Affects WebGL rendering internals in `src/player/backend/webgl.ts`.
- Affects render capability declarations in `src/player/compiler/types.ts`.
- Affects the player facade if a public `snapshot()` API is added in `src/svga-player.ts`.
- Adds or extends fixture generation scripts and local assets under `__test__/svga/`.
- Updates unit tests in `__test__/unit/run.ts` and manual source presets in `__test__/remote-svga-player.html`.
- No new runtime dependency is planned; rounded-rect meshes will use local geometry generation rather than PixiJS or earcut.
