## ADDED Requirements

### Requirement: Local rect-fill SVGA fixture
The repository SHALL provide a real local SVGA version 2 fixture containing a filled non-rounded rectangle encoded with the project's protobuf schema and zlib compression.

#### Scenario: Fixture decodes through parser path
- **WHEN** the local rect-fill `.svga` fixture is loaded by the existing parser
- **THEN** it SHALL decode into a video containing a `RECT` shape with `cornerRadius` equal to zero and a non-null fill style

#### Scenario: Fixture is shape-only
- **WHEN** the local rect-fill `.svga` fixture is decoded
- **THEN** its visible output SHALL be provided by rect shape data rather than image texture data

#### Scenario: Fixture requires rect fill capability
- **WHEN** the local rect-fill `.svga` fixture is compiled
- **THEN** the compiled animation SHALL require `shape.rect.fill`

### Requirement: Manual demo source and mode selection
The manual remote SVGA player page SHALL allow testers to select render mode and SVGA source without editing page code.

#### Scenario: Built-in sources are selectable
- **WHEN** the manual demo page is opened
- **THEN** it SHALL list the local rect-fill fixture and the existing remote demo URL as selectable sources

#### Scenario: Custom URL is supported
- **WHEN** a tester enters a custom SVGA URL and runs playback
- **THEN** the manual demo page SHALL load and render that URL

#### Scenario: Render mode is selectable
- **WHEN** a tester selects canvas, auto, webgl, or all modes and runs playback
- **THEN** the manual demo page SHALL create players for the selected render mode or modes

#### Scenario: Existing playback controls remain available
- **WHEN** playback has been started from a selected source
- **THEN** play, pause, resume, stop, WebGL context loss, WebGL context restore, and destroy controls SHALL remain available where applicable
