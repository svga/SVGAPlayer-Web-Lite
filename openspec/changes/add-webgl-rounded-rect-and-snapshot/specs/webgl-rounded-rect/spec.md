## ADDED Requirements

### Requirement: WebGL renders filled rounded rect shapes
The WebGL backend SHALL render SVGA `RECT` shapes with `cornerRadius` greater than zero when the shape has a fill style.

#### Scenario: Shape-only rounded rect fill renders in WebGL
- **WHEN** WebGLBackend renders a frame command whose visible output is a filled rounded rect shape and no texture work
- **THEN** it SHALL issue WebGL draw work for the filled rounded rect without throwing

#### Scenario: Rounded rect fill preserves transforms
- **WHEN** a filled rounded rect shape has both a sprite command transform and a shape transform
- **THEN** WebGLBackend SHALL render the rounded rect using the composed transform that matches Canvas draw order

#### Scenario: Rounded rect fill preserves command alpha and fill color
- **WHEN** a filled rounded rect shape has an RGBA fill style and its frame command has alpha
- **THEN** WebGLBackend SHALL apply the fill color and command alpha to the rendered rounded rect

#### Scenario: Rounded rect fill handles clamped radius
- **WHEN** a filled rounded rect shape has a corner radius greater than half of its width or height
- **THEN** WebGLBackend SHALL render using a clamped radius no greater than half of the smaller dimension

### Requirement: WebGL renders solid rounded rect strokes
The WebGL backend SHALL render SVGA `RECT` shapes with `cornerRadius` greater than zero when the shape has a non-null stroke color and positive stroke width.

#### Scenario: Shape-only rounded rect stroke renders in WebGL
- **WHEN** WebGLBackend renders a frame command whose visible output is a stroked rounded rect shape and no texture work
- **THEN** it SHALL issue WebGL draw work for the stroked rounded rect without throwing

#### Scenario: Rounded rect stroke preserves transforms
- **WHEN** a stroked rounded rect shape has both a sprite command transform and a shape transform
- **THEN** WebGLBackend SHALL render the stroke using the composed transform that matches Canvas draw order

#### Scenario: Rounded rect stroke preserves command alpha and stroke color
- **WHEN** a stroked rounded rect shape has an RGBA stroke style and its frame command has alpha
- **THEN** WebGLBackend SHALL apply the stroke color and command alpha to the rendered stroke

#### Scenario: Rounded rect fill and stroke draw in Canvas order
- **WHEN** a rounded rect shape has both fill and stroke styles
- **THEN** WebGLBackend SHALL draw the fill before drawing the stroke

#### Scenario: Degenerate rounded rect stroke does not throw
- **WHEN** WebGLBackend renders a rounded rect stroke with invalid or degenerate geometry
- **THEN** it SHALL skip the invalid stroke draw work without throwing

### Requirement: WebGL rounded rect capabilities are declared accurately
The WebGL backend SHALL declare rounded rect support only for implemented solid fill and solid stroke rendering.

#### Scenario: Rounded rect fill is supported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.roundedRect.fill` SHALL be true

#### Scenario: Rounded rect stroke is supported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.roundedRect.stroke` SHALL be true

#### Scenario: Stroke width support remains available
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.strokeStyle.width` SHALL be true

#### Scenario: Unsupported stroke styles remain unsupported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.strokeStyle.lineCap`, `shape.strokeStyle.lineJoin`, `shape.strokeStyle.miterLimit`, and `shape.strokeStyle.lineDash` SHALL remain false

#### Scenario: Other unsupported shape kinds remain unsupported
- **WHEN** WebGL render capabilities are created
- **THEN** ellipse, generic path, and mask capabilities SHALL remain false unless separately implemented

### Requirement: Unsupported rounded rect variants are reported or skipped
The WebGL backend SHALL continue to skip or report rounded rect operations that are not covered by the implemented rounded rect capability.

#### Scenario: Dashed rounded rect stroke remains unsupported
- **WHEN** an animation requires rounded rect stroke with a non-empty line dash
- **THEN** unsupported capability reporting SHALL include `shape.strokeStyle.lineDash`

#### Scenario: Rounded rect stroke with line join remains unsupported
- **WHEN** an animation requires rounded rect stroke with an explicit line join style
- **THEN** unsupported capability reporting SHALL include `shape.strokeStyle.lineJoin`

#### Scenario: Unparseable rounded rect color is skipped
- **WHEN** WebGLBackend renders a rounded rect shape whose fill or stroke color cannot be parsed
- **THEN** it SHALL skip that unparseable paint operation without throwing
