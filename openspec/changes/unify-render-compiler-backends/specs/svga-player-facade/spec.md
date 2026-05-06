## ADDED Requirements

### Requirement: Single public player facade
The package SHALL expose `SVGAPlayer` as the primary public class for parsing, compiling, playing, observing, clearing, and destroying SVGA animations.

#### Scenario: Consumer instantiates the facade
- **WHEN** a consumer imports `SVGAPlayer` from the package and constructs it with a canvas container
- **THEN** the instance SHALL expose `parse`, `compile`, `play`, `pause`, `resume`, `stop`, `clear`, `destroy`, and `on` methods

#### Scenario: Internal modules remain behind facade
- **WHEN** a consumer uses the documented player flow
- **THEN** the consumer SHALL NOT need to instantiate Parser, RenderCompiler, Animator, CanvasBackend, or WebGLBackend directly

### Requirement: Explicit parse compile play flow
`SVGAPlayer` SHALL support an explicit parse -> compile -> play flow.

#### Scenario: URL source is parsed and compiled
- **WHEN** a consumer calls `parse(url)` followed by `compile()` and `play()`
- **THEN** parsing SHALL produce animation data, compilation SHALL produce a compiled animation, and playback SHALL render from the compiled animation

#### Scenario: Parsed video source is accepted
- **WHEN** a consumer calls `parse(video)` with an already parsed `VideoEntity` compatible object
- **THEN** the player SHALL accept the video data without downloading or decoding the SVGA file again

#### Scenario: Play before compile is rejected
- **WHEN** a consumer calls `play()` before a compiled animation is available
- **THEN** the player SHALL throw or emit a clear error indicating that `compile()` is required first

### Requirement: Parser worker preservation
`SVGAPlayer.parse()` SHALL preserve the existing parser worker behavior for URL parsing when parser workers are enabled.

#### Scenario: Parser worker enabled
- **WHEN** `parse(url)` is called with parser worker support enabled
- **THEN** download, inflate, protobuf decode, and image extraction SHALL run through the parser worker path

#### Scenario: Parser worker disabled
- **WHEN** parser worker usage is disabled through options
- **THEN** parsing SHALL use the existing non-worker parser path without changing the compile stage contract

### Requirement: Event subscription API
`SVGAPlayer` SHALL provide an `on(event, callback)` API for lifecycle and playback events.

#### Scenario: Start event listener
- **WHEN** a consumer subscribes to `start` and calls `play()` on a compiled animation
- **THEN** the subscribed callback SHALL be invoked when playback starts

#### Scenario: Process event listener
- **WHEN** a consumer subscribes to `process`
- **THEN** the callback SHALL receive playback progress information including the current frame and progress value

#### Scenario: Listener cleanup
- **WHEN** `on()` returns an unsubscribe function and the consumer invokes it
- **THEN** the removed callback SHALL NOT be invoked for subsequent events

### Requirement: Playback lifecycle controls
`SVGAPlayer` SHALL provide playback methods that operate on compiled animations.

#### Scenario: Pause and resume
- **WHEN** playback is running and the consumer calls `pause()` followed by `resume()`
- **THEN** playback SHALL stop advancing while paused and continue from the paused frame when resumed

#### Scenario: Stop resets playback
- **WHEN** playback is running and the consumer calls `stop()`
- **THEN** playback SHALL stop and reset to the initial frame according to the player configuration

#### Scenario: Destroy releases resources
- **WHEN** the consumer calls `destroy()`
- **THEN** the player SHALL stop playback, remove active event listeners, and release compiled/backend resources
