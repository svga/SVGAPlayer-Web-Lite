## ADDED Requirements

### Requirement: Local rounded-rect fill SVGA fixture
The repository SHALL provide a real local SVGA version 2 fixture containing a filled rounded rectangle encoded with the project's protobuf schema and zlib compression.

#### Scenario: Fill fixture decodes through parser path
- **WHEN** the local rounded-rect fill `.svga` fixture is loaded by the existing parser
- **THEN** it SHALL decode into a video containing a `RECT` shape with `cornerRadius` greater than zero and a non-null fill color

#### Scenario: Fill fixture is shape-only
- **WHEN** the local rounded-rect fill `.svga` fixture is decoded
- **THEN** its visible output SHALL be provided by rounded rect shape fill data rather than image texture data

#### Scenario: Fill fixture requires rounded rect fill capability
- **WHEN** the local rounded-rect fill `.svga` fixture is compiled
- **THEN** the compiled animation SHALL require `shape.roundedRect.fill`

#### Scenario: Fill fixture avoids stroke requirements
- **WHEN** the local rounded-rect fill `.svga` fixture is compiled
- **THEN** the compiled animation SHALL NOT require `shape.roundedRect.stroke` or any stroke style capability

### Requirement: Local rounded-rect stroke SVGA fixture
The repository SHALL provide a real local SVGA version 2 fixture containing a stroked rounded rectangle encoded with the project's protobuf schema and zlib compression.

#### Scenario: Stroke fixture decodes through parser path
- **WHEN** the local rounded-rect stroke `.svga` fixture is loaded by the existing parser
- **THEN** it SHALL decode into a video containing a `RECT` shape with `cornerRadius` greater than zero, non-null stroke color, and positive stroke width

#### Scenario: Stroke fixture is shape-only
- **WHEN** the local rounded-rect stroke `.svga` fixture is decoded
- **THEN** its visible output SHALL be provided by rounded rect shape stroke data rather than image texture data

#### Scenario: Stroke fixture requires rounded rect stroke capability
- **WHEN** the local rounded-rect stroke `.svga` fixture is compiled
- **THEN** the compiled animation SHALL require `shape.roundedRect.stroke` and `shape.strokeStyle.width`

#### Scenario: Stroke fixture avoids unsupported stroke details
- **WHEN** the local rounded-rect stroke `.svga` fixture is compiled
- **THEN** the compiled animation SHALL NOT require `shape.strokeStyle.lineDash`, `shape.strokeStyle.lineCap`, `shape.strokeStyle.lineJoin`, or `shape.strokeStyle.miterLimit`

### Requirement: Manual demo exposes rounded-rect sources
The manual remote SVGA player page SHALL allow testers to select the local rounded-rect fixtures without editing page code.

#### Scenario: Built-in rounded-rect fill source is selectable
- **WHEN** the manual demo page is opened
- **THEN** it SHALL list the local rounded-rect fill fixture as a selectable built-in source

#### Scenario: Built-in rounded-rect stroke source is selectable
- **WHEN** the manual demo page is opened
- **THEN** it SHALL list the local rounded-rect stroke fixture as a selectable built-in source

#### Scenario: Rounded-rect sources work with render mode selection
- **WHEN** a tester selects either rounded-rect fixture and chooses canvas, auto, webgl, or all modes
- **THEN** the manual demo page SHALL load and render that fixture using the selected render mode or modes

#### Scenario: Existing sources remain selectable
- **WHEN** the manual demo page is opened
- **THEN** it SHALL continue to list the existing local rect-fill fixture, local rect-stroke fixture, existing remote demo URL, and custom URL input
