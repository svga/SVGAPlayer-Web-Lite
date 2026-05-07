## Context

`CompiledAnimation.requiredCapabilities` and backend `capabilities` currently use a flat `RenderCapabilities` interface with booleans such as `imageRendering`, `dynamicTextures`, `shapeFill`, `shapeFillHoles`, `shapeStroke`, `lineDash`, `masks`, `snapshot`, and `unsupportedPathCommands`. This representation cannot express the current backend reality precisely: Canvas supports the full immediate-mode drawing surface, while WebGL currently supports texture rendering, transforms, alpha, and blending, but not native shape, stroke, dash, mask, or snapshot behavior.

The capability documents under `doc/render-capability-feature-tree-plan.md` and `doc/render-capability-warning-and-skip-plan.md` define the intended direction: use a structured render capability tree, compare required capabilities against the selected backend, warn externally when unsupported capabilities exist, and skip unsupported WebGL rendering steps instead of aborting the frame. This proposal intentionally migrates only the capabilities represented by the current code. It does not add new WebGL shape or mask support.

## Goals / Non-Goals

**Goals:**

- Replace the flat `RenderCapabilities` interface with a structured capability tree.
- Use precise capability paths for required animation features and backend declarations.
- Keep Canvas declared as capable for existing Canvas-supported drawing behavior.
- Keep WebGL declared as capable only for its current texture, transform, alpha, and blending behavior.
- Emit an `unsupportedCapabilities` player event and `console.warn` before playback/rendering when the selected backend cannot satisfy required capabilities.
- Skip unsupported WebGL drawing steps while continuing to render supported texture work in the same frame.
- Preserve `renderMode: 'auto'` backend selection semantics: WebGL availability decides the backend, not animation content.

**Non-Goals:**

- Add WebGL support for shape fill, shape stroke, line dash, masks, snapshots, or path adapters.
- Use Canvas rasterization as a WebGL fallback for unsupported shapes, masks, or whole frames.
- Change Canvas rendering output.
- Change parser worker behavior.
- Change public package exports beyond any already-internal type adjustments needed by the compiler/backend layer.

## Decisions

### Decision: Replace coarse fields with a nested capability tree

`RenderCapabilities` will become a structured model:

```ts
interface RenderCapabilities {
  texture: {
    static: boolean
    dynamic: boolean
  }
  shape: {
    rect: ShapePaintCapabilities
    roundedRect: ShapePaintCapabilities
    ellipse: ShapePaintCapabilities
    path: ShapePaintCapabilities
    strokeStyle: {
      width: boolean
      lineCap: boolean
      lineJoin: boolean
      miterLimit: boolean
      lineDash: boolean
    }
  }
  masks: boolean
  snapshot: boolean
}
```

Rationale: backend support can then be expressed at the same granularity as the SVGA render semantics. WebGL can truthfully say it supports static and dynamic textures while not claiming shape support.

Alternative considered: keep coarse `shapeFill` and add ad hoc WebGL exceptions. This preserves less type churn but keeps the ambiguous "partial shape fill" problem and makes unsupported reporting less useful.

### Decision: Represent diffs as capability paths

Capability comparison will recurse through the tree and return paths such as `texture.static`, `shape.rect.fill`, `shape.strokeStyle.lineDash`, `masks`, and `snapshot`.

Rationale: event payloads, warnings, tests, and future WebGL/WebGPU work need stable, human-readable identifiers that map directly to the capability tree.

Alternative considered: return nested objects mirroring `RenderCapabilities`. That is harder to log, harder to assert in tests, and less convenient for users handling an event.

### Decision: Compile required capabilities from recognized render semantics only

The compiler will set required capability paths from recognized texture, shape, stroke style, mask, and snapshot needs. Unknown or unsupported path parser commands will move out of `RenderCapabilities` and into compile diagnostics so they do not imply that a backend could declare a stable capability for unknown syntax.

Rationale: capabilities describe whether a backend can render known SVGA semantics. Unknown path commands are data/parse diagnostics, not backend feature switches.

Alternative considered: keep `unsupportedPathCommands` inside `RenderCapabilities`. This mixes diagnostics with backend declarations and forces every backend to declare support for a non-rendering concept.

### Decision: Keep backend declarations aligned to current implementation

Canvas will declare support for static/dynamic textures, rect/roundedRect/ellipse/path fill and stroke, stroke style fields, masks, and snapshots. WebGL will declare support for static and dynamic textures only among the modeled capabilities, with shape, stroke style, masks, and snapshot paths set to `false`.

Rationale: this migration is a capability model change, not a WebGL feature expansion.

Alternative considered: opportunistically enable WebGL rect or ellipse fill flags. The current task explicitly excludes filling in WebGL capability gaps, so doing so would create an unverified contract.

### Decision: Warn and emit after compile with the selected backend

After compile has produced `requiredCapabilities` and the selected backend is known, the player will compute unsupported capability paths. If any exist, it will emit `unsupportedCapabilities` and call `console.warn(message, payload)`.

Rationale: consumers get deterministic diagnostics before render work starts, while the backend still has enough context to know what it can render.

Alternative considered: warn lazily from inside each backend draw branch. This would duplicate checks and make the external event timing harder to reason about.

### Decision: Skip unsupported WebGL drawing steps, not entire frames

WebGL rendering will continue drawing supported texture work for a command and skip only unsupported steps such as shape drawing or mask application. When a command contains only unsupported visible work, it will produce no draw call and the renderer will continue to the next command.

For masks, the first implementation will use the loose strategy: skip applying the unsupported mask and continue drawing supported texture content. This matches the "skip unsupported parts, render supported parts" behavior and avoids dropping otherwise renderable sprites.

Alternative considered: skip the whole masked command when masks are unsupported. That is visually more conservative for clipped images but removes supported texture rendering and is less aligned with partial rendering.

## Risks / Trade-offs

- [Risk] WebGL output may show more content when masks are skipped. -> Mitigation: emit explicit unsupported capability diagnostics so callers can choose Canvas if visual fidelity is required.
- [Risk] Event/warning payloads may fire more often for repeated compile/refresh flows. -> Mitigation: keep payload deterministic and tied to each compiled animation/backend pairing.
- [Risk] Migrating capability types can touch compiler, backend, facade, and tests at once. -> Mitigation: introduce helper constructors and path diff utilities before changing call sites.
- [Risk] Removing `unsupportedPathCommands` from capability matching can hide parse problems if diagnostics are not surfaced. -> Mitigation: preserve compile diagnostics and include them in tests separately from capability diffing.

## Migration Plan

1. Add the structured capability types, default constructors, capability path list, and diff helper.
2. Migrate compiler scans from coarse fields to precise nested required capability flags.
3. Move unknown path command state to compile diagnostics rather than backend capability flags.
4. Update Canvas and WebGL backend declarations to the new tree using current implemented behavior.
5. Add unsupported capability event and warning flow after compile/backend selection.
6. Update WebGL rendering to skip unsupported shape and mask operations instead of throwing.
7. Update tests for capability scanning, backend declarations, diff results, event/warning payloads, and partial WebGL rendering.

Rollback is straightforward because the change is internal to the compiler/backend contract: restore the flat `RenderCapabilities` type and previous WebGL unsupported throw behavior if the migration fails before release.

## Open Questions

- None for this change. The mask strategy is intentionally the loose partial-rendering strategy for the first migration pass.
