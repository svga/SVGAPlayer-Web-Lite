## ADDED Requirements

### Requirement: Structured render capability configuration
The system SHALL represent render capabilities as a structured configuration that includes static textures, dynamic textures, shape paint capabilities, stroke style capabilities, masks, and snapshots.

#### Scenario: Capability tree replaces coarse shape fields
- **WHEN** compiler or backend code reads render capability support
- **THEN** it SHALL use structured paths such as `texture.static`, `texture.dynamic`, `shape.rect.fill`, `shape.path.stroke`, `shape.strokeStyle.lineDash`, `masks`, and `snapshot`

#### Scenario: Coarse capability fields are not used
- **WHEN** capability matching or unsupported rendering checks are performed
- **THEN** the system SHALL NOT use coarse fields such as `imageRendering`, `dynamicTextures`, `shapeFill`, `shapeFillHoles`, `shapeStroke`, `lineDash`, or `unsupportedPathCommands`

### Requirement: Required capabilities are scanned from recognized render semantics
The compiler SHALL derive `CompiledAnimation.requiredCapabilities` from recognized SVGA texture, shape, stroke style, mask, and snapshot semantics.

#### Scenario: Texture capability requirements are detected
- **WHEN** a compiled frame uses a built-in image, static replacement element, or dynamic replacement element
- **THEN** the compiler SHALL mark the corresponding `texture.static` or `texture.dynamic` required capability

#### Scenario: Shape paint capability requirements are detected
- **WHEN** a compiled shape uses rect, rounded rect, ellipse, or generic path fill or stroke semantics
- **THEN** the compiler SHALL mark the matching `shape.<kind>.fill` or `shape.<kind>.stroke` required capability

#### Scenario: Stroke style capability requirements are detected
- **WHEN** a compiled stroked shape uses stroke width, line cap, line join, miter limit, or line dash data
- **THEN** the compiler SHALL mark the matching `shape.strokeStyle.<style>` required capability

#### Scenario: Mask capability requirements are detected
- **WHEN** a compiled command contains a mask path
- **THEN** the compiler SHALL mark `masks` as a required capability

#### Scenario: Unsupported path commands are diagnostics
- **WHEN** path parsing encounters a command that cannot be mapped to known SVGA render semantics
- **THEN** the compiler SHALL report the issue through compile diagnostics rather than through `RenderCapabilities`

### Requirement: Backends declare only implemented capabilities
Each render backend SHALL declare the structured render capabilities it currently implements.

#### Scenario: Canvas declares complete current rendering support
- **WHEN** CanvasBackend exposes its capabilities
- **THEN** it SHALL declare support for static textures, dynamic textures, supported shape fills and strokes, stroke style fields, masks, and snapshots according to current Canvas behavior

#### Scenario: WebGL declares current texture-only support
- **WHEN** WebGLBackend exposes its capabilities
- **THEN** it SHALL declare support for static and dynamic textures and SHALL declare shape paint, stroke style, masks, and snapshot capabilities as unsupported unless those features are implemented

### Requirement: Unsupported capability diff uses capability paths
The system SHALL compare required capabilities and backend capabilities recursively and return unsupported capability paths.

#### Scenario: Required capability is missing from backend
- **WHEN** `CompiledAnimation.requiredCapabilities` marks a capability path as required and the selected backend marks that path unsupported
- **THEN** the capability diff SHALL include that path in the unsupported capability list

#### Scenario: Backend supports required capability
- **WHEN** `CompiledAnimation.requiredCapabilities` marks a capability path as required and the selected backend marks that path supported
- **THEN** the capability diff SHALL NOT include that path in the unsupported capability list

### Requirement: Unsupported capabilities are reported before rendering
The player SHALL notify consumers when the selected backend cannot satisfy the compiled animation's required capabilities.

#### Scenario: Unsupported capabilities exist
- **WHEN** compile or prepare completes with one or more unsupported capability paths for the selected backend
- **THEN** the player SHALL emit an `unsupportedCapabilities` event containing the backend type, unsupported capability paths, required capabilities, and backend capabilities

#### Scenario: Unsupported capabilities are logged
- **WHEN** compile or prepare completes with one or more unsupported capability paths for the selected backend
- **THEN** the player SHALL call `console.warn` with a message that identifies the backend and explains that unsupported parts will be skipped during rendering

#### Scenario: Selected backend supports all requirements
- **WHEN** compile or prepare completes with no unsupported capability paths
- **THEN** the player SHALL NOT emit `unsupportedCapabilities` and SHALL NOT log the unsupported capability warning

### Requirement: Unsupported WebGL rendering steps are skipped
WebGLBackend SHALL skip unsupported drawing operations and continue rendering supported operations in the same frame.

#### Scenario: Command contains texture and unsupported shape work
- **WHEN** WebGLBackend renders a command with supported texture work and unsupported shape work
- **THEN** it SHALL render the supported texture work, skip the unsupported shape work, and continue rendering subsequent commands

#### Scenario: Command contains only unsupported shape work
- **WHEN** WebGLBackend renders a command whose visible output requires unsupported shape capabilities
- **THEN** it SHALL skip that command's unsupported draw work without throwing and continue rendering subsequent commands

#### Scenario: Command contains unsupported mask work
- **WHEN** WebGLBackend renders a command with an unsupported mask capability
- **THEN** it SHALL skip mask application, render supported non-mask work for the command, and continue rendering subsequent commands

### Requirement: Backend selection semantics remain unchanged
The system SHALL preserve existing render mode backend selection semantics during this migration.

#### Scenario: Auto mode selects by WebGL availability
- **WHEN** `renderMode` is `auto`
- **THEN** backend selection SHALL depend on WebGL context availability and SHALL NOT fall back to Canvas based on unsupported animation capabilities

#### Scenario: WebGL does not use Canvas rasterization fallback
- **WHEN** WebGLBackend encounters unsupported shape, mask, stroke, line dash, or snapshot capabilities
- **THEN** it SHALL NOT rasterize those unsupported parts with Canvas and upload them as WebGL textures
