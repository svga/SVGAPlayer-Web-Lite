## 1. Fixture Generation

- [x] 1.1 Inspect the existing local SVGA fixture generator and parser tests for rect and rounded-rect patterns to reuse.
- [x] 1.2 Add generation for `__test__/svga/ellipse-fill.svga` as a real protobuf/zlib SVGA v2 file containing a shape-only filled `ELLIPSE`.
- [x] 1.3 Add generation for `__test__/svga/ellipse-stroke.svga` as a real protobuf/zlib SVGA v2 file containing a shape-only solid stroked `ELLIPSE`.
- [x] 1.4 Verify both generated fixtures decode through the existing parser path and contain positive `radiusX` and `radiusY` values.
- [x] 1.5 Verify the fill fixture requires only `shape.ellipse.fill` and the stroke fixture requires only `shape.ellipse.stroke` plus `shape.strokeStyle.width`.

## 2. Capability and Fixture Tests

- [x] 2.1 Add unit coverage that decodes `ellipse-fill.svga` and asserts the parsed shape is an ellipse with a parseable fill color.
- [x] 2.2 Add unit coverage that decodes `ellipse-stroke.svga` and asserts the parsed shape is an ellipse with a parseable stroke color and positive stroke width.
- [x] 2.3 Add compiler requirement coverage for ellipse fill and solid ellipse stroke fixtures.
- [x] 2.4 Add WebGL capability coverage asserting `shape.ellipse.fill` and `shape.ellipse.stroke` are true.
- [x] 2.5 Add WebGL capability coverage asserting generic path, mask, line dash, line cap, line join, and miter limit capabilities remain false.

## 3. WebGL Ellipse Geometry

- [x] 3.1 Add a deterministic ellipse segment-count helper inspired by PixiJS circle/ellipse tessellation behavior without adding PixiJS or earcut as a dependency.
- [x] 3.2 Add a helper to sample ellipse perimeter points from center, radii, and segment count.
- [x] 3.3 Add filled ellipse triangle generation using a center vertex fan.
- [x] 3.4 Add stroked ellipse ring triangle generation using aligned outer and inner ellipse perimeters.
- [x] 3.5 Ensure geometry helpers skip non-positive radii, non-positive stroke widths, and collapsed inner stroke rings without throwing.

## 4. WebGL Rendering Integration

- [x] 4.1 Route compiled `geometry.type === 'ellipse'` commands through the WebGL shape drawing path.
- [x] 4.2 Render filled ellipses with the existing solid-color shader and preserve fill color plus command alpha.
- [x] 4.3 Render solid stroked ellipses with the existing solid-color shader and preserve stroke color plus command alpha.
- [x] 4.4 Preserve composed sprite and shape transforms for ellipse fill and stroke rendering.
- [x] 4.5 Preserve Canvas draw order by drawing ellipse fill before ellipse stroke when both styles exist.
- [x] 4.6 Keep dashed stroke, line cap, line join, and miter-limit variants unsupported in capability reporting until those styles affect rendering.

## 5. WebGL Render Tests

- [x] 5.1 Add WebGL unit coverage showing a shape-only filled ellipse issues solid draw work without texture work.
- [x] 5.2 Add WebGL unit coverage showing a shape-only stroked ellipse issues solid draw work without texture work.
- [x] 5.3 Add WebGL unit coverage for an ellipse with both fill and stroke verifying fill-before-stroke draw order.
- [x] 5.4 Add WebGL unit coverage for command alpha, parseable fill color, and parseable stroke color.
- [x] 5.5 Add WebGL unit coverage for sprite and shape transform composition on ellipse draw work.
- [x] 5.6 Add WebGL unit coverage for degenerate fill and stroke cases confirming they skip invalid draw work without throwing.
- [x] 5.7 Add unsupported-capability coverage for dashed ellipse stroke and explicit line join style.

## 6. Manual Demo

- [x] 6.1 Add ellipse fill and ellipse stroke fixtures to the remote SVGA player demo source presets.
- [x] 6.2 Preserve all existing demo preset labels and source paths while adding the ellipse entries.
- [x] 6.3 Manually verify the ellipse fill fixture in `canvas`, `auto`, `webgl`, and comparison modes.
- [x] 6.4 Manually verify the ellipse stroke fixture in `canvas`, `auto`, `webgl`, and comparison modes.

## 7. Verification

- [x] 7.1 Run the focused unit tests for fixture decoding, compiler requirements, and WebGL ellipse rendering.
- [x] 7.2 Run `npm run test:unit`.
- [x] 7.3 Run `npm run type:check`.
- [x] 7.4 Run `npm run format:check`.
- [x] 7.5 Run `npm run build`.
- [x] 7.6 Confirm WebGL unsupported warnings remain precise for unimplemented stroke-style, path, and mask features.
