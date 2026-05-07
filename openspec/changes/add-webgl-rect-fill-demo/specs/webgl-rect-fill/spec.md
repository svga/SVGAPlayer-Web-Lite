## ADDED Requirements

### Requirement: WebGL renders filled non-rounded rect shapes
The WebGL backend SHALL render SVGA `RECT` shapes with `cornerRadius` equal to zero when the shape has a fill style.

#### Scenario: Shape-only rect fill renders in WebGL
- **WHEN** WebGLBackend renders a frame command whose visible output is a filled non-rounded rect shape and no texture work
- **THEN** it SHALL issue WebGL draw work for the filled rect without throwing

#### Scenario: Rect fill preserves sprite and shape transforms
- **WHEN** a filled non-rounded rect shape has both a sprite command transform and a shape transform
- **THEN** WebGLBackend SHALL render the rect using the composed transform that matches Canvas draw order

#### Scenario: Rect fill preserves command alpha and fill color
- **WHEN** a filled non-rounded rect shape has an RGBA fill style and its frame command has alpha
- **THEN** WebGLBackend SHALL apply the fill color and command alpha to the rendered rect

### Requirement: WebGL rect fill capability is declared accurately
The WebGL backend SHALL declare `shape.rect.fill` support only for implemented filled non-rounded rect rendering.

#### Scenario: Rect fill is supported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.rect.fill` SHALL be true

#### Scenario: Rect stroke remains unsupported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.rect.stroke` SHALL remain false

#### Scenario: Other shape capabilities remain unsupported
- **WHEN** WebGL render capabilities are created
- **THEN** rounded rect, ellipse, path, stroke style, mask, and snapshot capabilities SHALL remain false

### Requirement: Unsupported shape work continues to be skipped
The WebGL backend SHALL continue to skip shape operations that are not covered by the implemented rect fill capability.

#### Scenario: Rounded rect remains skipped
- **WHEN** WebGLBackend renders a frame command containing a rounded rect shape
- **THEN** it SHALL skip the rounded rect draw work without throwing

#### Scenario: Path shape remains skipped
- **WHEN** WebGLBackend renders a frame command containing a generic path shape
- **THEN** it SHALL skip the path shape draw work without throwing

#### Scenario: Stroked rect reports unsupported stroke
- **WHEN** an animation requires rect stroke in WebGL mode
- **THEN** unsupported capability reporting SHALL include `shape.rect.stroke`
