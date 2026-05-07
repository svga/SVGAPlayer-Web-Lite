## Why

WebGL now renders filled non-rounded SVGA rectangles, but stroked rectangles still report as unsupported and render differently from Canvas in WebGL mode. Adding a focused rect-stroke path is the next small step toward shape parity while keeping the WebGL capability contract honest.

## What Changes

- Add a local real `.svga` fixture containing a non-rounded stroked rectangle encoded with the project's SVGA protobuf schema and zlib compression.
- Extend the manual remote SVGA player page so the rect-stroke fixture can be selected alongside the existing rect-fill fixture and remote demo URL.
- Add WebGL rendering support for non-rounded rectangle strokes with solid stroke color and positive stroke width.
- Declare WebGL support for `shape.rect.stroke` and the minimal stroke style capability needed for this feature.
- Keep rounded rectangles, ellipses, generic paths, dashed strokes, masks, snapshots, and unsupported stroke styling outside the implemented WebGL surface.
- Add tests proving fixture decoding, capability reporting, unsupported diagnostics, and WebGL draw behavior for rect-stroke.

## Capabilities

### New Capabilities

- `webgl-rect-stroke`: WebGL can render solid strokes for non-rounded SVGA rectangle shapes and report the corresponding capabilities accurately.
- `svga-rect-stroke-fixtures`: The repository provides a real rect-stroke `.svga` fixture usable by tests and the manual demo page.

### Modified Capabilities

- None.

## Impact

- Affects the fixture generator under `scripts/`, local `.svga` assets under `__test__/svga/`, and the manual page at `__test__/remote-svga-player.html`.
- Affects WebGL rendering internals in `src/player/backend/webgl.ts` and WebGL capability reporting in `src/player/compiler/types.ts`.
- Affects unit coverage in `__test__/unit/run.ts`.
- No public API or dependency changes are expected.
