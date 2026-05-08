## Context

The compiler already represents SVGA `ELLIPSE` shapes as `CompiledGeometry` with `type: 'ellipse'`, `x`, `y`, `radiusX`, and `radiusY`. It also marks `shape.ellipse.fill` and `shape.ellipse.stroke` requirements when ellipse shapes use fill or stroke styles.

CanvasBackend already renders ellipses by converting each ellipse into a Canvas path made of four cubic bezier segments, then applying fill and stroke in Canvas order. WebGLBackend currently only draws `rect` geometries; any `ellipse` geometry is skipped, and WebGL capabilities still declare `shape.ellipse.fill` and `shape.ellipse.stroke` as unsupported.

PixiJS is the reference for the geometric approach, not a dependency target. PixiJS' current circle/ellipse builder generates a perimeter point list and triangulates fill with a center vertex fan. Stroke work in PixiJS routes the closed contour through line/stroke mesh generation. This project can keep the same local, dependency-free style already used for rect and rounded-rect rendering.

## Goals / Non-Goals

**Goals:**

- Render filled `ELLIPSE` shapes in WebGL when `radiusX > 0`, `radiusY > 0`, and the fill color is parseable.
- Render solid stroked `ELLIPSE` shapes in WebGL when radii are positive, stroke color is parseable, and stroke width is positive.
- Preserve Canvas order for ellipses that have both fill and stroke: fill first, stroke second.
- Preserve command alpha, sprite transform, and shape transform behavior.
- Generate real local ellipse fill and stroke `.svga` fixtures through the same protobuf/zlib boundary as production loading.
- Expose the ellipse fixtures in the manual demo source picker.
- Declare WebGL ellipse capabilities only for implemented behavior.

**Non-Goals:**

- Do not add PixiJS, earcut, or another geometry dependency.
- Do not build a generic graphics batcher or generic path triangulator.
- Do not implement generic path fill or stroke in WebGL.
- Do not implement masks in WebGL.
- Do not implement dashed ellipse strokes or stroke line cap/join/miter semantics.
- Do not rasterize ellipses through an auxiliary Canvas fallback.

## Decisions

### Decision: Build ellipse fill from local perimeter points and a triangle fan

Create a helper that samples an ellipse perimeter around center `(x, y)` with radii `radiusX` and `radiusY`. Filled ellipses can then be rendered as triangles from the center point to each adjacent perimeter edge.

Rationale: This matches PixiJS' current fill strategy for circle/ellipse-like shapes and fits the existing WebGL solid triangle-list rendering path. Ellipses are convex and have no holes, so a triangle fan is sufficient.

Alternative considered: use Canvas' four cubic bezier approximation directly. WebGL does not render bezier curves directly in this backend, so those curves would still need tessellation.

Alternative considered: import or vendor earcut. That is unnecessary for convex ellipses and would add dependency weight for a simple primitive.

### Decision: Build ellipse stroke as an outer/inner ring mesh

For stroke width `w`, generate an outer ellipse with radii `radiusX + w / 2` and `radiusY + w / 2`, and an inner ellipse with radii `radiusX - w / 2` and `radiusY - w / 2`. Stitch corresponding outer and inner perimeter points into quads, emitted as triangles through the existing solid-color shader.

Rationale: This mirrors the current rect and rounded-rect stroke approach and keeps the first ellipse stroke implementation small. It follows PixiJS' broad concept of converting a closed contour stroke into triangles without introducing a full line builder yet.

Alternative considered: implement a generic closed-polyline stroker now and feed ellipse perimeter points through it. That would help future path stroke work, but line joins, caps, miters, dashes, and self-intersections are broader than ellipse support.

### Decision: Keep stroke-style capability support minimal

Open `shape.ellipse.stroke` and rely on existing `shape.strokeStyle.width` support. Continue to leave `shape.strokeStyle.lineCap`, `shape.strokeStyle.lineJoin`, `shape.strokeStyle.miterLimit`, and `shape.strokeStyle.lineDash` false.

Rationale: Ellipse stroke only needs color and width in this change. Reporting support for line styles that are still ignored would make unsupported diagnostics inaccurate.

Alternative considered: enable line join/cap because ellipses are closed smooth contours. That would overstate support because authored style values would still not affect rendering.

### Decision: Add real ellipse SVGA fixtures

Extend or add fixture generation so the repository contains `ellipse-fill.svga` and `ellipse-stroke.svga` under `__test__/svga/`. Both fixtures should be shape-only, use `ShapeEntity.type = ELLIPSE`, set positive `radiusX` and `radiusY`, and avoid image data.

Rationale: Real fixtures validate the parser boundary: zlib inflate, protobuf decode, `VideoEntity` normalization, compiler capability scanning, and backend draw behavior. This follows the established rect and rounded-rect fixture pattern.

Alternative considered: cover ellipses only with hand-built `Video` objects in unit tests. That is useful for draw-order and degenerate cases, but it does not prove the file-format boundary.

### Decision: Manual verification stays fixture-driven

Add the ellipse fixtures to the existing manual demo source presets instead of creating a separate page.

Rationale: The manual page already supports local fixtures, custom URLs, and render-mode selection. Reusing it keeps Canvas/auto/WebGL comparison straightforward.

Alternative considered: add a dedicated ellipse HTML page. That would duplicate controls and make future fixture checks more scattered.

## Risks / Trade-offs

- [Risk] Polygon-sampled ellipse edges can differ subtly from Canvas bezier antialiasing. -> Mitigation: verify structural draw behavior in tests and use manual visual comparison for acceptable parity rather than exact pixel matching.
- [Risk] Stroke ring sampling must keep outer and inner point counts aligned. -> Mitigation: generate both rings with the same segment count and point order, then test expected draw behavior for fill and stroke.
- [Risk] Very large stroke widths can collapse the inner ellipse. -> Mitigation: skip degenerate stroke geometry without throwing, consistent with existing rect and rounded-rect stroke behavior.
- [Risk] Segment count can be too low for large ellipses or too high for small ellipses. -> Mitigation: use a deterministic radius-based segment count inspired by PixiJS and keep tests structural.

## Migration Plan

1. Add ellipse fixture generation and commit the generated `.svga` files.
2. Add parser/compiler tests for the ellipse fixtures.
3. Add ellipse WebGL geometry helpers and draw-path handling.
4. Update WebGL capability declarations for ellipse fill/stroke.
5. Add manual demo presets for the ellipse fixtures.
6. Run unit tests, typecheck, format check, build, and manual playback verification.

Rollback before release is straightforward: remove the new fixtures and presets, restore WebGL ellipse capabilities to false, remove the WebGL ellipse draw path, and keep existing rect and rounded-rect behavior unchanged.

## Open Questions

- The exact ellipse segment-count formula can be fixed during implementation. It should be deterministic and visually adequate without generating excessive vertices.
