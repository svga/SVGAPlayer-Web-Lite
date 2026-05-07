## ADDED Requirements

### Requirement: Package entry exposes facade API
The package main entry SHALL expose `SVGAPlayer` as the primary public player class and SHALL keep `DB` available as a public cache extension.

#### Scenario: Consumer imports supported public API
- **WHEN** a consumer imports from the package main entry
- **THEN** `SVGAPlayer`, the default `SVGAPlayer` export, and `DB` SHALL be available

### Requirement: Package entry removes legacy runtime and compiler internals
The package main entry SHALL NOT expose the legacy low-level `Parser` or `Player` runtime classes and SHALL NOT expose compiler internals.

#### Scenario: Consumer imports removed runtime classes or compiler internals
- **WHEN** a consumer attempts to import `Parser`, `Player`, `CompiledAnimation`, `FrameRenderCommand`, `CompiledResources`, `RenderCapabilities`, or `RenderMode` from the package main entry
- **THEN** the package SHALL NOT provide those named exports

### Requirement: Internal compiler remains available to facade
The render compiler implementation SHALL remain available internally for `SVGAPlayer.compile()` and backend preparation.

#### Scenario: Consumer compiles through the facade
- **WHEN** a consumer calls `compile()` on a parsed `SVGAPlayer` instance
- **THEN** compilation SHALL use the internal render compiler without requiring the consumer to import compiler APIs from the package main entry

### Requirement: Facade preserves parser-backed loading
`SVGAPlayer` SHALL remain responsible for parsing URL sources through its `parse()` method, including parser worker behavior controlled by facade parser options.

#### Scenario: Consumer parses a URL through the facade
- **WHEN** a consumer constructs `SVGAPlayer` with parser options and calls `parse(url)`
- **THEN** parsing SHALL run through the existing parser-backed path without requiring the consumer to instantiate `Parser`

### Requirement: Documentation uses supported public API
Consumer-facing documentation SHALL demonstrate `SVGAPlayer` for parsing, compiling, playback, parser options, dynamic element setup, cache-backed loading, and bundled SVGA asset loading.

#### Scenario: Consumer follows README examples
- **WHEN** a consumer follows README examples for common usage, DB caching, Webpack assets, or Vite assets
- **THEN** the examples SHALL use supported package main entry exports and SHALL NOT instantiate `Parser` or `Player`
