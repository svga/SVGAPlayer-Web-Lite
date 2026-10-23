---
'svga': patch
---

Modernize internals, packaging and the verification pipeline.

Centralized resource limits, typed internal errors, a Player runtime context, and an ESM-flavored declaration alias (`index.d.mts`) so dual ESM/CJS consumers resolve unambiguous types. A blocked IndexedDB upgrade now rejects with the documented error instead of reading an invalid request state. Tooling, CI and the consumer matrix are updated; the public API is unchanged.
