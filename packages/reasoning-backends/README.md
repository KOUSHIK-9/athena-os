# @athena-os/reasoning-backends

Implements:
RFC-0012 — Reasoning Backend Contract & Conformance

Purpose:
Hold every reasoning backend implementation and the conformance suite that
proves a backend satisfies Athena's reasoning contract.

## What lives here

- `deterministic/` — the **reference backend**: re-exports
  `DeterministicReasoningBackend` (the RFC-0011 candidate protocol, owned by
  `@athena-os/reasoning`). The suite certifies it against the parity fixtures.
- `conformance/` — the harness: `runScenario`, `runConformance`, `runParity`
  (deep-equality against canonical fixtures).
- `conformance/fixtures/parity.ts` — canonical `ExecutionPlan` fixtures frozen
  from the RFC-0011 deterministic reference. Any backend must reproduce them
  exactly (RFC-0012 §Parity Conformance).
- `conformance/fixtures/behavioral.ts` — authored oracles for free-form
  intent where no deterministic baseline exists (RFC-0012 §Behavioral
  Conformance). The oracle is the fixture, not another backend.

The `ReasoningBackend` contract itself lives in `@athena-os/reasoning`
(one concept, one canonical definition) — this package implements and
conforms to it, it does not re-define it (Engineering Principle #5, #11).
The deterministic backend's stages also live in `@athena-os/reasoning`
(RFC-0011's stage implementations); this package adopts it as the reference
family member and certifies it. The LLM backend (RFC-0012 PR 3) will be a
real implementation here, behind the same contract.

## The trust boundary (RFC-0012)

```
Intent
   ↓
ReasoningBackend     ← this package's backends (a candidate)
   ↓
Candidate Plan
   ↓
Validator            ← the authority, engine-owned
   ↓
Execution Graph
   ↓
Execution
```

A backend never bypasses validation: its output is always a *candidate* that
the engine validates. The reference backend is `DeterministicReasoningBackend`
(RFC-0011, certified here against the parity fixtures); the LLM, when it
arrives, must conform to the same fixtures.

## Conformance command

```bash
pnpm test --filter=@athena-os/reasoning-backends
```

A new backend conforms when it passes every canonical scenario — exact
ExecutionPlan equality, not "contains the same goals." The suite includes a
certification run against `DeterministicReasoningBackend` itself.