## 1. Public API Facade

- [ ] 1.1 Add `SVGAPlayer` class with constructor options for container, renderMode, parser worker options, playback config, and cache flags
- [ ] 1.2 Implement `parse(source: string | Video)` by delegating URL parsing to the existing Parser and accepting already parsed Video data
- [ ] 1.3 Preserve existing parser worker and non-worker parser behavior behind `SVGAPlayer.parse()`
- [ ] 1.4 Implement `compile(options?)` as the explicit transition from parsed video to compiled animation
- [ ] 1.5 Implement `play`, `pause`, `resume`, `stop`, `clear`, and `destroy` on the facade using compiled animation state
- [ ] 1.6 Implement typed `on(event, callback)` subscriptions for start, resume, pause, stop, process, end, and error events with unsubscribe return values
- [ ] 1.7 Update package exports so `SVGAPlayer` is the primary exported class

## 2. Render Compiler

- [ ] 2.1 Create RenderCompiler module and `CompiledAnimation`, `FrameRenderCommand`, `CompiledResources`, and `RenderCapabilities` types
- [ ] 2.2 Move current `Player.mount()` initialization responsibilities into compiler/backend preparation boundaries
- [ ] 2.3 Normalize image resources from parsed video data into compiled resource metadata without replacing the parser worker image extraction path
- [ ] 2.4 Compile per-frame texture, dynamic element, replacement element, shape, mask, transform, alpha, and style commands while preserving draw order
- [ ] 2.5 Parse shape paths into reusable command/contour structures before playback
- [ ] 2.6 Detect holes, complex contours, unsupported path commands, mask paths, strokes, line dashes, and other required capabilities before backend selection
- [ ] 2.7 Add reusable geometry cache IDs so repeated shapes are referenced rather than copied per frame
- [ ] 2.8 Ensure frame rendering no longer parses raw SVGA data or path strings after compile completes

## 3. Backend Abstraction

- [ ] 3.1 Define RenderBackend interface with type, capabilities, prepare, renderFrame/renderCommands, resize, clear, snapshot if supported, and destroy
- [ ] 3.2 Implement CanvasBackend by adapting current Canvas render behavior to consume compiled frame commands
- [ ] 3.3 Preserve Canvas behavior for bitmaps, replaceElements, dynamicElements, transforms, alpha, shapes, masks, clear, and optional frame cache behavior
- [ ] 3.4 Implement backend resolver for `canvas`, `webgl`, and `auto` modes
- [ ] 3.5 Enforce `webgl` mode failure when WebGL is unavailable or required capabilities are unsupported
- [ ] 3.6 Enforce `auto` mode whole-backend fallback to CanvasBackend when WebGL is unavailable or incapable
- [ ] 3.7 Ensure WebGLBackend never uses Canvas rasterization as an internal feature fallback

## 4. WebGL Backend Foundation

- [ ] 4.1 Add WebGLBackend context creation, capability declaration, shader/program setup, and lifecycle skeleton
- [ ] 4.2 Implement WebGL-native image sprite rendering using textures, quad geometry, transforms, alpha, and blending
- [ ] 4.3 Implement WebGL resource preparation for static image textures and replacement/dynamic texture sources
- [ ] 4.4 Add explicit unsupported handling for WebGL shape fill, stroke, holes, masks, and line dash features not yet implemented
- [ ] 4.5 Add WebGL resource cleanup and context lost/restoration handling based on the compiled CPU plan

## 5. Playback Integration

- [ ] 5.1 Refactor Animator/Player timeline responsibilities so playback consumes `CompiledAnimation`
- [ ] 5.2 Wire process events to include current frame and progress payloads
- [ ] 5.3 Keep loop, fillMode, playMode, startFrame, endFrame, loopStartFrame, intersection observer, and no-execution-delay behavior compatible with existing playback semantics
- [ ] 5.4 Ensure `clear`, `stop`, and `destroy` delegate to the selected backend resource lifecycle
- [ ] 5.5 Support recompiling or replacing the current animation by destroying the previous compiled/backend resources

## 6. Verification and Documentation

- [ ] 6.1 Add unit coverage for event subscription, state errors, parser worker delegation, and parse -> compile -> play flow
- [ ] 6.2 Add compiler tests for frame command ordering, capability scanning, hole/path metadata, and geometry ID reuse
- [ ] 6.3 Add backend resolver tests for canvas, webgl, and auto modes including whole-backend fallback
- [ ] 6.4 Add CanvasBackend regression coverage against existing Canvas rendering behaviors where practical
- [ ] 6.5 Add WebGLBackend smoke tests for context creation, image sprite rendering, unsupported capability errors, and cleanup
- [ ] 6.6 Update README examples to use `SVGAPlayer` with `parse`, `compile`, `play`, and `on`
- [ ] 6.7 Run typecheck, lint, and relevant build/test commands
