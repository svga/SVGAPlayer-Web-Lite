## 1. Fixture Generation

- [x] 1.1 Add a small fixture generation script or test utility that builds a `MovieEntity` with one filled non-rounded `RECT` shape using the existing SVGA protobuf JSON schema.
- [x] 1.2 Encode the fixture with protobufjs, compress it with zlib deflate, and write a local `rect-fill.svga` file reachable from `__test__/remote-svga-player.html`.
- [x] 1.3 Verify the generated fixture decodes through the existing parser path into a shape-only video with a filled `RECT` shape and `cornerRadius` equal to zero.

## 2. WebGL Rect Fill

- [x] 2.1 Add WebGL helpers for parsing internal `rgba(...)` fill strings into normalized color values.
- [x] 2.2 Add transform composition for sprite command transforms plus shape transforms.
- [x] 2.3 Add a solid-color WebGL shader/program path that can draw rectangle vertices as two triangles.
- [x] 2.4 Update `WebGLBackend.drawCommand()` to render supported filled non-rounded rect shapes after texture and dynamic texture work.
- [x] 2.5 Keep rounded rect, ellipse, generic path, rect stroke, masks, snapshots, and stroke style work skipped when unsupported.
- [x] 2.6 Set WebGL `capabilities.shape.rect.fill` to true while leaving all other unsupported shape and stroke capabilities false.

## 3. Demo Page

- [x] 3.1 Update `__test__/remote-svga-player.html` to expose built-in SVGA source presets including the new local rect-fill fixture and the existing remote URL.
- [x] 3.2 Add custom URL input and ensure playback uses the custom URL when selected or entered.
- [x] 3.3 Add render mode selection for canvas, auto, webgl, and all modes.
- [x] 3.4 Preserve existing play, pause, resume, stop, WebGL context loss, WebGL context restore, destroy, status, and log controls.

## 4. Tests

- [x] 4.1 Add unit coverage that a compiled rect-fill fixture requires `shape.rect.fill`.
- [x] 4.2 Add unit coverage that WebGL capabilities include `shape.rect.fill` but still exclude rect stroke and other shape capabilities.
- [x] 4.3 Add WebGL backend unit coverage proving a shape-only filled rect issues draw work without throwing.
- [x] 4.4 Add regression coverage proving rounded rects, path shapes, and stroked rect requirements remain unsupported or skipped as specified.
- [x] 4.5 Add fixture verification coverage that the saved `.svga` decodes into the expected rect shape data.

## 5. Verification

- [x] 5.1 Run typecheck.
- [x] 5.2 Run unit tests.
- [x] 5.3 Build the browser bundle needed by the manual demo page.
- [x] 5.4 Manually verify `rect-fill.svga` renders visibly in canvas, auto, and webgl modes from the demo page.
- [x] 5.5 Manually verify the existing remote URL preset still plays and existing WebGL context loss/restore controls still work.
