## Context

The current `SVGAPlayer` facade stores a single `videoEntity`, `compiledAnimation`, and backend at the instance level. Consumers must call `parse()`, then `compile()`, then `play()`, and the parsed `Video` returned from `parse()` is also the public hook for dynamic element mutation and DB caching.

That model makes frequent A/B animation switching awkward. Re-parsing the same URL wastes CPU, direct `Video` mutation leaks implementation details, and the public `compile()` method exposes render-plan lifecycle concerns that consumers do not need to understand. The render backend refactor already made `SVGAPlayer` the package facade, so this change continues that consolidation by moving keyed load/prepare/play state behind the facade.

## Goals / Non-Goals

**Goals:**

- Support multiple loaded SVGA animations inside one `SVGAPlayer` instance, keyed by string with `default` as the implicit key.
- Replace public `parse()` / `compile()` usage with `load()`, optional `prepare()`, and async `play()`.
- Keep parsed `Video`, internal compile state, and backend preparation details behind the facade.
- Add `replace()` so consumers can update replacement and dynamic textures by key without mutating `Video` directly.
- Add `delete()` for keyed slot cleanup and `cache()` for DB persistence of internally held parsed data.
- Create the backend during construction/private init based only on `renderMode` and browser WebGL support.
- Restrict `setConfig()` to playback-only options.
- Reuse a single parser per player instance while serializing URL loads and preventing stale async writes.
- Remove the unused legacy `Player` runtime and immediate Canvas render path.

**Non-Goals:**

- Expand WebGL feature support for shapes, masks, strokes, or line dash.
- Introduce new runtime dependencies.
- Re-expose low-level `Parser`, old `Player`, or compiler internals from the package entry.
- Block unsupported deep imports through a package `exports` map.
- Optimize `RenderCompiler` instance reuse; each real compile keeps using a fresh compiler instance.

## Decisions

### Decision: Keyed slots behind the facade

`SVGAPlayer` will hold a `Map<string, Slot>` where each slot owns parsed `Video`, optional `CompiledAnimation`, load/prepare promises, dirty state, and a version token. The player also tracks `activeKey` and `preparedKey`.

Rationale: slot-local state lets consumers load and switch between multiple SVGA files without re-parsing, while keeping raw parsed data private to the facade.

Alternative considered: leave caching to consumer-managed `Map<string, Video>`. That avoids facade state, but it keeps internal `Video` mutation and compile/preparation sequencing in consumer code.

### Decision: Public API becomes load / prepare / async play

`load(source, key = 'default')` stores a URL or already parsed `Video` into a keyed slot and returns no parsed data. `prepare(key = 'default')` is an optional prewarm API that internally compiles the slot if needed and prepares the global backend. `play(key = 'default')` is async and calls `prepare()` when the slot is not compiled, dirty, or currently prepared.

Rationale: consumers think in terms of loading and playing an animation, not parser and compiler stages. Making `play()` async is more honest because it can trigger compilation and backend resource preparation.

Alternative considered: keep public `compile(key)`. This exposes internal render lifecycle and leaves consumers responsible for knowing when preparation is required.

### Decision: Backend is global and selected during init

The player creates one backend during construction/private `init()`. `renderMode: 'canvas'` creates Canvas, `renderMode: 'webgl'` creates WebGL or throws if unavailable, and `renderMode: 'auto'` uses WebGL when the browser supports it, otherwise Canvas. SVGA content capabilities do not affect backend selection.

Rationale: backend type should be stable for the player instance and not be accidentally determined by whichever SVGA is parsed or prepared first.

Alternative considered: choose backend per compiled animation based on `requiredCapabilities`. This can make the first or currently prepared animation change the playback behavior of later keyed slots and weakens the global-backend design.

### Decision: prepare stops current playback before replacing backend resources

Because the backend is global and not keyed, preparing a different key replaces the backend's active resources. If `prepare(otherKey)` is called while another key is playing, the player stops the active playback first, then prepares the target key.

Rationale: continuing to animate key A while backend resources are replaced for key B can cause missing textures, wrong textures, or render errors.

Alternative considered: allow prepare to run while playback continues. That requires either backend resources keyed by animation or separate CPU compile and backend prepare phases; both are broader than the chosen global-backend model.

### Decision: replace updates keyed texture sources and refreshes resources

`replace(elementKey, texture, { key, mode })` writes to the target slot's `Video.replaceElements` for `mode: 'replace'` or `Video.dynamicElements` for `mode: 'dynamic'`. If the slot is compiled, it is marked dirty. If it is the prepared key, the player refreshes backend resources: Canvas clears frame cache; WebGL updates cached textures if any exist, otherwise updated references are enough for current temporary texture behavior.

Rationale: replacement/dynamic textures are resource-layer changes, not necessarily CPU compile changes. Refreshing resources is more precise than forcing parser or compiler work.

Alternative considered: require `compile(key)` after every replace. This is simpler but over-invalidates because compiled frame commands usually remain valid.

### Decision: setConfig only covers playback options

Constructor options include init/render/parser fields and initial play config. `setConfig()` accepts only playback options: loop, fill mode, play mode, start frame, end frame, loop start frame, and no-execution-delay behavior.

Rationale: fields such as container, render mode, parser options, frame cache, and intersection observer affect init, parsing, backend construction, or rendering. Allowing them in `setConfig()` creates unclear invalidation semantics for existing slots.

Alternative considered: keep the current broad config object. That preserves compatibility but makes keyed compiled/prepared state hard to reason about.

### Decision: Reuse one Parser and serialize URL loads

Each player lazily creates one `Parser` using construction-time parser options. URL loads run through an instance-level queue because current parser load behavior mutates worker message handlers. Each slot has a version token so stale load completions are discarded, and `delete(key)` increments the token so pending loads cannot recreate deleted slots.

Rationale: reusing one parser avoids repeated worker creation and serializing avoids worker callback races.

Alternative considered: create a parser per load. That is simpler but repeats worker setup and does not address stale writes when keys are loaded repeatedly.

### Decision: Keep RenderCompiler per actual compile

When a slot really needs compilation, the facade creates a fresh `RenderCompiler`. The compiler instance is not reused.

Rationale: current compiler instances hold mutable geometry indices, geometry maps, and capability state. A fresh instance guarantees clean compile state. The meaningful memory cost is cached `CompiledAnimation`, not the short-lived compiler object.

Alternative considered: reuse one compiler with reset. That requires changing compiler internals and adds state-leak risk for little expected gain.

### Decision: Remove old Player runtime

Delete `src/player/index.ts` and `src/player/render.ts` after verifying they have no remaining imports. Keep `src/player/animator.ts`, backend modules, and compiler modules.

Rationale: the old `Player` runtime is no longer exported or used by the facade, and its immediate Canvas rendering path duplicates responsibilities now owned by compiler/backend modules.

Alternative considered: leave dead code in place. That reduces immediate diff size but creates maintenance confusion around two playback implementations.

## Risks / Trade-offs

- [Risk] This is a breaking API change for consumers using `parse()`, `compile()`, `new SVGAPlayer(canvas)`, or direct `Video` mutation. -> Mitigation: document migration to `load()`, `replace()`, async `play()`, and options construction.
- [Risk] Async `play()` can surprise consumers expecting synchronous playback start. -> Mitigation: update README, tests, and examples to always `await player.play(key)`.
- [Risk] Preparing a key stops current playback, which may surprise consumers who use `prepare()` as a background prewarm. -> Mitigation: document that backend is global and `prepare()` is a foreground resource switch.
- [Risk] WebGL auto mode may throw for SVGA content that the current WebGL backend cannot render. -> Mitigation: keep the rule explicit: `auto` depends only on browser WebGL support; WebGL feature expansion is a later change.
- [Risk] Parser queue failures could block later loads if implemented incorrectly. -> Mitigation: ensure each queued task starts after swallowing the previous rejection and add tests for failure followed by success.
- [Risk] Stale async load results can overwrite newer keyed loads. -> Mitigation: use per-slot version tokens and tests for repeated load/delete races.
- [Risk] Removing old `Player` may reveal hidden deep imports. -> Mitigation: run repo search, typecheck, unit tests, build, and inspect generated declarations/bundles.

## Migration Plan

1. Introduce keyed slot state, narrowed config interfaces, constructor init, and global backend construction.
2. Add `load()`, `prepare()`, async `play(key)`, `replace()`, `delete()`, and `cache()` while preserving error event semantics.
3. Migrate README examples and manual tests from `parse()/compile()` and direct `Video` mutation to `load()/replace()/play()`.
4. Remove or deprecate old public facade methods according to the breaking API scope, and update package declarations.
5. Delete the unused legacy `Player` runtime and immediate Canvas render path.
6. Add unit coverage for keyed switching, parser queue/version behavior, replace refresh, delete semantics, DB cache, constructor/setConfig types, backend init selection, and public entry surface.
7. Run typecheck, unit tests, production build, and inspect generated bundles/declarations.

Rollback is possible by restoring the single-slot facade API and old runtime files, but consumer-facing documentation and generated declarations must be reverted together.

## Open Questions

- Should a later package `exports` map block deep imports of removed internal modules?
- Should a future change split CPU compile and backend prepare to support true background precompile without stopping current playback?
