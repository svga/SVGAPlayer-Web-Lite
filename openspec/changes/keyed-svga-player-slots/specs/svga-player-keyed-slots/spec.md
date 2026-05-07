## ADDED Requirements

### Requirement: Options-only construction initializes backend and parser configuration
The package SHALL require `SVGAPlayer` construction through an options object and SHALL initialize parser configuration, render configuration, and the single render backend during construction.

#### Scenario: Options constructor creates the player
- **WHEN** a consumer constructs `SVGAPlayer` with an options object containing a canvas container
- **THEN** the player is created with that canvas as the render target
- **AND** parser, render, and initial play configuration are read from the options object

#### Scenario: Canvas-only constructor is not supported
- **WHEN** a consumer attempts to construct `SVGAPlayer` with only an `HTMLCanvasElement`
- **THEN** the public TypeScript API does not accept that constructor shape

#### Scenario: Auto render mode uses browser WebGL support
- **WHEN** a consumer constructs `SVGAPlayer` with `renderMode: 'auto'`
- **THEN** the player chooses WebGL if the browser supports WebGL
- **AND** the player chooses Canvas if the browser does not support WebGL
- **AND** the selected backend does not depend on the content of any loaded SVGA

### Requirement: Playback configuration is separated from init configuration
`SVGAPlayer.setConfig()` SHALL accept only playback-related configuration and SHALL NOT be the API for changing parser, backend, render target, or render cache configuration.

#### Scenario: Consumer updates playback range
- **WHEN** a consumer calls `setConfig()` with loop, fill mode, play mode, start frame, end frame, loop start frame, or no-execution-delay options
- **THEN** subsequent playback uses the updated play configuration

#### Scenario: Init-only fields are excluded from setConfig types
- **WHEN** a TypeScript consumer calls `setConfig()`
- **THEN** parser options, render mode, container, frame cache, and intersection observer options are not accepted by the `setConfig()` option type

### Requirement: Keyed load stores parsed SVGA data internally
`SVGAPlayer` SHALL provide `load(source, key?)` to load a URL source or already parsed `Video` source into an internal keyed slot without returning the parsed `Video` for public mutation.

#### Scenario: Load URL into explicit key
- **WHEN** a consumer calls `await player.load(url, 'gift')`
- **THEN** the player parses the URL and stores the parsed data in the `gift` slot
- **AND** the promise resolves without returning the parsed `Video`

#### Scenario: Load parsed video into default key
- **WHEN** a consumer calls `await player.load(video)` with an already parsed `Video`
- **THEN** the player stores that video in the `default` slot without invoking the parser

#### Scenario: Reload invalidates compiled slot state
- **WHEN** a consumer loads a new source into a key that already has compiled state
- **THEN** the player invalidates that key's compiled and prepared state

### Requirement: URL loads are serialized through one parser
Each `SVGAPlayer` instance SHALL reuse one parser for URL loads, SHALL serialize URL loads through an instance queue, and SHALL prevent stale load completions from overwriting newer slot state.

#### Scenario: Consecutive URL loads are serialized
- **WHEN** a consumer starts two URL loads on the same `SVGAPlayer` instance before the first completes
- **THEN** the second URL parse starts only after the first queued URL parse settles

#### Scenario: Failed load does not block later load
- **WHEN** a queued URL load rejects
- **THEN** a later queued URL load can still run and settle independently

#### Scenario: Stale load result is discarded
- **WHEN** a key is loaded with URL A and then loaded with URL B before URL A finishes
- **THEN** URL A's eventual result does not overwrite the slot state created by URL B

#### Scenario: Deleted key is not recreated by pending load
- **WHEN** a key is deleted while a URL load for that key is still pending
- **THEN** the pending load result does not recreate the deleted slot

### Requirement: Prepare compiles and prepares a keyed slot
`SVGAPlayer` SHALL provide `prepare(key?)` as an async prewarm API that compiles the keyed slot when necessary and prepares the single backend for that key.

#### Scenario: Prepare compiled missing slot
- **WHEN** a consumer calls `await player.prepare('gift')` after loading `gift`
- **THEN** the player compiles the `gift` slot if it is not already compiled
- **AND** the player prepares the global backend for `gift`
- **AND** the player records `gift` as the prepared key

#### Scenario: Prepare different key stops current playback
- **WHEN** key `idle` is playing and a consumer calls `await player.prepare('gift')`
- **THEN** the player stops playback for `idle`
- **AND** prepares backend resources for `gift`

#### Scenario: Prepare unloaded key fails
- **WHEN** a consumer calls `prepare()` for a key that has not been loaded
- **THEN** the returned promise rejects
- **AND** the player emits an `error` event

### Requirement: Play is async and auto-prepares keyed animations
`SVGAPlayer.play(key?)` SHALL be async and SHALL automatically prepare the target key when it is not currently prepared, not compiled, or resource-dirty.

#### Scenario: Play loaded key without manual prepare
- **WHEN** a consumer calls `await player.play('gift')` after loading `gift`
- **THEN** the player prepares `gift` if needed
- **AND** starts playback for `gift`

#### Scenario: Switch playback key
- **WHEN** key `idle` is playing and a consumer calls `await player.play('gift')`
- **THEN** the player stops `idle`
- **AND** prepares `gift` if needed
- **AND** starts playback for `gift`

#### Scenario: Play unloaded key fails
- **WHEN** a consumer calls `play()` for a key that has not been loaded
- **THEN** the returned promise rejects
- **AND** the player emits an `error` event

### Requirement: Replace updates keyed texture sources
`SVGAPlayer` SHALL provide `replace(elementKey, texture, options?)` to update replacement or dynamic texture sources for a loaded key without exposing parsed `Video` mutation.

#### Scenario: Replace original texture
- **WHEN** a consumer calls `replace('avatar', image, { key: 'gift', mode: 'replace' })`
- **THEN** the player records `image` as the replacement texture for element `avatar` in the `gift` slot

#### Scenario: Add dynamic texture
- **WHEN** a consumer calls `replace('label', canvas, { key: 'gift', mode: 'dynamic' })`
- **THEN** the player records `canvas` as the dynamic texture for element `label` in the `gift` slot

#### Scenario: Replace uses defaults
- **WHEN** a consumer calls `replace(elementKey, texture)` without options
- **THEN** the player applies the replacement to the `default` slot with `mode: 'replace'`

#### Scenario: Replace unloaded key fails
- **WHEN** a consumer calls `replace()` for a key that has not been loaded
- **THEN** the player throws or rejects with a clear error
- **AND** emits an `error` event

#### Scenario: Replace prepared key refreshes resources
- **WHEN** a consumer replaces a texture on the currently prepared key
- **THEN** the player refreshes backend resources for that key
- **AND** Canvas frame cache is cleared when frame caching is enabled
- **AND** playback can continue with the new texture source

### Requirement: Delete removes keyed slot state
`SVGAPlayer` SHALL provide `delete(key?)` to remove a keyed slot and clean up active or prepared state associated with that key.

#### Scenario: Delete active key stops playback
- **WHEN** key `gift` is playing and a consumer calls `delete('gift')`
- **THEN** playback stops
- **AND** the `gift` slot is removed

#### Scenario: Delete prepared key clears prepared state
- **WHEN** key `gift` is the prepared key and a consumer calls `delete('gift')`
- **THEN** the player clears prepared state for `gift`
- **AND** clears the current backend surface

#### Scenario: Delete unknown key is no-op
- **WHEN** a consumer calls `delete('missing')`
- **THEN** the call completes without throwing

### Requirement: Cache persists loaded slot data through DB
`SVGAPlayer` SHALL provide `cache(db, { key, id })` to persist the parsed data held by a loaded slot through the public `DB` extension.

#### Scenario: Cache loaded key
- **WHEN** a consumer calls `await player.cache(db, { key: 'gift', id: 'gift.svga' })` after loading `gift`
- **THEN** the player writes the parsed `gift` data to `db` using `id`

#### Scenario: Cache default key
- **WHEN** a consumer calls `await player.cache(db, { id: 'default.svga' })`
- **THEN** the player writes the parsed `default` slot data to `db`

#### Scenario: Cache unloaded key fails
- **WHEN** a consumer calls `cache()` for a key that has not been loaded
- **THEN** the returned promise rejects
- **AND** the player emits an `error` event

### Requirement: Legacy Player runtime is removed
The old `Player` runtime and its immediate Canvas render helper SHALL be removed after the facade owns keyed loading and playback.

#### Scenario: Legacy Player source is not part of implementation
- **WHEN** the package source is inspected after this change
- **THEN** `src/player/index.ts` and `src/player/render.ts` are absent
- **AND** animator, backend, and compiler internals remain available for `SVGAPlayer`
