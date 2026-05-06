## ADDED Requirements

### Requirement: Render modes
The rendering system SHALL support `canvas`, `webgl`, and `auto` render modes.

#### Scenario: Canvas mode
- **WHEN** `renderMode` is `canvas`
- **THEN** the compiler SHALL select CanvasBackend and SHALL NOT attempt WebGL rendering

#### Scenario: WebGL mode
- **WHEN** `renderMode` is `webgl` and WebGL is unavailable or lacks required capabilities
- **THEN** compilation SHALL fail with a clear unsupported WebGL error

#### Scenario: Auto mode
- **WHEN** `renderMode` is `auto`
- **THEN** the compiler SHALL prefer WebGL when available and capable, otherwise select CanvasBackend for the entire animation

### Requirement: Whole-backend fallback
The renderer SHALL fallback from WebGL to Canvas only at backend selection boundaries.

#### Scenario: WebGL unavailable in auto mode
- **WHEN** WebGL context creation fails in `auto` mode
- **THEN** CanvasBackend SHALL be selected before playback begins

#### Scenario: WebGL capability missing in auto mode
- **WHEN** WebGL is available but cannot satisfy the compiled animation's required capabilities
- **THEN** CanvasBackend SHALL be selected for the entire animation before playback begins

#### Scenario: No Canvas raster fallback inside WebGL
- **WHEN** WebGLBackend renders a compiled animation
- **THEN** it SHALL NOT use Canvas rasterization to draw unsupported shapes, masks, or whole frames as WebGL textures

### Requirement: Backend capability declaration
Each render backend SHALL declare the render capabilities it supports.

#### Scenario: Capability comparison
- **WHEN** backend resolution runs
- **THEN** the resolver SHALL compare the compiled animation's required capabilities against the candidate backend's declared capabilities

#### Scenario: Capability categories
- **WHEN** a backend declares capabilities
- **THEN** the declaration SHALL include image rendering, dynamic texture handling, shape fill, hole-capable fill, shape stroke, line dash, clip or mask support, and snapshot support where applicable

### Requirement: WebGL native rendering path
WebGLBackend SHALL implement supported rendering features using WebGL-native resources and draw paths.

#### Scenario: Image sprite rendering
- **WHEN** WebGLBackend renders image sprites
- **THEN** it SHALL use WebGL textures, geometry, transforms, alpha, and blending rather than Canvas `drawImage`

#### Scenario: Shape fill rendering
- **WHEN** WebGLBackend supports a shape fill command
- **THEN** it SHALL render the fill from compiled geometry or GPU-compatible primitives rather than Canvas-filled bitmap textures

#### Scenario: Mask rendering
- **WHEN** WebGLBackend supports a mask or clip command
- **THEN** it SHALL use a WebGL-native mask or stencil strategy rather than Canvas `clip()` rasterization

### Requirement: Canvas backend compatibility
CanvasBackend SHALL preserve existing Canvas 2D playback behavior for supported SVGA animations.

#### Scenario: Canvas backend render
- **WHEN** CanvasBackend is selected
- **THEN** it SHALL render compiled commands through Canvas 2D APIs while preserving existing image, replacement element, dynamic element, shape, transform, alpha, and mask behavior

#### Scenario: Auto fallback preserves playback
- **WHEN** `auto` mode falls back to CanvasBackend because WebGL cannot satisfy required capabilities
- **THEN** playback SHALL still render using CanvasBackend instead of failing solely due to WebGL limitations

### Requirement: Backend resource lifecycle
Render backends SHALL manage their resources according to the selected rendering technology.

#### Scenario: Resize
- **WHEN** a compiled animation establishes its SVGA size
- **THEN** the selected backend SHALL resize or configure its surface/resources to match that size

#### Scenario: Clear
- **WHEN** the player clears or stops playback
- **THEN** the selected backend SHALL clear the active render surface according to backend semantics

#### Scenario: Destroy
- **WHEN** the player is destroyed or a new compiled animation replaces the current one
- **THEN** the selected backend SHALL release textures, buffers, cached frame resources, event hooks, and other owned resources

#### Scenario: WebGL context loss
- **WHEN** WebGL context loss occurs
- **THEN** WebGLBackend SHALL either rebuild GPU resources from the compiled CPU plan after restoration or fail in a way that allows `auto` mode to select CanvasBackend as a whole-backend fallback
