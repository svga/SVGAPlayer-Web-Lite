## ADDED Requirements

### Requirement: Local rect-stroke SVGA fixture
The repository SHALL provide a real local SVGA version 2 fixture containing a stroked non-rounded rectangle encoded with the project's protobuf schema and zlib compression.

#### Scenario: Fixture decodes through parser path
- **WHEN** the local rect-stroke `.svga` fixture is loaded by the existing parser
- **THEN** it SHALL decode into a video containing a `RECT` shape with `cornerRadius` equal to zero, non-null stroke color, and positive stroke width

#### Scenario: Fixture is shape-only
- **WHEN** the local rect-stroke `.svga` fixture is decoded
- **THEN** its visible output SHALL be provided by rect shape stroke data rather than image texture data

#### Scenario: Fixture requires rect stroke capability
- **WHEN** the local rect-stroke `.svga` fixture is compiled
- **THEN** the compiled animation SHALL require `shape.rect.stroke` and `shape.strokeStyle.width`

#### Scenario: Fixture does not require unsupported stroke details
- **WHEN** the local rect-stroke `.svga` fixture is compiled
- **THEN** the compiled animation SHALL NOT require `shape.strokeStyle.lineDash`, `shape.strokeStyle.lineCap`, `shape.strokeStyle.lineJoin`, or `shape.strokeStyle.miterLimit`

### Requirement: Manual demo exposes rect-stroke source
The manual remote SVGA player page SHALL allow testers to select the local rect-stroke fixture without editing page code.

#### Scenario: Built-in rect-stroke source is selectable
- **WHEN** the manual demo page is opened
- **THEN** it SHALL list the local rect-stroke fixture as a selectable built-in source

#### Scenario: Rect-stroke source works with render mode selection
- **WHEN** a tester selects the local rect-stroke fixture and chooses canvas, auto, webgl, or all modes
- **THEN** the manual demo page SHALL load and render that fixture using the selected render mode or modes

#### Scenario: Existing sources remain selectable
- **WHEN** the manual demo page is opened
- **THEN** it SHALL continue to list the existing local rect-fill fixture, the existing remote demo URL, and custom URL input
