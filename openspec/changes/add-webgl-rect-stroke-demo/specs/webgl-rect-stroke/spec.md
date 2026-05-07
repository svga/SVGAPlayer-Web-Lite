## ADDED Requirements

### Requirement: WebGL renders solid non-rounded rect strokes
The WebGL backend SHALL render SVGA `RECT` shapes with `cornerRadius` equal to zero when the shape has a non-null stroke color and positive stroke width.

#### Scenario: Shape-only rect stroke renders in WebGL
- **WHEN** WebGLBackend renders a frame command whose visible output is a stroked non-rounded rect shape and no texture work
- **THEN** it SHALL issue WebGL draw work for the stroked rect without throwing

#### Scenario: Rect stroke preserves transforms
- **WHEN** a stroked non-rounded rect shape has both a sprite command transform and a shape transform
- **THEN** WebGLBackend SHALL render the stroke using the composed transform that matches Canvas draw order

#### Scenario: Rect stroke preserves command alpha and stroke color
- **WHEN** a stroked non-rounded rect shape has an RGBA stroke style and its frame command has alpha
- **THEN** WebGLBackend SHALL apply the stroke color and command alpha to the rendered stroke

#### Scenario: Fill and stroke draw in Canvas order
- **WHEN** a non-rounded rect shape has both fill and stroke styles
- **THEN** WebGLBackend SHALL draw the fill before drawing the stroke

### Requirement: WebGL rect stroke capability is declared accurately
The WebGL backend SHALL declare rect stroke support only for implemented solid non-rounded rect stroke rendering.

#### Scenario: Rect stroke is supported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.rect.stroke` SHALL be true

#### Scenario: Stroke width is supported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.strokeStyle.width` SHALL be true

#### Scenario: Unsupported stroke styles remain unsupported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.strokeStyle.lineCap`, `shape.strokeStyle.lineJoin`, `shape.strokeStyle.miterLimit`, and `shape.strokeStyle.lineDash` SHALL remain false

#### Scenario: Other shape strokes remain unsupported
- **WHEN** WebGL render capabilities are created
- **THEN** rounded rect, ellipse, and path stroke capabilities SHALL remain false

### Requirement: Unsupported stroke work remains skipped or reported
The WebGL backend SHALL continue to skip or report shape operations that are not covered by the implemented rect stroke capability.

#### Scenario: Rounded rect stroke remains unsupported
- **WHEN** an animation requires rounded rect stroke in WebGL mode
- **THEN** unsupported capability reporting SHALL include `shape.roundedRect.stroke`

#### Scenario: Path stroke remains unsupported
- **WHEN** an animation requires generic path stroke in WebGL mode
- **THEN** unsupported capability reporting SHALL include `shape.path.stroke`

#### Scenario: Dashed rect stroke remains unsupported
- **WHEN** an animation requires rect stroke with a non-empty line dash
- **THEN** unsupported capability reporting SHALL include `shape.strokeStyle.lineDash`

#### Scenario: Degenerate rect stroke does not throw
- **WHEN** WebGLBackend renders a non-rounded rect stroke with invalid or degenerate geometry
- **THEN** it SHALL skip the invalid stroke draw work without throwing
