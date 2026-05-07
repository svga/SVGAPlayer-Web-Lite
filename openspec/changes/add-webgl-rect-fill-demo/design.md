## Context

The compiler already represents plain rectangles as `CompiledGeometry` with `type: 'rect'` and marks `requiredCapabilities.shape.rect.fill` when a `RECT` shape has a fill and `cornerRadius === 0`. WebGL currently declares support only for static and dynamic textures, and `WebGLBackend.drawCommand()` renders image, replacement, and dynamic texture work while ignoring `command.shapes`.

The existing manual page at `__test__/remote-svga-player.html` is useful for remote animation playback and WebGL context restoration checks, but its source URL is hardcoded and it always creates canvas, auto, and webgl players together. That makes it awkward to repeatedly inspect a narrow local shape fixture.

## Goals / Non-Goals

**Goals:**

- Provide a real local `.svga` file containing a filled non-rounded rectangle, encoded through the same protobuf schema and zlib compression the parser expects.
- Make the manual demo page source-selectable and render-mode-selectable while keeping the existing hardcoded remote URL available as a preset.
- Render filled non-rounded `RECT` shapes in WebGL using native WebGL draw calls.
- Update WebGL capability reporting so `shape.rect.fill` is true only after rendering support exists.
- Keep unsupported capability warnings accurate for rect stroke, rounded rects, ellipses, generic paths, masks, snapshots, and stroke style details.

**Non-Goals:**

- Do not implement rect stroke, rounded rect fill/stroke, ellipse fill/stroke, generic path fill/stroke, masks, snapshots, or line dash.
- Do not add a PixiJS-style batching architecture, white-texture color pipeline, or new graphics abstraction layer.
- Do not rasterize shapes through Canvas and upload them as WebGL textures.
- Do not change public package exports or parser worker behavior.

## Decisions

### Decision: Generate a real protobuf/zlib SVGA fixture

Create the fixture from a `MovieEntity`-shaped object, not from the internal `Video` shape. The generator should use `Root.fromJSON(SVGA_PROTO)`, `lookupType('com.opensource.svga.MovieEntity')`, protobuf encode, and Node's zlib deflate to write the `.svga` bytes.

Rationale: the parser loads version 2 SVGA files by inflating bytes and decoding `MovieEntity`, then `VideoEntity` maps proto rect shapes to internal `SHAPE_TYPE.RECT`. A fixture produced through that path validates the actual loading boundary used by manual demos.

Alternative considered: keep using `createVideo()` in tests only. That is useful for compiler and backend unit tests, but it bypasses the real file format and cannot be selected from the manual page.

### Decision: Scope the fixture to a shape-only filled rect

The first fixture should contain one sprite, one frame or a short repeated sequence, no images, no clip path, no stroke, no rounded corners, and one `ShapeEntity` with `type: RECT`, `rect.cornerRadius = 0`, and `styles.fill` set to opaque RGBA.

Rationale: a shape-only fixture makes success or failure visually obvious: Canvas should show the rectangle, current unsupported WebGL shows no rectangle, and fixed WebGL should match the visible filled rectangle. Avoiding images also prevents texture support from hiding the rect-specific result.

Alternative considered: include an image behind the rect. That helps test draw order later, but it weakens the first visual check because WebGL could still draw something even if rect fill is missing.

### Decision: Add a solid-color WebGL draw path for rect fill

Implement rect fill as two triangles using the existing position buffer pattern and a solid-color shader/program. Draw each supported rect shape after texture and dynamic texture work in `drawCommand()`, preserving the current command ordering where shapes are drawn after images and dynamic elements.

Rationale: PixiJS ultimately turns rectangle fill into a simple triangle-list, but this project does not yet have a graphics batcher or vertex-color pipeline. A dedicated solid-color program keeps the first WebGL shape capability small and honest.

Alternative considered: emulate PixiJS by creating or reusing a white texture and tinting it. That would align with future batching concepts, but it introduces texture state coupling before the backend has a graphics batching model.

### Decision: Keep capability flags exact

Set only `capabilities.shape.rect.fill = true` for WebGL. Leave `shape.rect.stroke`, `shape.roundedRect.*`, `shape.ellipse.*`, `shape.path.*`, `shape.strokeStyle.*`, `masks`, and `snapshot` false.

Rationale: capability paths are the external contract used by unsupported warnings. Opening only the implemented path keeps WebGL usable for rect-fill fixtures without implying broader shape support.

Alternative considered: enable all rect capabilities. Stroke needs mesh generation and stroke style handling, so reporting it before implementation would produce false negatives in unsupported capability diagnostics.

### Decision: Compose command and shape transforms for shape drawing

For shape rendering, WebGL should apply the sprite command transform and the shape transform before converting local rect coordinates to clip space. The implementation can add a small transform composition helper and pass the resulting matrix to the solid program.

Rationale: Canvas rendering applies command transform at the sprite level and shape transform inside `drawShape()`. WebGL needs equivalent composition because the shader accepts a single matrix uniform.

Alternative considered: use only the shape transform. That would work for the simplest fixture but diverges from Canvas behavior for real SVGA data.

### Decision: Manual page controls replace the hardcoded source-only flow

Update the manual page to expose a source preset selector, custom URL input, and render mode selector. Presets should include the new local rect fixture and the existing remote URL. The page should allow running one selected mode or all modes for comparison.

Rationale: the same page can then serve both targeted local visual checks and the existing remote playback smoke test.

Alternative considered: add a second HTML page just for rect fill. That is simpler initially but duplicates playback controls and makes future fixture testing scatter across pages.

## Risks / Trade-offs

- [Risk] WebGL state changes between texture and solid programs can break texture rendering if locations or buffers are reused incorrectly. -> Mitigation: keep program-specific locations explicit and add unit coverage that texture rendering still calls `drawArrays`.
- [Risk] Color parsing from internal `rgba(...)` strings can be brittle. -> Mitigation: add a small parser limited to the existing `VideoEntity` output format and test opaque fixture colors first.
- [Risk] Shape-only fixture generation can drift from parser expectations if null/default protobuf fields are mishandled. -> Mitigation: verify the generated file by loading it through the existing parser path or by decoding/inflating it in a test script.
- [Risk] Manual page controls can make the existing context-loss smoke flow harder to use. -> Mitigation: keep the current remote URL as a preset and preserve all context-loss/playback buttons.
- [Risk] Rect fill support may visually differ from Canvas for alpha or transform edge cases. -> Mitigation: test command alpha, shape transform, and no-stroke behavior in unit tests before broadening shape support.

## Migration Plan

1. Add a fixture generator or script path that produces the local rect-fill `.svga` with existing dependencies.
2. Save the generated fixture under an existing test/demo asset location reachable from the manual page.
3. Add unit coverage for WebGL `shape.rect.fill` capability declaration and unsupported diff behavior.
4. Add WebGL rect fill rendering and tests that shape-only rect frames produce a draw call while unsupported shape kinds remain skipped.
5. Update the manual page controls and verify the local fixture can be selected in canvas, auto, and webgl modes.

Rollback is straightforward before release: remove the fixture and demo controls, restore `shape.rect.fill` to false in WebGL capabilities, and remove the WebGL rect fill draw path.

## Open Questions

- Exact fixture path can be chosen during implementation, but it should be reachable from `__test__/remote-svga-player.html` without an extra server route.
