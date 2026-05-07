## 1. Rounded Rect Fixtures

- [x] 1.1 Inspect the existing rect fixture generator and choose whether to extend it or add a rounded-rect-specific generator.
- [x] 1.2 Generate a real local `__test__/svga/rounded-rect-fill.svga` file using the project's protobuf schema and zlib deflate.
- [x] 1.3 Generate a real local `__test__/svga/rounded-rect-stroke.svga` file using the project's protobuf schema and zlib deflate.
- [x] 1.4 Verify both fixtures inflate and decode through the parser into shape-only `RECT` data with `cornerRadius > 0` and no image data.
- [x] 1.5 Verify the stroke fixture avoids line dash, line cap, line join, and miter limit fields that remain unsupported in WebGL.

## 2. Fixture And Capability Tests

- [x] 2.1 Add unit coverage proving the rounded-rect fill fixture decodes with non-null fill, no stroke, and `cornerRadius > 0`.
- [x] 2.2 Add unit coverage proving the rounded-rect stroke fixture decodes with non-null stroke, positive stroke width, and `cornerRadius > 0`.
- [x] 2.3 Add compiler coverage proving the rounded-rect fill fixture requires `shape.roundedRect.fill` and no stroke capabilities.
- [x] 2.4 Add compiler coverage proving the rounded-rect stroke fixture requires `shape.roundedRect.stroke` and `shape.strokeStyle.width`.
- [x] 2.5 Update capability tests so WebGL supports rect fill/stroke, roundedRect fill/stroke, stroke width, and snapshot while still rejecting unsupported stroke styles, ellipse/path rendering, and masks.

## 3. WebGL Rounded Rect Geometry

- [x] 3.1 Add a deterministic rounded-rect perimeter helper that clamps radius and samples corners in a stable order.
- [x] 3.2 Add a rounded-rect fill vertex helper that converts the perimeter into a triangle fan suitable for `drawSolidVertices`.
- [x] 3.3 Add a rounded-rect stroke vertex helper that builds an outer/inner ring mesh from positive stroke width.
- [x] 3.4 Ensure degenerate rounded-rect fill or stroke geometry returns no vertices and does not throw.
- [x] 3.5 Keep all rounded-rect geometry helpers local to the WebGL backend unless a broader shared shape utility already exists.

## 4. WebGL Rounded Rect Rendering

- [x] 4.1 Update WebGL `drawShape` so non-rounded rects continue using the existing rect fill/stroke paths.
- [x] 4.2 Route `RECT` geometries with `cornerRadius > 0` and fill style through the rounded-rect fill helper.
- [x] 4.3 Route `RECT` geometries with `cornerRadius > 0`, stroke color, and positive stroke width through the rounded-rect stroke helper.
- [x] 4.4 Preserve command alpha, composed sprite/shape transforms, and fill-before-stroke draw order.
- [x] 4.5 Continue skipping dashed strokes and explicit line cap, line join, or miter limit styles in WebGL.
- [x] 4.6 Set WebGL `capabilities.shape.roundedRect.fill` and `capabilities.shape.roundedRect.stroke` to true only after rendering support exists.

## 5. Snapshot Support

- [x] 5.1 Add WebGLBackend `snapshot()` that returns the current backend canvas without auxiliary Canvas rasterization.
- [x] 5.2 Set WebGL `capabilities.snapshot` to true after WebGL snapshot support exists.
- [x] 5.3 Add public `SVGAPlayer.snapshot()` delegation that returns the backend snapshot result when available and `null` otherwise.
- [x] 5.4 Add unit coverage proving Canvas and WebGL player snapshots return the current canvas surface.
- [x] 5.5 Add unit coverage proving snapshot does not mutate playback state, active slot, current frame, or backend resources.
- [x] 5.6 Add public entry/type-surface coverage for the snapshot method if the current tests assert exported API shape.

## 6. WebGL Render Tests

- [x] 6.1 Add WebGL backend coverage proving a shape-only rounded-rect fill frame issues draw work without throwing.
- [x] 6.2 Add WebGL backend coverage proving a shape-only rounded-rect stroke frame issues draw work without throwing.
- [x] 6.3 Add WebGL backend coverage proving rounded-rect fill and stroke draw in Canvas order.
- [x] 6.4 Add WebGL backend coverage proving clamped radius cases still draw.
- [x] 6.5 Add WebGL backend coverage proving degenerate rounded-rect strokes are skipped without throwing.
- [x] 6.6 Add regression coverage proving dashed or explicitly styled rounded-rect strokes remain unsupported or skipped as specified.

## 7. Manual Demo

- [x] 7.1 Add the rounded-rect fill fixture to the manual player source preset list.
- [x] 7.2 Add the rounded-rect stroke fixture to the manual player source preset list.
- [x] 7.3 Preserve existing rect-fill, rect-stroke, remote URL, custom URL, render mode selector, and context controls.
- [x] 7.4 Manually verify rounded-rect fill plays visibly in canvas, auto, and webgl modes from the manual demo page.
- [x] 7.5 Manually verify rounded-rect stroke plays visibly in canvas, auto, and webgl modes from the manual demo page.

## 8. Verification

- [x] 8.1 Run `npm run test:unit`.
- [x] 8.2 Run `npm run type:check`.
- [x] 8.3 Run `npm run format:check`.
- [x] 8.4 Run `npm run build`.
- [x] 8.5 Confirm unsupported capability warnings no longer include roundedRect fill/stroke for the new fixtures in WebGL mode.
- [x] 8.6 Confirm unsupported capability warnings still include masks, paths, ellipses, dashed strokes, and unsupported stroke style details when those features are required.
