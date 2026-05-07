## Why

WebGL rendering currently reports and skips all shape work, so a shape-only SVGA with a plain rectangle cannot be used to validate the next incremental geometry capability. A real local `.svga` fixture and a selectable manual demo page will make WebGL rect fill work visible and reproducible instead of relying only on in-memory unit fixtures.

## What Changes

- Add a generated local `rect-fill.svga` fixture encoded with the project's SVGA protobuf schema and zlib compression.
- Update the remote SVGA demo page so testers can choose render mode, choose bundled/local demo SVGA files, and enter an arbitrary URL.
- Implement WebGL fill rendering for non-rounded `RECT` shapes with fill styles.
- Declare `shape.rect.fill` as supported by WebGL only after the backend actually renders it.
- Keep rect stroke, rounded rects, ellipses, generic paths, masks, and line dash unsupported.

## Capabilities

### New Capabilities
- `webgl-rect-fill`: WebGL can render filled non-rounded SVGA rect shapes and report `shape.rect.fill` accurately.
- `svga-demo-fixtures`: The repository provides a real rect-fill `.svga` fixture and a manual demo page that can select render mode and SVGA source.

### Modified Capabilities
- None.

## Impact

- Affects WebGL backend shape rendering and capability declarations under `src/player/backend` and `src/player/compiler`.
- Adds or updates tests proving rect-fill capability detection, WebGL rendering behavior, and unsupported capability reporting.
- Adds a local demo SVGA fixture and updates `__test__/remote-svga-player.html` for manual visual verification.
- Uses existing dependencies already present in the project; no new runtime or development dependency is required.
