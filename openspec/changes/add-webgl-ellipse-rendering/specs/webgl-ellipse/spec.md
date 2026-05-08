## ADDED Requirements

### Requirement: WebGL renders filled ellipse shapes
The WebGL backend SHALL render SVGA `ELLIPSE` shapes when the shape has positive radii and a fill style.

#### Scenario: Shape-only ellipse fill renders in WebGL
- **WHEN** WebGLBackend renders a frame command whose visible output is a filled ellipse shape and no texture work
- **THEN** it SHALL issue WebGL draw work for the filled ellipse without throwing

#### Scenario: Ellipse fill preserves transforms
- **WHEN** a filled ellipse shape has both a sprite command transform and a shape transform
- **THEN** WebGLBackend SHALL render the ellipse using the composed transform that matches Canvas draw order

#### Scenario: Ellipse fill preserves command alpha and fill color
- **WHEN** a filled ellipse shape has an RGBA fill style and its frame command has alpha
- **THEN** WebGLBackend SHALL apply the fill color and command alpha to the rendered ellipse

#### Scenario: Degenerate ellipse fill does not throw
- **WHEN** WebGLBackend renders an ellipse fill with non-positive `radiusX` or `radiusY`
- **THEN** it SHALL skip the invalid fill draw work without throwing

### Requirement: WebGL renders solid ellipse strokes
The WebGL backend SHALL render SVGA `ELLIPSE` shapes when the shape has positive radii, a non-null stroke color, and positive stroke width.

#### Scenario: Shape-only ellipse stroke renders in WebGL
- **WHEN** WebGLBackend renders a frame command whose visible output is a stroked ellipse shape and no texture work
- **THEN** it SHALL issue WebGL draw work for the stroked ellipse without throwing

#### Scenario: Ellipse stroke preserves transforms
- **WHEN** a stroked ellipse shape has both a sprite command transform and a shape transform
- **THEN** WebGLBackend SHALL render the stroke using the composed transform that matches Canvas draw order

#### Scenario: Ellipse stroke preserves command alpha and stroke color
- **WHEN** a stroked ellipse shape has an RGBA stroke style and its frame command has alpha
- **THEN** WebGLBackend SHALL apply the stroke color and command alpha to the rendered stroke

#### Scenario: Ellipse fill and stroke draw in Canvas order
- **WHEN** an ellipse shape has both fill and stroke styles
- **THEN** WebGLBackend SHALL draw the fill before drawing the stroke

#### Scenario: Degenerate ellipse stroke does not throw
- **WHEN** WebGLBackend renders an ellipse stroke with invalid or collapsed inner stroke geometry
- **THEN** it SHALL skip the invalid stroke draw work without throwing

### Requirement: WebGL ellipse capabilities are declared accurately
The WebGL backend SHALL declare ellipse support only for implemented solid fill and solid stroke rendering.

#### Scenario: Ellipse fill is supported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.ellipse.fill` SHALL be true

#### Scenario: Ellipse stroke is supported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.ellipse.stroke` SHALL be true

#### Scenario: Stroke width support remains available
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.strokeStyle.width` SHALL be true

#### Scenario: Unsupported stroke styles remain unsupported
- **WHEN** WebGL render capabilities are created
- **THEN** `shape.strokeStyle.lineCap`, `shape.strokeStyle.lineJoin`, `shape.strokeStyle.miterLimit`, and `shape.strokeStyle.lineDash` SHALL remain false

#### Scenario: Generic path and mask capabilities remain unsupported
- **WHEN** WebGL render capabilities are created
- **THEN** generic path and mask capabilities SHALL remain false unless separately implemented

### Requirement: Unsupported ellipse variants are reported or skipped
The WebGL backend SHALL continue to skip or report ellipse operations that are not covered by the implemented ellipse capability.

#### Scenario: Dashed ellipse stroke remains unsupported
- **WHEN** an animation requires ellipse stroke with a non-empty line dash
- **THEN** unsupported capability reporting SHALL include `shape.strokeStyle.lineDash`

#### Scenario: Ellipse stroke with line join remains unsupported
- **WHEN** an animation requires ellipse stroke with an explicit line join style
- **THEN** unsupported capability reporting SHALL include `shape.strokeStyle.lineJoin`

#### Scenario: Unparseable ellipse color is skipped
- **WHEN** WebGLBackend renders an ellipse shape whose fill or stroke color cannot be parsed
- **THEN** it SHALL skip that unparseable paint operation without throwing
