## 1. Facade Types And Init Boundaries

- [x] 1.1 Replace the current broad `SVGAPlayerConfigOptions` surface with init options and playback config options.
- [x] 1.2 Update `SVGAPlayer` construction to accept only an options object and initialize parser/render/backend state through a private init path.
- [x] 1.3 Move backend selection to construction so `canvas`, `webgl`, and `auto` depend only on render mode and browser WebGL support.
- [x] 1.4 Restrict `setConfig()` to playback-only fields and preserve validation for invalid frame ranges.

## 2. Keyed Slot State And Parser Queue

- [x] 2.1 Introduce keyed slot state with `default` key handling, active key, prepared key, dirty state, and per-slot version tokens.
- [x] 2.2 Implement one shared lazy `Parser` per `SVGAPlayer` instance using construction-time parser options.
- [x] 2.3 Serialize URL `load()` calls through an instance promise queue without letting one rejection block later loads.
- [x] 2.4 Use slot versions so repeated loads and deletes cannot be overwritten by stale async parse completions.
- [x] 2.5 Ensure `destroy()` terminates the shared parser and prevents pending queue results from restoring destroyed state.

## 3. Public Load Prepare Play API

- [x] 3.1 Add `load(source, key?)` for URL and parsed `Video` sources, storing parsed data internally without returning `Video`.
- [x] 3.2 Move compile work behind an internal helper that creates a fresh `RenderCompiler` for each actual compile.
- [x] 3.3 Add `prepare(key?)` to compile dirty or missing compiled state, prepare the single backend, update `preparedKey`, and stop current playback when preparing another key.
- [x] 3.4 Change `play(key?)` to async and make it auto-prepare when the key is not compiled, dirty, or not currently prepared.
- [x] 3.5 Preserve pause, resume, stop, clear, destroy, progress, and event behavior against keyed active state.
- [x] 3.6 Preserve parse/prepare/play error event semantics while rejecting failed async calls.

## 4. Replacement, Cache, And Delete APIs

- [x] 4.1 Add `replace(elementKey, texture, options?)` with default key `default` and default mode `replace`.
- [x] 4.2 Apply `replace` mode to `replaceElements` and `dynamic` mode to `dynamicElements` for the selected keyed slot.
- [x] 4.3 Add backend resource refresh behavior for replacement updates, including Canvas frame-cache clearing.
- [x] 4.4 Add `delete(key?)` to remove keyed slot state, stop active playback for that key, clear prepared state for that key, and no-op for unknown keys.
- [x] 4.5 Add `cache(db, { key, id })` to persist internally held parsed data through the public `DB` extension.

## 5. Legacy Runtime Removal

- [x] 5.1 Remove unused old `src/player/index.ts` runtime code.
- [x] 5.2 Remove unused old `src/player/render.ts` immediate Canvas render helper.
- [x] 5.3 Verify remaining `src/player` internals are limited to animator, backend, and compiler modules required by `SVGAPlayer`.

## 6. Documentation And Manual Examples

- [x] 6.1 Update README common usage from `parse()`/`compile()` to `load()` and async `play()`.
- [x] 6.2 Update parser options documentation to show constructor-only init options.
- [x] 6.3 Update dynamic/replacement element examples to use `replace()`.
- [x] 6.4 Update DB cache examples to use `load()` and `cache()`.
- [x] 6.5 Update Webpack and Vite SVGA asset examples to use `load(assetUrl)` and async `play()`.
- [x] 6.6 Update `src/test.ts` manual scenarios for keyed load/play, replace, DB cache, playback config, reverse playback, errors, and delete behavior.

## 7. Tests And Verification

- [x] 7.1 Add or update unit tests for options-only construction, backend init selection, and narrowed `setConfig()` types.
- [x] 7.2 Add or update unit tests for keyed `load()`, async `play()`, optional `prepare()`, and key switching.
- [x] 7.3 Add or update unit tests for parser queue serialization, failure recovery, stale load discard, and delete-during-load behavior.
- [x] 7.4 Add or update unit tests for `replace()` modes, dirty handling, Canvas frame-cache clearing, and continued playback after replacement.
- [x] 7.5 Add or update unit tests for `delete()` no-op behavior, active slot cleanup, prepared slot cleanup, and `cache()` behavior.
- [x] 7.6 Update public entry surface tests to confirm legacy `Player` remains unavailable and facade-owned APIs are exported.
- [x] 7.7 Run TypeScript type checking.
- [x] 7.8 Run unit tests.
- [x] 7.9 Run the production build.
- [x] 7.10 Inspect generated declarations and bundles for the new facade API and absence of the old `Player` runtime.
