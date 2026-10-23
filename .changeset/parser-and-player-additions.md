---
'svga': minor
---

Add cancellable, observable parsing and explicit player state.

`Parser.load` now accepts byte input (`ArrayBuffer`/`Uint8Array`), an `AbortSignal`, a per-request timeout and `onProgress`, and the constructor accepts `maxInFlight` and default `headers`. `Player` exposes `state` and `isPlaying`.
