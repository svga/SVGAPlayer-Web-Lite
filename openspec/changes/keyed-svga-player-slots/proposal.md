## Why

`SVGAPlayer` currently models one parsed and compiled animation per instance, so switching between two SVGA files either repeats parsing/compilation work or forces consumers to manage parsed `Video` objects outside the facade. The facade can better match consumer intent by loading keyed animations, preparing them internally, and letting `play(key)` handle the private compile/backend lifecycle.

## What Changes

- **BREAKING**: Replace the public `parse() -> compile() -> play()` flow with `load(key?)`, optional `prepare(key?)`, and async `play(key?)`.
- **BREAKING**: Remove `new SVGAPlayer(canvas)` constructor support and require an options object.
- Add keyed slots so one `SVGAPlayer` instance can manage multiple loaded/compiled SVGA animations by key, with `default` as the implicit key.
- Keep parsed `Video` data internal; `load()` stores it in a slot and does not return it for direct mutation.
- Add `replace(elementKey, texture, { key, mode })` to replace original textures or attach dynamic textures without exposing `Video.replaceElements` / `Video.dynamicElements`.
- Add `delete(key?)` to remove a slot, stop playback if that slot is active, clear prepared state if needed, and no-op for unknown keys.
- Add `cache(db, { key, id })` so the facade can persist a loaded slot's parsed data through `DB`.
- Move backend selection to construction/private init; `auto` depends only on browser WebGL support, not SVGA content requirements.
- Restrict `setConfig()` to playback-only options; parser/backend/render options belong to construction/init.
- Reuse one parser per `SVGAPlayer` instance, serialize URL loads through an instance queue, and use slot versions to avoid stale async writes.
- Keep `RenderCompiler` as an internal short-lived per-compile instance so compile state remains isolated.
- Delete the unused legacy `Player` runtime and its immediate Canvas render path while retaining animator, compiler, and backend internals.
- Update README, manual tests, unit tests, and generated outputs to document and verify the new facade flow.

## Capabilities

### New Capabilities

- `svga-player-keyed-slots`: Keyed `SVGAPlayer` facade contract for loading, preparing, playing, replacing textures, deleting slots, caching parsed data, and construction/config boundaries.

### Modified Capabilities

- None.

## Impact

- Public `SVGAPlayer` API, constructor types, event/error behavior, and README examples.
- `src/svga-player.ts` slot, parser queue, backend lifecycle, resource refresh, and playback flow.
- `src/player/backend/*` resource refresh/frame-cache APIs needed by `replace()`.
- `src/db.ts` usage via new facade `cache()` helper.
- `src/player/index.ts` and `src/player/render.ts` removal.
- Unit tests, manual/browser test entry `src/test.ts`, and generated `dist` bundles/declarations after build.
- Consumers using `parse()`, `compile()`, direct returned `Video` mutation, or `new SVGAPlayer(canvas)` must migrate to `load()`, `replace()`, async `play()`, and options construction.
