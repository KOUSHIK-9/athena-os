# RFC Glossary (canonical terminology)

This file is the canonical source of truth for cross-RFC terminology. The
automated `scripts/rfc-consistency-check.mjs` verifies that these terms are
defined here, and individual RFCs (e.g. RFC-0014 §Glossary) should defer to it
rather than redefining terms locally.

| Term | Meaning |
|------|---------|
| **Context** (RFC-0005 §4) | The ambient world state at planning time (device, user, environment, session history). Representation-independent; session-scoped. Memory is its *persistent* portion. |
| **Memory** (RFC-0013) | The persisted, typed knowledge store (`fact` / `preference` / `experience` / `trigger`). The persistent backing of Context. |
| **RetrievalResult** (RFC-0014) | The ordered, de-duplicated `MemoryEntry[]` a retriever returns for a request. It is **not** the RFC-0005 §4 Context. |
| **MemoryReader** (RFC-0013 §The Contract) | The read-only handoff the engine gives a memory-aware backend (`memory?: MemoryReader`); retrieval runs against it. |
| **Intent** (RFC-0005 §1) | The human's declared desire; the only purely human-supplied contract input. |
| **Constraint** (RFC-0005 §3, RFC-0007) | A boundary condition on a plan (hard / soft / safety / temporal / resource). Memory may bias but never add or override constraints. |
