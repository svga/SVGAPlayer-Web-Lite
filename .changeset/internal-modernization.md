---
'svga': patch
---

Modernize internals, packaging and the verification pipeline.

Centralized resource limits, typed internal errors, a Player runtime context, and an ESM-flavored declaration alias (`index.d.mts`) so dual ESM/CJS consumers resolve unambiguous types. Tooling, CI and the consumer matrix are updated; the public API is unchanged.
