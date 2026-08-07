# RFC-0012: The Reasoning Backend Contract & Conformance

- Status: **Draft**
- Reference Implementation: [`packages/reasoning-backends`](../../packages/reasoning-backends/README.md)
- Authors: Athena Core Team
- Created: 2026-08-07
- Depends on: RFC-0009 (The Contract Between Intent and Execution),
  RFC-0011 (The Deterministic Reasoning Engine)

---

## Abstract

This RFC defines the **Reasoning Backend** — the contract that makes Athena's
reasoning backend-interchangeable. A Reasoning Backend transforms an Intent
into a *candidate* result, which the engine then validates deterministically.
Today the only backend is the deterministic engine (RFC-0011). This RFC makes
an LLM (or any future model) a second implementation of the same contract —
**not the architecture, and never trusted**.

The RFC also defines **conformance**: the canonical `ExecutionPlan` fixtures
and the harness that prove any backend satisfies Athena's reasoning contract
exactly. Conformance is what makes "reasoning is testable" real, and it is
the gatekeeper RFC-0011's validator provides inside a single plan.

## Motivation

RFC-0009 defined the contract between Intent and Execution; RFC-0011 proved a
deterministic implementation. The next step is a model-backed implementation.
But a second reasoning implementation must never be allowed to degrade the
trust model:

- The LLM must not replace the validator — it only produces candidates.
- The LLM must not be a "second engine" — it is a backend behind one contract.
- The LLM's output must be **provably** equivalent (parity cases) or provably
  canonical (behavioral cases) — not inspected by eye.

## The Contract

A `ReasoningBackend` (lives in `@athena-os/reasoning`, the reasoning domain):

```ts
type ReasoningBackendResult =
  | { kind: 'executionPlan'; plan: ExecutionPlan }
  | { kind: 'clarificationRequired'; reason: string }
  | { kind: 'rejected'; reasons: string[] };

interface ReasoningBackend {
  readonly id: string;
  reason(intent: Intent, registry: CapabilityRegistry): ReasoningBackendResult;
}
```

Notes:

- The backend's `executionPlan` is a **candidate**. It is not final until the
  engine's validator accepts it (RFC-0011 §1.5, the authority). Simulation and
  Execution Graph construction remain engine-owned, deterministic stages.
- Ownership: the contract lives in `@athena-os/reasoning` (one concept, one
  canonical definition). `@athena-os/reasoning-backends` implements it.
- The backend owns the whole `Intent → candidate` journey, so a future backend
  may infer constraints, insert clarifications, or produce multi-goal plans
  without changing the rest of the engine.

## The Trust Boundary

```
Intent
   │
   ▼
ReasoningBackend            ← interchangeable (deterministic today, LLM later)
   │
   ▼
Candidate Plan             ← never bypassed; validator is the authority
   │
   ▼
Validator (RFC-0011 §1.5)
   │
   ▼
Simulation (advisory)
   │
   ▼
Execution Graph Builder
   │
   ▼
Execution
```

A backend is never allowed to:

- bypass the validator,
- skip simulation/execution graph generation,
- self-report its own plan as validated.

## Conformance

Two layers (each uses deep equality of the full `ReasoningBackendResult`, not
"contains the same goals"):

### 5.1 Parity Conformance

Proves multiple backends produce the same result when reasoning is
deterministic. The oracle is the frozen output of the RFC-0011 reference
backend — captured as canonical fixtures in
`packages/reasoning-backends/src/conformance/fixtures/parity.ts`:

- `open-settings` (single goal, single step)
- `reply-message` (target extraction: "reply to Alice")
- `photo-cleanup` (multi-goal, ordered plan)
- `launch-camera` (single goal, app launch)
- `toggle-dark-mode` (toggle verb)

An LLM backend conforms on `parity` when it reproduces these `ExecutionPlan`s
exactly.

### 5.2 Behavioral Conformance

For free-form intent where no deterministic baseline exists, the oracle is an
**authored canonical fixture**, not another backend:

```
flight-search   → "find me flights to Tokyo under $500"   → searchFlights plan
weekend-trip    → "plan a weekend trip to Kyoto"          → flights+hotel plan
```

These live in `packages/reasoning-backends/src/conformance/fixtures/behavioral.ts`
and define what conforming reasoning looks like: the LLM must reach the same
plan, or it does not conform.

### 5.3 The Harness

`packages/reasoning-backends/src/conformance/harness.ts` defines:

- `runScenario(backend, scenario)` → per-scenario result (deep equality).
- `runConformance(backend, scenarios)` → report for the whole suite.
- `runParity(a, b, scenarios)` → pairwise backend equality on `parity` cases.

## Reference Implementation

- Package: [`packages/reasoning-backends`](../../packages/reasoning-backends/README.md)
- Engine wiring lives in `packages/reasoning` (the engine's home).
- Module map:

| Concern | Module |
|---------|--------|
| ReasoningBackend contract | `@athena-os/reasoning/src/backend.ts` (owned here) |
| Engine wiring (ReasoningEngine, backend-agnostic) | `@athena-os/reasoning/src/engine.ts` |
| Deterministic candidate (stages 1–4) | `@athena-os/reasoning/src/deterministicBackend.ts` |
| Reference backend namespace | `deterministic/index.ts` (adopts the above) |
| Scenario type | `conformance/scenario.ts` |
| Harness (runScenario/runConformance/runParity) | `conformance/harness.ts` |
| Parity fixtures | `conformance/fixtures/parity.ts` |
| Behavioral fixtures | `conformance/fixtures/behavioral.ts` |

- Status of implementation: PR 1 (contract + conformance harness + fixtures)
  and PR 2 (backend integration) are landed. The engine's
  `ReasoningEngine` accepts any `ReasoningBackend`; the reference is
  `DeterministicReasoningBackend`, certified against the parity fixtures by
  `runConformance`. No model or API key is involved anywhere — the harness
  and fixtures are the entire contract (RFC-0012 staged implementation:
  PR 3 LLM backend remains).

## Conformance

An implementation conforms to this RFC when:

- It implements `ReasoningBackend` from `@athena-os/reasoning` (same
  interface, same result shape).
- Its `executionPlan` outputs are candidates: validated by the engine, never
  self-declared final.
- It passes every scenario in the parity fixtures with deep equality.
- It passes every authored behavioral fixture with deep equality.
- No case of "(LLM) produced plans are visually similar but not equal".

## Non-Goals (Explicitly Out of Scope)

- Defining a specific model, prompt, or API (a later PR / backend instance).
- Making the LLM the execution authority (validation stays authoritative).
- Adding Memory or Learning (later RFCs).
- Conformance to RFC-0011's internal stage contracts: the backend is tested
  through the engine's validator, not by re-implementing the stages.

## Future RFCs This Model Informs

- RFC-001 (LLM implementation of the backend, no architecture change).
- Memory RFCs (feeding context into `reason`).
- Learning RFCs (reliability evolution from observed outcomes).