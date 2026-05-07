## Context

The WebGL backend already has the first native shape path: non-rounded rectangle fill and stroke render through a solid-color shader and hand-built triangle meshes. The compiler distinguishes non-rounded rectangles from rounded rectangles by `cornerRadius`: plain rects require `shape.rect.*`, while rounded rects require `shape.roundedRect.*`.

Canvas renders rounded rectangles by clamping the radius to half the width/height and building an immediate-mode path with `arcTo()`. WebGL currently skips `RECT` geometries with `cornerRadius > 0`, and WebGL capability reporting leaves `shape.roundedRect.fill`, `shape.roundedRect.stroke`, and `snapshot` false.

PixiJS is the useful reference for the geometry shape, not a dependency target. Its rounded rectangle path builds a perimeter point list first. Older PixiJS fill triangulates that list with earcut; newer PixiJS rounded-rectangle behavior can be represented as center-plus-perimeter triangle fan geometry. This project only needs convex, no-hole rounded rectangles, so it can keep a small local mesh generator.

## Goals / Non-Goals

**Goals:**

- Render filled rounded `RECT` shapes in WebGL when `cornerRadius > 0` and the fill color is parseable.
- Render solid stroked rounded `RECT` shapes in WebGL when `cornerRadius > 0`, stroke color is parseable, and stroke width is positive.
- Preserve Canvas order for rounded rectangles that have both fill and stroke: fill first, stroke second.
- Preserve command alpha, sprite transform, and shape transform behavior.
- Generate real local rounded-rect fill and stroke `.svga` fixtures through the same protobuf/zlib boundary as production loading.
- Expose the rounded-rect fixtures in the manual demo source picker.
- Provide WebGL snapshot support and expose current-frame snapshot access through the player facade.
- Declare WebGL capabilities only for implemented behavior.

**Non-Goals:**

- Do not add PixiJS, earcut, or another geometry dependency.
- Do not build a generic graphics batcher or generic path triangulator.
- Do not implement ellipse/path fill or stroke in WebGL.
- Do not implement masks in WebGL.
- Do not implement dashed rounded-rect strokes or stroke line cap/join/miter semantics.
- Do not rasterize rounded rectangles or snapshots through an auxiliary Canvas fallback.

## Decisions

### Decision: Build rounded-rect fill from local perimeter points and a triangle fan

Create a helper that clamps `radius = min(max(cornerRadius, 0), width / 2, height / 2)` and samples the four rounded corners into a clockwise perimeter point list. Filled rounded rectangles can then be rendered as triangles from a center point to each adjacent perimeter edge.

Rationale: SVGA rounded rectangles are convex and do not contain holes, so earcut is unnecessary for this scope. The existing backend already draws solid triangle lists, and a fan keeps the implementation small while following PixiJS' perimeter-first model.

Alternative considered: import or vendor earcut. That matches PixiJS' older rounded-rectangle fill path, but it adds dependency and bundle weight for a shape that does not require general polygon triangulation.

Alternative considered: approximate rounded rectangles with Canvas rasterization and upload a texture. That violates the existing backend direction that unsupported WebGL vector features should not be emulated through Canvas uploads.

### Decision: Build rounded-rect stroke as an outer/inner ring mesh

For stroke width `w`, generate an outer rounded rectangle expanded by `w / 2` and an inner rounded rectangle inset by `w / 2`. Stitch corresponding outer and inner perimeter points into quads, emitted as triangles through the existing solid-color shader.

Rationale: This is the rounded extension of the current rect-stroke ring mesh and follows PixiJS' broad approach of converting stroke outlines into triangles. It preserves centered stroke behavior for simple rounded rectangles without introducing a generic line builder.

Alternative considered: implement a generic closed-polyline stroker. That would be useful for future paths, but line joins, caps, miters, dashes, and self-intersections are broader than this change.

### Decision: Keep stroke-style capability support minimal

Open `shape.roundedRect.stroke` and keep relying on the existing `shape.strokeStyle.width` support. Continue to leave `shape.strokeStyle.lineCap`, `shape.strokeStyle.lineJoin`, `shape.strokeStyle.miterLimit`, and `shape.strokeStyle.lineDash` false.

Rationale: Rounded-rect stroke only needs color and width in this change. Reporting support for line styles that are still ignored would make unsupported diagnostics inaccurate.

Alternative considered: treat rounded corners as implicit round joins and enable `lineJoin`. That would overstate support because authored line-join values would still not affect rendering.

### Decision: Add real rounded-rect SVGA fixtures

Extend or add fixture generation so the repository contains `rounded-rect-fill.svga` and `rounded-rect-stroke.svga` under `__test__/svga/`. Both fixtures should be shape-only, use `ShapeEntity.type = RECT`, set `rect.cornerRadius > 0`, and avoid image data.

Rationale: Real fixtures validate the parser boundary: zlib inflate, protobuf decode, `VideoEntity` normalization, compiler capability scanning, and backend draw behavior. This follows the established rect-fill and rect-stroke fixture pattern.

Alternative considered: cover rounded rectangles only with hand-built `Video` objects in unit tests. That is useful for draw-order and degenerate cases, but it does not prove the file-format boundary.

### Decision: Snapshot returns the current backend canvas

Add WebGL `snapshot()` by returning the backend canvas, matching CanvasBackend's existing behavior. Add a public player snapshot method that delegates to the selected backend snapshot when available and returns `null` when unavailable.

Rationale: Both Canvas and WebGL render into the user-provided `HTMLCanvasElement`, so returning that current drawing surface is the least surprising and lowest-cost snapshot contract. It also lets capability reporting set WebGL `snapshot = true` without adding a readback or texture copy path.

Alternative considered: return an `ImageBitmap` copy. That provides a detached frame image but introduces asynchronous behavior or browser-dependent APIs, while the existing backend contract is synchronous and already permits returning `HTMLCanvasElement`.

### Decision: Manual verification stays fixture-driven

Add the rounded-rect fixtures to the existing manual demo source presets instead of creating a separate page.

Rationale: The manual page already supports local fixtures, custom URLs, and render-mode selection. Reusing it keeps Canvas/auto/WebGL comparison straightforward.

Alternative considered: add a dedicated rounded-rect HTML page. That would duplicate controls and make future fixture checks more scattered.

## Risks / Trade-offs

- [Risk] Triangle-fan fill can show subtle antialiasing differences from Canvas. -> Mitigation: verify structural draw behavior in tests and use manual visual comparison for acceptable parity rather than exact pixel matching.
- [Risk] Stroke ring sampling must keep outer and inner point counts aligned. -> Mitigation: generate both rings with the same segment count and point order, then test expected draw counts for rounded fill and stroke.
- [Risk] Very large stroke widths can collapse the inner rounded rectangle. -> Mitigation: skip degenerate stroke geometry without throwing, consistent with existing rect-stroke behavior.
- [Risk] Opening snapshot capability could imply a detached immutable image. -> Mitigation: document and test that snapshot returns the current canvas surface, matching CanvasBackend's existing behavior.
- [Risk] Public snapshot access may expose backend differences if a future backend cannot snapshot. -> Mitigation: keep the backend method optional and return `null` when unavailable.

## Migration Plan

1. Add rounded-rect fixture generation and commit the generated `.svga` files.
2. Add parser/compiler tests for the rounded-rect fixtures.
3. Add rounded-rect WebGL geometry helpers and draw-path handling.
4. Update WebGL capability declarations for rounded-rect fill/stroke and snapshot.
5. Add player snapshot delegation and public API tests.
6. Add manual demo presets for the rounded-rect fixtures.
7. Run unit tests, typecheck, format check, and build.

Rollback before release is straightforward: remove the new fixtures and presets, restore WebGL rounded-rect and snapshot capabilities to false, remove the WebGL rounded-rect draw path and public snapshot delegation, and keep existing rect fill/stroke behavior unchanged.

## Open Questions

- The exact rounded-corner segment count can be fixed or radius-dependent during implementation. It should be deterministic and high enough for manual parity without generating excessive vertices.
- The public snapshot method name should be `snapshot()` unless existing style inspection reveals a stronger local naming convention.
