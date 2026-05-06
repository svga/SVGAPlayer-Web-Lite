## Context

The current public surface exposes `Parser`, `Player`, and `DB`, and typical usage wires `Parser.load()` into `Player.mount()` manually. Internally, `Player` owns playback state, Canvas sizing, clearing, image preparation, frame caching, and calls `render.ts`, while `render.ts` directly targets `CanvasRenderingContext2D`.

This is enough for Canvas 2D, but it makes WebGL difficult to add cleanly. Canvas 2D hides path filling, clipping, state stack, image drawing, and frame snapshots behind immediate-mode APIs. WebGL requires explicit resources, shaders, geometry, stencil/mask handling, and capability checks. The design in `doc/render-backend-exploration.md` establishes that GPU backends must not rely on Canvas rasterization as feature fallback.

Parser worker behavior is a hard constraint: parsing must keep the existing worker path for download, inflate, protobuf decode, and image extraction. Compilation is a new stage after parsing, not a replacement for parser worker execution.

## Goals / Non-Goals

**Goals:**

- Expose a single public `SVGAPlayer` class that users instantiate directly.
- Provide explicit `parse()`, `compile()`, playback methods, and `on()` lifecycle events.
- Preserve parser worker behavior behind `SVGAPlayer.parse()`.
- Add a `RenderCompiler` stage that converts parsed `VideoEntity` data into a compiled animation plan.
- Move the old `Player.mount()` initialization work into compilation/backend preparation.
- Compile complete per-frame render commands before playback so frame rendering no longer parses SVGA/path data.
- Support `canvas`, `webgl`, and `auto` render modes through backend capability matching.
- Keep Canvas fallback at backend selection boundaries only.
- Keep the architecture open for WebGPU and optional CPU compile work in a future worker.

**Non-Goals:**

- Implement WebGPU in this change.
- Use PixiJS as a runtime dependency.
- Use Canvas rasterization inside WebGL as an internal feature fallback.
- Guarantee full WebGL-native support for all complex path, stroke, hole, and mask cases in the first implementation pass.
- Remove the parser worker path.

## Decisions

### Decision: Export one `SVGAPlayer` facade

Expose one public class and keep `Parser`, `RenderCompiler`, `RenderBackend`, and `Animator` internal. The facade owns the user-facing state machine:

```text
idle -> parsed -> compiled -> playing -> paused/stopped
```

Rationale: users should not need to wire parsing, compiling, backend preparation, and playback together manually. This also creates a stable API while internal rendering architecture evolves.

Alternative considered: keep exporting `Parser` and `Player` as the primary API. This preserves compatibility but continues to expose the old coupling and makes compile/backend selection feel bolted on.

### Decision: Preserve parser worker and add compile after parse

`SVGAPlayer.parse()` delegates to the existing parser worker when enabled. `SVGAPlayer.compile()` accepts the parsed `VideoEntity` and performs resource normalization, feature scanning, path parsing, command compilation, backend resolution, and backend preparation.

Rationale: parser work and render compilation have different responsibilities and different worker constraints. Parser worker handles file decoding; compile handles rendering readiness.

Alternative considered: move render instructions into parser output. This would couple parser output to renderer behavior, complicate DB/cache semantics, and make backend changes require parser changes.

### Decision: Compile complete render commands before playback

Compile produces `CompiledAnimation`, including per-frame commands, resource metadata, capability requirements, backend selection results, and reusable geometry metadata/cache where applicable. During playback, rendering reads `compiled.frames[frameIndex]` and does not parse raw path strings or inspect raw SVGA protobuf data.

Rationale: backend fallback and unsupported-feature errors should be discovered before playback starts. WebGL also benefits from stable command and geometry inputs.

Alternative considered: lazily parse paths during render. This minimizes compile latency but risks mid-playback failure and frame hitches.

### Decision: Use backend capabilities for `auto` fallback

`renderMode = auto` tries WebGL first, scans required animation capabilities, and selects WebGL only if the backend satisfies the compiled requirements. If not, it selects CanvasBackend for the entire animation. `renderMode = webgl` throws on unavailable or unsupported WebGL. `renderMode = canvas` always uses CanvasBackend.

Rationale: fallback must be predictable and whole-backend, not a hidden mix of WebGL plus Canvas rasterized textures.

Alternative considered: use Canvas to rasterize unsupported WebGL shapes/masks into textures. This improves short-term compatibility but violates the GPU-native backend boundary and creates a poor foundation for WebGPU.

### Decision: Separate CPU compile from GPU prepare

CPU compile includes path parsing, curve flattening, contour splitting, hole detection, required capability scanning, command compilation, and reusable geometry cache creation. GPU prepare includes WebGL context resource work: textures, buffers, shaders, framebuffers, and stencil resources.

Rationale: CPU compile can later move to an optional compile worker and return transferable typed arrays. GPU prepare must run on the thread that owns the WebGL context.

Alternative considered: do all prepare work synchronously inside Player. This keeps fewer modules but preserves the current coupling and makes worker migration harder.

### Decision: Cache unique geometry, not per-frame transformed vertices

Compiled data stores reusable local geometry by `geometryId`. Per-frame commands reference geometry IDs plus transform, alpha, style, and mask scope metadata.

Rationale: this keeps memory controlled. The heavy data is proportional to unique shapes, not frames multiplied by sprites and shapes.

Alternative considered: store fully transformed vertices for every frame. This speeds render submission but can multiply memory usage by frame count.

## Risks / Trade-offs

- [Risk] Breaking API churn for users currently importing `Parser` and `Player` separately. → Mitigation: document the new `SVGAPlayer` API clearly and consider transitional compatibility exports if implementation scope allows.
- [Risk] `compile()` can introduce mount-time CPU work and visible delay on complex animations. → Mitigation: use geometry reuse, avoid per-frame geometry copies, and keep CPU compile worker migration possible.
- [Risk] WebGL feature coverage may be incomplete for holes, complex self-intersecting paths, masks, strokes, and line dashes. → Mitigation: make capabilities explicit and use `auto` whole-backend fallback or `webgl` unsupported errors.
- [Risk] Dynamic elements based on DOM canvas/image resources are harder to compile or move to workers. → Mitigation: keep dynamic texture updates in backend/resource preparation on the renderer-owning thread.
- [Risk] Context lost handling can invalidate prepared GPU resources. → Mitigation: keep CPU compiled plan independent from GPU resources so buffers/textures can be rebuilt.
- [Risk] Introducing render commands can duplicate some data already present in `VideoEntity`. → Mitigation: use references, IDs, and reusable caches instead of copying full frame geometry.
