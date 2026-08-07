# @athena-os/reasoning

Implements:
RFC-0011 — Deterministic Reasoning Engine
RFC-0012 — Reasoning Backend Contract (the `ReasoningBackend` interface)

Purpose:
Transforms Intent into a validated Execution Plan without using an LLM, and
defines the contract that makes reasoning backend-interchangeable.

## Pipeline

```
Intent
   │
   ▼
ReasoningBackend           ← the candidate producer (RFC-0012)
   │                         today: DeterministicReasoningBackend
   ▼                          future: any backend behind this contract
Candidate Plan
   │
   ▼
Plan Validator             ← the authority (RFC-0011 §1.5)
   │
   ▼
Simulation
   │
   ▼
Execution Graph Builder
   │
   ▼
Execution Plan (+ Simulation + Graph)
```

The engine (`engine.ts`) is backend-agnostic. `ReasoningEngine` accepts any
`ReasoningBackend`, validates/simulates/graphs its candidate, and never
re-plans. `DeterministicReasoningEngine` is the RFC-0011 reference
composition: `ReasoningEngine` wired with `DeterministicReasoningBackend`
(the deterministic candidate protocol — goal extraction → constraint
checking → capability matching → plan building) plus the engine-owned
stages. A future LLM backend (RFC-0012, implemented in
`@athena-os/reasoning-backends`) can be injected behind the same interface
without touching anything here.
