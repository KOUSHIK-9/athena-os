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
- `llm/` — the first **model-backed backend**: `LlmReasoningBackend` talks to
  a model through the `ModelClient` port, which owns only the open-ended
  semantics (goal extraction / clarification). Everything downstream is the
  canonical assembly (constraint, capability selection, plan building), so
  the result is certified by the same exact-equality suite as the reference.
  `StubModelClient` is the in-repo model stand-in: the suite is fully
  hermetic (no API, no keys); a real provider (GPT/Claude/Gemini) implements
  the same port later.
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
family member and certifies it. The `ModelClient` port and the LLM backend
built on it are implemented here.

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
the engine validates. Two conforming backends ship today —
`DeterministicReasoningBackend` (the RFC-0011 reference) and
`LlmReasoningBackend` (model-backed, via the `ModelClient` port) — both
certified against the parity fixtures; they are interchangeable behind the
same contract.

## What "certified" means

```bash
pnpm test --filter=@athena-os/reasoning-backends
```

The suite runs the full conformance against both backends: 5 parity
scenarios (exact `ExecutionPlan` equality — both pass) plus the 2 behavioral
canons the LLM backend must satisfy and the deterministic engine cannot
(authorial login: the flight search and weekend trip are free-form). A new
backend conforms when it passes every canonical scenario — exact equality,
not "contains the same goals."