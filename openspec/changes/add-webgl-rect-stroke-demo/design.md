## Context

The rect-fill change established the first WebGL shape draw path: non-rounded `RECT` fill is rendered with a solid-color shader, and WebGL declares `shape.rect.fill`. The compiler already marks `shape.rect.stroke` when a non-rounded rect has stroke information, and `VideoEntity` normalizes proto `strokeWidth <= 0` to `null`, so the remaining gap is WebGL geometry generation and capability reporting.

Canvas draws shapes by building a path, applying fill first, then calling `stroke()` when `shape.styles.stroke` is non-null. WebGL does not have a vector stroke primitive in this backend, so stroked rectangles must be converted to triangles before drawing.

PixiJS provides a useful reference shape: rectangles are first expanded into four corner points; fills triangulate those points directly; strokes route the closed point list through a line builder that emits a triangle band around the contour. This project does not yet have Pixi's graphics batcher or generic line builder, so the first rect-stroke implementation should keep that idea but use a rect-specific mesh.

## Goals / Non-Goals

**Goals:**

- Generate a real local SVGA version 2 fixture containing a non-rounded stroked rectangle.
- Add the rect-stroke fixture to the manual player source list so Canvas, auto, and WebGL can be compared visually.
- Render solid-color strokes for non-rounded WebGL rect shapes with positive stroke width.
- Preserve Canvas draw order for rects that have both fill and stroke: fill first, stroke second.
- Declare WebGL support for `shape.rect.stroke` and `shape.strokeStyle.width` only after the implementation exists.
- Keep unsupported diagnostics accurate for dashed strokes and other stroke details that are not implemented.

**Non-Goals:**

- Do not implement rounded rect stroke, ellipse stroke, path stroke, masks, snapshots, or dashed strokes.
- Do not introduce PixiJS or a new dependency.
- Do not build a generic path stroker or graphics batching architecture in this change.
- Do not rasterize stroked shapes through Canvas and upload them as textures.
- Do not change the public package API.

## Decisions

### Decision: Extend the fixture generator to produce rect-stroke data

Keep the fixture generation close to `scripts/generate-rect-fill-fixture.mjs`, using the existing SVGA proto JSON and Node zlib. Add support for `ShapeStyle.stroke` and `ShapeStyle.strokeWidth`, then write a local `rect-stroke.svga` file under `__test__/svga/`.

Rationale: a real `.svga` fixture validates the same protobuf/zlib boundary used by the parser and manual demo page. It also avoids confusing compiler-only tests with file-format behavior.

Alternative considered: generate `Video` objects in unit tests only. That is useful for backend tests, but it cannot prove that the parser maps proto stroke fields into internal styles correctly.

### Decision: Use a rect-specific stroke mesh

Implement rect stroke by generating a ring around the rectangle. For a stroke width `w`, use `half = w / 2`; the outer rect expands by `half`, and the inner rect shrinks by `half`. Draw the four ring sides as triangles through the same solid-color shader used for rect fill.

Rationale: this captures the centered stroke behavior expected from Canvas for the simple non-rounded rect case and keeps the first implementation small. It follows Pixi's broad idea of turning stroke into triangles without importing Pixi's full line-join machinery.

Alternative considered: implement a generic closed-polyline stroke builder now. That would be more reusable for paths and rounded rects, but it introduces line joins, caps, miter behavior, and more edge cases than this narrow rect feature requires.

### Decision: Keep stroke style support minimal and explicit

Open `shape.rect.stroke` and `shape.strokeStyle.width` for WebGL. Continue to leave `shape.strokeStyle.lineCap`, `shape.strokeStyle.lineJoin`, `shape.strokeStyle.miterLimit`, and `shape.strokeStyle.lineDash` false.

Rationale: rect-stroke requires width, but closed axis-aligned rectangles do not need line cap. Join and miter differences are not visible for the planned centered square-corner mesh unless broader join semantics are implemented. Dash requires segmenting each edge and should remain unsupported.

Alternative considered: set all stroke style capabilities true for rect stroke. That would make unsupported diagnostics inaccurate because dashed or rounded-join strokes could appear accepted while still rendering as a plain solid square-corner ring.

### Decision: Draw fill and stroke as separate solid passes

If a supported rect has a fill, draw the filled rect first. If it has a stroke and positive stroke width, draw the stroke mesh second using stroke color multiplied by command alpha.

Rationale: Canvas uses fill-then-stroke order, so keeping separate passes gives expected visual layering and avoids coupling fill/stroke geometry. Reusing the existing solid shader minimizes new WebGL state.

Alternative considered: merge fill and stroke into one mesh. That can reduce draw calls, but it adds color-per-vertex or multi-batch complexity before the backend has a graphics batching model.

### Decision: Treat invalid or degenerate stroke geometry as skipped work

Skip stroke rendering when stroke color cannot be parsed, stroke width is null or non-positive, rect dimensions are non-positive, or the inner rect collapses. In those cases the backend should not throw.

Rationale: parser normalization already removes non-positive stroke width, and WebGL should remain robust for odd authored data. Skipping degenerate geometry matches the backend's current pattern for unsupported shapes.

Alternative considered: clamp collapsed inner rect and render an outer filled rect. That may be useful for huge strokes later, but it can diverge from Canvas in subtle ways and is not necessary for the first demo fixture.

## Risks / Trade-offs

- [Risk] The centered stroke mesh may not be pixel-identical to Canvas antialiasing. -> Mitigation: test behavior structurally and verify manual visual parity rather than requiring exact pixel equality.
- [Risk] Opening `shape.strokeStyle.width` for WebGL can make unsupported reporting less strict for future non-rect stroke cases. -> Mitigation: keep shape-specific stroke capabilities false for rounded rect, ellipse, and path so those animations still report unsupported shape stroke paths.
- [Risk] A fixture with only stroke and no fill can look blank if stroke color parsing or mesh generation fails. -> Mitigation: unit-test decoded fixture styles, compiler requirements, and WebGL draw calls before relying on manual inspection.
- [Risk] WebGL state shared between texture, fill, and stroke draw paths can regress texture rendering. -> Mitigation: reuse the solid draw setup that already disables texture attributes and add coverage for texture plus shape rendering.

## Migration Plan

1. Extend or add a fixture generator path for `rect-stroke.svga`.
2. Generate and commit the local rect-stroke fixture under `__test__/svga/`.
3. Add the fixture to the manual page source preset list.
4. Add unit coverage for fixture decode/compile behavior and WebGL capability flags.
5. Add rect-stroke mesh generation and WebGL draw handling.
6. Verify typecheck, unit tests, build outputs, format check, and manual playback in canvas, auto, and webgl modes.

Rollback before release is straightforward: remove the fixture and manual source option, restore WebGL `shape.rect.stroke` and `shape.strokeStyle.width` to false, and remove the stroke draw path/tests.

## Open Questions

- Should the fixture be stroke-only or fill-plus-stroke? The strongest regression fixture is stroke-only because it proves WebGL cannot pass by only drawing the existing fill path. A second fill-plus-stroke compiler/backend test can cover draw order without needing another local file.
