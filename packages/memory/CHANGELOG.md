# @athena-os/memory

## 1.0.0

### Major Changes

- # Athena Developer Preview v1.0.0

  The first complete, shippable Athena product loop — Apple on-device reasoning
  plus the Memory product loop (RFC-0013..0016), runtime-verified on an iPhone 17
  Simulator.

  Highlights:
  - Apple on-device reasoning is the preferred default backend
    (`packages/reasoning-backends`), with automatic fallback to the deterministic
    backend when Apple Intelligence is unavailable.
  - Memory model + deterministic retrieval (`packages/memory`): `fact`,
    `preference`, `experience`, `trigger` with append-only supersession.
  - Preference retrieval into the on-device model's context (RFC-0015) — soft
    constraint projection only, never authorizes execution.
  - Trigger firing on the execution side (`servers/mcp-server/src/run/triggers.ts`,
    RFC-0016) and experience write-back on verified success only.
  - End-to-end: intent → Apple on-device reasoning → memory-aware plan → validated
    execution → verified result → experience written back.
  - Full workspace gate green: build / test / lint / format / architecture /
    RFC consistency; Memory conformance suite added; Memory benchmark added.

  Learning, Multi-Agent, and the broader Athena OS vision are the v2.0 roadmap and
  are explicitly out of scope for this release.

### Patch Changes

- Updated dependencies
  - @athena-os/core@1.0.0
