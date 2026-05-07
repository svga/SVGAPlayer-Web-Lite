## Why

The current `RenderCapabilities` model uses coarse booleans such as `shapeFill`, `shapeStroke`, and `lineDash`, which cannot describe partial backend support like WebGL texture rendering with unsupported shape semantics. This change replaces those coarse fields with a structured capability configuration and makes unsupported capability handling visible and non-fatal during rendering.

## What Changes

- Replace the flat `RenderCapabilities` shape with a nested capability configuration for texture, shape paint, stroke style, masks, and snapshots.
- Derive `CompiledAnimation.requiredCapabilities` from the new capability paths instead of the old coarse fields.
- Update Canvas and WebGL backend capability declarations to match their current implemented behavior.
- Add a reusable capability diff helper that reports unsupported capability paths.
- Emit an `unsupportedCapabilities` player event and `console.warn` when the selected backend lacks required capabilities.
- Change WebGL rendering so unsupported capability-specific work is skipped instead of throwing and aborting the frame.
- Preserve existing backend selection semantics: `auto` continues to choose WebGL based on context availability rather than falling back based on animation content.
- Do not add new WebGL rendering capabilities in this change; migrate only the capabilities supported by the current implementation.

## Capabilities

### New Capabilities

- `render-capability-config`: Structured render capability configuration, required capability scanning, unsupported capability reporting, and partial rendering skip behavior.

### Modified Capabilities

- None.

## Impact

- Internal compiler and backend types in `src/player/compiler` and `src/player/backend`.
- Canvas and WebGL backend capability declarations.
- `SVGAPlayer` event typing and compile/prepare flow for unsupported capability reporting.
- WebGL frame rendering behavior for commands containing shapes or masks.
- Tests covering capability scanning, capability diffing, unsupported event/warning behavior, and WebGL partial rendering.
