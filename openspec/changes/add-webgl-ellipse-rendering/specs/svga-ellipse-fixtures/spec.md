## ADDED Requirements

### Requirement: Local ellipse fill SVGA fixture

The repository SHALL provide a real local SVGA v2 fixture containing a filled ellipse encoded through the project protobuf schema and compressed in the same way as existing local fixtures.

#### Scenario: Fill fixture decodes through the parser path

- **WHEN** the local ellipse fill `.svga` fixture is loaded by the existing SVGA parser
- **THEN** it SHALL decode into a video with a shape entity containing an `ELLIPSE` shape
- **AND** the ellipse SHALL have positive `radiusX` and `radiusY` values
- **AND** the shape SHALL include a parseable fill color.

#### Scenario: Fill fixture requires only ellipse fill support

- **WHEN** the fill fixture is inspected for render requirements
- **THEN** it SHALL require `shape.ellipse.fill`
- **AND** it SHALL NOT require stroke, path, mask, or unsupported stroke-style capabilities.

### Requirement: Local ellipse stroke SVGA fixture

The repository SHALL provide a real local SVGA v2 fixture containing a stroked ellipse encoded through the project protobuf schema and compressed in the same way as existing local fixtures.

#### Scenario: Stroke fixture decodes through the parser path

- **WHEN** the local ellipse stroke `.svga` fixture is loaded by the existing SVGA parser
- **THEN** it SHALL decode into a video with a shape entity containing an `ELLIPSE` shape
- **AND** the ellipse SHALL have positive `radiusX` and `radiusY` values
- **AND** the shape SHALL include a parseable stroke color and a positive stroke width.

#### Scenario: Stroke fixture requires only supported solid stroke features

- **WHEN** the stroke fixture is inspected for render requirements
- **THEN** it SHALL require `shape.ellipse.stroke`
- **AND** it SHALL require `shape.strokeStyle.width`
- **AND** it SHALL NOT require line dash, line cap, line join, miter limit, path, or mask capabilities.

### Requirement: Manual demo exposes ellipse fixtures

The manual remote SVGA player demo SHALL expose local ellipse fill and stroke fixtures as selectable sources for visual verification.

#### Scenario: Ellipse fixtures are selectable in render mode presets

- **WHEN** a developer opens the remote SVGA player demo
- **THEN** the ellipse fill and ellipse stroke fixtures SHALL be available alongside the existing sample sources
- **AND** they SHALL be testable with `canvas`, `auto`, `webgl`, and multi-mode comparison flows.

#### Scenario: Existing demo sources remain available

- **WHEN** ellipse fixtures are added to the demo source list
- **THEN** existing fixture entries SHALL remain selectable with their current labels and source paths.
