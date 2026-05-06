## ADDED Requirements

### Requirement: Compile parsed video into compiled animation
The render compiler SHALL convert parsed `VideoEntity` data into a `CompiledAnimation` that is ready for backend preparation and playback.

#### Scenario: Compile after parse
- **WHEN** `compile()` is called after successful parsing
- **THEN** the compiler SHALL produce a compiled animation containing size, fps, total frame count, frame render commands, resources, required capabilities, and selected backend metadata

#### Scenario: Compile owns mount initialization work
- **WHEN** compilation starts for a parsed video
- **THEN** the compiler SHALL perform the initialization responsibilities previously handled by `Player.mount()`, including frame count setup, surface sizing coordination, image normalization, and render resource preparation

### Requirement: Complete frame commands before playback
The render compiler SHALL produce complete per-frame render commands before playback begins.

#### Scenario: Render frame consumes commands
- **WHEN** playback renders a frame after successful compilation
- **THEN** the renderer SHALL use the compiled commands for that frame instead of parsing SVGA source data or path strings during frame rendering

#### Scenario: Command compilation includes sprite ordering
- **WHEN** commands are compiled for a frame
- **THEN** command order SHALL preserve the SVGA sprite and shape drawing order needed to match Canvas playback semantics

### Requirement: Path analysis before backend selection
The render compiler SHALL analyze path data before selecting a backend.

#### Scenario: Holes are detected before render
- **WHEN** a shape path contains multiple closed contours that imply holes under the active fill rule
- **THEN** the compiler SHALL mark the compiled commands as requiring hole-capable fill support before playback begins

#### Scenario: Complex unsupported path is detected
- **WHEN** a path uses unsupported commands, complex self-intersection, or contour relationships that cannot be safely compiled for the target GPU backend
- **THEN** the compiler SHALL record the unsupported capability requirement before backend resolution completes

#### Scenario: Canvas fill rule is represented
- **WHEN** a shape fill is compiled from Canvas-compatible path data
- **THEN** the compiler SHALL account for the Canvas default `nonzero` fill behavior unless a different fill rule is explicitly introduced

### Requirement: Required capabilities are derived from compiled data
The compiler SHALL derive required render capabilities from the animation data and compiled commands.

#### Scenario: Feature scan detects masks
- **WHEN** an animation frame includes a `maskPath` or clip path
- **THEN** the compiled animation SHALL require mask or stencil-capable rendering support for GPU backends

#### Scenario: Feature scan detects stroke details
- **WHEN** an animation includes stroked shapes with line dash, line cap, line join, or miter limit data
- **THEN** the compiled animation SHALL declare the corresponding stroke capability requirements

### Requirement: Memory-controlled compile output
The compiler SHALL avoid per-frame duplication of reusable geometry.

#### Scenario: Reusable geometry cache
- **WHEN** multiple frame commands refer to the same local shape geometry
- **THEN** the compiled animation SHALL store the geometry once and reference it by ID from per-frame commands

#### Scenario: Per-frame commands use references
- **WHEN** frame commands are emitted
- **THEN** they SHALL store references such as image keys, geometry IDs, transforms, alpha values, and style IDs instead of full transformed vertex arrays per frame

### Requirement: Optional CPU compile worker boundary
The compiler architecture SHALL allow CPU-heavy compile work to move to a worker without replacing the parser worker.

#### Scenario: Main-thread CPU compile
- **WHEN** compile worker support is disabled or unavailable
- **THEN** CPU compile work SHALL run on the main thread and produce the same compiled animation contract

#### Scenario: Future compile worker
- **WHEN** compile worker support is enabled in a future implementation
- **THEN** path parsing, contour analysis, feature scanning, and reusable geometry construction MAY run in a compile worker while GPU resource preparation remains on the renderer-owning thread
