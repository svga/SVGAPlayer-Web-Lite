## Context

The completed render backend refactor introduced `SVGAPlayer` as the public facade for parsing, compiling, playback, events, and cleanup. The package entry still has transitional exports for `Parser` and `Player`, which keeps the old public workflow visible even though parsing and playback now belong behind the facade.

The current entry also re-exports selected compiler-related types from `./player/compiler`. These names expose internal render compilation concepts from the package main entry even though consumers should interact with the facade rather than compiler commands, resources, capabilities, or backend selection internals.

## Goals / Non-Goals

**Goals:**

- Remove `Parser`, `Player`, and compiler internals from the package main entry.
- Preserve `Parser` internally for `SVGAPlayer.parse()` and parser worker behavior.
- Preserve `RenderCompiler` and compiled render data internally for `SVGAPlayer.compile()` and backend execution.
- Preserve the documented `SVGAPlayer` parse -> compile -> play flow.
- Keep `DB` available as a public cache extension.
- Update examples and manual/browser test entry points so the public API surface is unambiguous.
- Verify type declarations and built bundles no longer expose the removed low-level runtime classes or compiler internals from the package main entry.

**Non-Goals:**

- Delete `src/parser.ts` or remove parser worker support.
- Delete the old `src/player` implementation in this change.
- Delete `src/player/compiler` or remove render compilation.
- Redesign `SVGAPlayer.compile()` or the compiled animation data contract.
- Guarantee that generated facade declaration files contain no references to internal compiler module paths.
- Introduce an `exports` map or block deep imports in this change.

## Decisions

### Decision: Remove low-level runtime and compiler entry exports

Remove `export { Parser } from './parser'`, `export { Player } from './player'`, and the `./player/compiler` re-export block from `src/index.ts`.

Rationale: these names are not the facade. `Parser` and `Player` expose the old consumer workflow, while compiler types expose internal render plan details. Removing all of them from the package main entry completes the intended breaking API cleanup while keeping the implementation available internally.

Alternative considered: delete the parser, old player, and compiler modules entirely. This is broader than the public API cleanup because `Parser` remains required by `SVGAPlayer.parse()`, compiler modules remain required by `SVGAPlayer.compile()` and render backends, and old `Player` removal should be assessed separately for internal references and regression coverage.

### Decision: Do not redesign facade declaration internals in this change

Do not redesign `SVGAPlayerConfigOptions.renderMode` or `SVGAPlayer.compile()` in this change solely to hide declaration-file references to compiler-owned types.

Rationale: removing the main-entry re-export is the public package API cleanup. `SVGAPlayer` can continue to use internal compiler types in its source and generated declarations while the package main entry stops offering those names as supported top-level imports.

Alternative considered: introduce facade-owned public types such as `SVGARenderMode` and `SVGACompiledAnimation`, or make `compile()` return an opaque public shape. That would further clean up TypeScript declaration paths, but it changes the facade type contract and should be handled as a separate type-surface design if needed.

### Decision: Migrate documentation and manual tests to facade usage

Update README examples and `src/test.ts` to use `SVGAPlayer` directly. Parser options should move under `parserOptions`, URL loading should use `player.parse(url)`, and already-parsed video data should continue to flow through `player.parse(video)`.

Rationale: a breaking API cleanup is confusing if published examples still import or instantiate removed classes.

Alternative considered: keep README legacy examples with migration notes. This would preserve historical context but weaken the goal of making `SVGAPlayer` the single documented entry.

### Decision: Verify the package entry explicitly

Add or update tests/checks so the public entry no longer exposes `Parser`, `Player`, `CompiledAnimation`, `FrameRenderCommand`, `CompiledResources`, `RenderCapabilities`, or `RenderMode`, while `SVGAPlayer` and `DB` remain available.

Rationale: type checking can catch local imports, but an explicit public surface check prevents accidental reintroduction of transitional exports.

Alternative considered: rely only on build output inspection. Manual inspection is easy to miss during future changes.

## Risks / Trade-offs

- [Risk] Existing consumers importing `Parser`, `Player`, or compiler types from `svga` will break. -> Mitigation: mark the change as breaking and update README examples to show the `SVGAPlayer` migration path.
- [Risk] Generated facade declarations may still reference internal compiler module paths even though the main entry no longer re-exports compiler names. -> Mitigation: treat this as acceptable for this change and reserve facade-owned public type redesign for a separate change.
- [Risk] `src/test.ts` may still represent old manual scenarios after migration. -> Mitigation: preserve the same scenario intent while moving setup to `SVGAPlayer.parse()` and `compile()`.
- [Risk] Generated `dist` declarations can drift from source if build is not run. -> Mitigation: run build and inspect generated entry declarations/bundles as part of implementation verification.

## Migration Plan

1. Remove `Parser`, `Player`, and compiler re-exports from the package main entry.
2. Replace README examples that use `Parser` or `Player` with `SVGAPlayer` equivalents.
3. Update `src/test.ts` to import and exercise `SVGAPlayer` from `./index`.
4. Add or update public surface verification.
5. Run typecheck, unit tests, and build; verify generated declarations and bundles match the new public entry.

Rollback is straightforward: reintroduce the removed main-entry exports and restore the legacy examples if the breaking cleanup is deferred.

## Open Questions

- Should a later change rename or narrow compiler-facing types into facade-owned public types so generated declarations no longer point at internal compiler modules?
- Should a later change add a package `exports` map to prevent unsupported deep imports?
