## Why

The render backend refactor has already introduced `SVGAPlayer` as the package facade, but the package entry still exposes transitional low-level `Parser` and `Player` classes plus compiler internals. Keeping those exports makes the public API ambiguous and preserves the old parse/load/mount wiring and render compilation details that the facade was created to hide.

## What Changes

- **BREAKING**: Remove `Parser`, `Player`, and compiler internals from the package main entry exports.
- Keep `Parser` available internally so `SVGAPlayer.parse()` continues to preserve the existing parser worker behavior.
- Keep `RenderCompiler` and compiled render data types available internally so `SVGAPlayer.compile()` and render backends continue to work.
- Keep `SVGAPlayer` as the primary public class and default export.
- Keep `DB` as the public extension export for IndexedDB-backed caching.
- Update documentation and browser/manual test examples so consumers use `SVGAPlayer.parse()`, `SVGAPlayer.compile()`, and playback methods instead of manually wiring `Parser.load()` to `Player.mount()`.
- Add verification that the public package entry no longer exposes the removed low-level classes or compiler internals.

## Capabilities

### New Capabilities

- `public-api-surface`: Public package entry exports and documented consumer import contract.

### Modified Capabilities

- None.

## Impact

- Public API exported from `src/index.ts`.
- README usage examples for parser options, dynamic elements, DB caching, Webpack assets, and Vite assets.
- Browser/manual test entry `src/test.ts`.
- Generated `dist` bundles and declaration files after build.
- Consumers importing `Parser`, `Player`, `CompiledAnimation`, `FrameRenderCommand`, `CompiledResources`, `RenderCapabilities`, or `RenderMode` from `svga` must migrate to `SVGAPlayer` usage or stop depending on internal compiler details; this is an intentional breaking change.
