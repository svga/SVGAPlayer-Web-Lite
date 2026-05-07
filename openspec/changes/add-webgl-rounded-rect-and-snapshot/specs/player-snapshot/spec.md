## ADDED Requirements

### Requirement: Player exposes current-frame snapshots
The player SHALL expose a public snapshot operation that returns the current rendered frame from the active backend when snapshot support is available.

#### Scenario: Canvas snapshot returns current canvas
- **WHEN** a player using CanvasBackend has rendered or prepared a frame and `snapshot()` is called
- **THEN** the player SHALL return the current `HTMLCanvasElement` snapshot surface from the backend

#### Scenario: WebGL snapshot returns current canvas
- **WHEN** a player using WebGLBackend has rendered or prepared a frame and `snapshot()` is called
- **THEN** the player SHALL return the current `HTMLCanvasElement` snapshot surface from the backend

#### Scenario: Unsupported snapshot returns null
- **WHEN** a selected backend does not provide snapshot support and `snapshot()` is called
- **THEN** the player SHALL return `null`

#### Scenario: Snapshot does not mutate playback state
- **WHEN** `snapshot()` is called during playback, pause, or after manual frame rendering
- **THEN** the player SHALL NOT change the current frame index, active slot, playback state, or backend resources

### Requirement: WebGL declares snapshot support accurately
The WebGL backend SHALL declare snapshot support after implementing a snapshot operation.

#### Scenario: WebGL snapshot capability is supported
- **WHEN** WebGL render capabilities are created
- **THEN** `snapshot` SHALL be true

#### Scenario: Canvas snapshot capability remains supported
- **WHEN** Canvas render capabilities are created
- **THEN** `snapshot` SHALL remain true

#### Scenario: Snapshot is not treated as an animation requirement
- **WHEN** an animation is compiled from SVGA data
- **THEN** the compiled animation SHALL NOT require `snapshot` merely because the backend can snapshot

### Requirement: Backend snapshot contract is synchronous
Backend snapshot operations SHALL return the current render surface synchronously without requiring asynchronous readback.

#### Scenario: Snapshot returns an allowed backend type
- **WHEN** a backend snapshot operation succeeds
- **THEN** it SHALL return an `HTMLCanvasElement` or `ImageBitmap`

#### Scenario: Snapshot avoids Canvas fallback rasterization
- **WHEN** WebGLBackend snapshot is called
- **THEN** it SHALL NOT rasterize WebGL content through an auxiliary Canvas fallback before returning
