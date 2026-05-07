## 1. Public Entry Cleanup

- [x] 1.1 Remove `Parser`, `Player`, and `./player/compiler` named re-exports from `src/index.ts`.
- [x] 1.2 Keep only `SVGAPlayer`, the default export, facade-owned event/config types, and `DB` exported from the package main entry.
- [x] 1.3 Add or update a public surface check that confirms `Parser`, `Player`, `CompiledAnimation`, `FrameRenderCommand`, `CompiledResources`, `RenderCapabilities`, and `RenderMode` are no longer exposed from the package main entry.

## 2. Consumer Documentation Migration

- [x] 2.1 Update parser options documentation to show `SVGAPlayer` `parserOptions` usage.
- [x] 2.2 Update dynamic element examples to parse through `SVGAPlayer.parse()` instead of `Parser.load()`.
- [x] 2.3 Update DB caching examples so cache misses use a facade configured with `isDisableImageBitmapShim`.
- [x] 2.4 Update Webpack and Vite SVGA asset examples to use `SVGAPlayer.parse(assetUrl)`.

## 3. Manual Test Migration

- [x] 3.1 Update `src/test.ts` imports to use supported package main entry exports.
- [x] 3.2 Replace `Parser.load()` plus `Player.mount()` scenarios with `SVGAPlayer.parse()`, `compile()`, and playback methods.
- [x] 3.3 Preserve existing manual scenario coverage for events, dynamic elements, DB caching, playback config, reverse playback, error handling, and config reset where practical.

## 4. Verification

- [x] 4.1 Run TypeScript type checking.
- [x] 4.2 Run unit tests.
- [x] 4.3 Run the production build.
- [x] 4.4 Inspect generated declarations and bundles to verify the package main entry no longer exposes `Parser`, `Player`, or compiler internals.
- [x] 4.5 Record facade-owned public type redesign as a follow-up risk if generated facade declarations still reference internal compiler module paths.
