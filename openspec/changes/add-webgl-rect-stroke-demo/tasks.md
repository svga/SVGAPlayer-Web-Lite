## 1. Fixture Generation

- [x] 1.1 Extend the local SVGA fixture generator or add a sibling generator path that can encode `ShapeStyle.stroke` and positive `ShapeStyle.strokeWidth`.
- [x] 1.2 Generate a real local `__test__/svga/rect-stroke.svga` file using the project's protobuf schema and zlib deflate.
- [x] 1.3 Verify the generated fixture inflates and decodes into a shape-only non-rounded `RECT` with non-null stroke color, positive stroke width, and no image data.
- [x] 1.4 Ensure the rect-stroke fixture does not set line dash, line cap, line join, or miter limit fields that would require unsupported WebGL stroke style capabilities.

## 2. Manual Demo Page

- [x] 2.1 Add the local rect-stroke fixture to the built-in source presets in `__test__/remote-svga-player.html`.
- [x] 2.2 Preserve the existing rect-fill fixture, existing remote URL preset, custom URL input, render mode selector, and playback/context controls.
- [x] 2.3 Ensure single-frame shape-only fixtures still produce pass status in canvas, auto, and webgl modes.

## 3. WebGL Rect Stroke Rendering

- [x] 3.1 Add a rect-stroke vertex generation helper that converts a non-rounded rect and stroke width into a ring mesh.
- [x] 3.2 Reuse the existing solid-color WebGL program to draw rect stroke geometry with stroke color multiplied by command alpha.
- [x] 3.3 Update WebGL shape drawing so supported rect fill renders first and supported rect stroke renders second.
- [x] 3.4 Skip rect stroke draw work without throwing when stroke color is missing or unparsable, stroke width is missing or non-positive, dimensions are non-positive, or geometry degenerates.
- [x] 3.5 Keep rounded rects, ellipses, generic paths, masks, and unsupported stroke styles out of the WebGL draw path.
- [x] 3.6 Preserve WebGL attribute/buffer state correctness when switching among texture, rect fill, and rect stroke draws.

## 4. Capability Reporting

- [x] 4.1 Set WebGL `capabilities.shape.rect.stroke` to true after the stroke renderer is implemented.
- [x] 4.2 Set WebGL `capabilities.shape.strokeStyle.width` to true because rect stroke requires positive stroke width.
- [x] 4.3 Keep WebGL `shape.strokeStyle.lineCap`, `shape.strokeStyle.lineJoin`, `shape.strokeStyle.miterLimit`, and `shape.strokeStyle.lineDash` false.
- [x] 4.4 Keep WebGL rounded rect, ellipse, path, mask, and snapshot capabilities false.

## 5. Unit Coverage

- [x] 5.1 Add fixture coverage proving `rect-stroke.svga` decodes through the parser path with expected rect stroke styles and no image data.
- [x] 5.2 Add compiler coverage proving the rect-stroke fixture requires `shape.rect.stroke` and `shape.strokeStyle.width`.
- [x] 5.3 Add capability coverage proving WebGL supports rect fill, rect stroke, and stroke width while still rejecting unsupported stroke styles and other shape kinds.
- [x] 5.4 Add WebGL backend coverage proving a stroke-only non-rounded rect issues draw work without throwing.
- [x] 5.5 Add WebGL backend coverage proving fill-plus-stroke rects draw fill before stroke.
- [x] 5.6 Add regression coverage proving dashed rect stroke, rounded rect stroke, path stroke, and degenerate rect stroke remain unsupported or skipped as specified.

## 6. Verification

- [x] 6.1 Run `npm run type:check`.
- [x] 6.2 Run `npm run test:unit`.
- [x] 6.3 Run `npm run format:check`.
- [x] 6.4 Run `npm run build:umd` and `npm run build:index` so the manual page uses updated browser bundles.
- [x] 6.5 Manually verify `rect-stroke.svga` plays visibly in canvas, auto, and webgl modes from `__test__/remote-svga-player.html`.
- [x] 6.6 Confirm browser console has no WebGL errors while switching from rect-fill to rect-stroke.
