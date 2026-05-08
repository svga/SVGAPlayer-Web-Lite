## Why

WebGL now renders textures plus rectangle and rounded-rectangle shape fill/stroke, but SVGA `ELLIPSE` shapes still report as unsupported and are skipped even though the compiler and Canvas backend already understand them. Adding ellipse support is the next small shape-parity step and can reuse the same solid WebGL mesh approach established by rect and rounded-rect rendering.

## What Changes

- Add WebGL rendering support for filled SVGA `ELLIPSE` shapes with positive radii.
- Add WebGL rendering support for solid stroked SVGA `ELLIPSE` shapes with positive stroke width.
- Generate real local SVGA version 2 fixtures for ellipse fill and ellipse stroke through the project's protobuf/zlib path.
- Expose the new ellipse fixtures in the manual player source presets for canvas, auto, and webgl visual comparison.
- Declare WebGL support for `shape.ellipse.fill` and `shape.ellipse.stroke` only after the implementation exists.
- Keep unsupported diagnostics accurate for dashed strokes, explicit line cap/join/miter style details, generic paths, and masks.

## Capabilities

### New Capabilities
- `webgl-ellipse`: WebGL can render filled and solid stroked SVGA ellipse shapes and report the corresponding capabilities accurately.
- `svga-ellipse-fixtures`: The repository provides real ellipse `.svga` fixtures usable by tests and the manual demo page.

### Modified Capabilities

## Impact

- Affects WebGL rendering internals in `src/player/backend/webgl.ts`.
- Affects render capability declarations in `src/player/compiler/types.ts`.
- Adds or extends fixture generation scripts and local assets under `__test__/svga/`.
- Updates unit tests in `__test__/unit/run.ts` and manual source presets in `__test__/remote-svga-player.html`.
- No new runtime dependency is planned; ellipse meshes will use local geometry generation inspired by PixiJS' shape builders rather than importing PixiJS or earcut.
