# Milestone 4 — Deterministic Reasoning Engine

- Version: `v0.4.0-alpha.1`
- Commit: `4195b8b` (`feat(reasoning): implement execution graph builder as final pipeline stage`)
- Date: 2026-08-07
- Depends on: Milestone 3 (`4f3551c`, RFC-0005..0009 Accepted)
- Status: **Baseline Established**

## Summary

Milestone 4 established Athena's **deterministic cognitive pipeline**: a
working reference implementation that transforms `Intent → Execution Plan →
Execution Graph` with **no AI model anywhere in the path**. RFC-0011 is fully
implemented — this is the second major engineering baseline of Athena, in the
same class as the Milestone 2 execution platform.

This is the milestone where Athena stopped being a protocol on paper and
became a **reasoning platform**: a deterministic core that speaks the RFC-0009
contract, with model backends as future interchangeable implementations.

## Identity

> **The LLM is not the architecture. It is one implementation of one stage.**

```
User / GPT
     ↓
Reasoning Contract (RFC-0009)
     ↓
Deterministic Pipeline
     ↓
Validator (authority)
     ↓
Simulation (advisory)
     ↓
Execution Graph
     ↓
Execution Engine
```

## Deliverables

- **RFC-0011: Deterministic Reasoning Engine (Implemented)** — seven-stage
  pipeline: Goal Extractor, Constraint Checker, Capability Matcher,
  Plan Builder, Plan Validator, Simulation, Execution Graph Builder.
- **`packages/reasoning` (reference implementation)** — one module per stage,
  each replaceable behind its interface; orchestrated by
  `DeterministicReasoningEngine.reason(intent, environment)`. Contracts live
  in `packages/core/src/contract.ts` (Principle #5).
- **Compiler-like Plan Validator** — `valid/errors/warnings/suggestions/trace`
  diagnostics, `structural`/`semantic` phase seam, never mutates.
- **Deterministic Simulator** — per-step outcome prediction
  (`success`/`likely_success`/`likely_failure`/`failure`/`unknown`) from
  declared `availability`, `requiresResources`, `reliability`; advisory only,
  never blocking (validator stays the authority).
- **Execution Graph Builder** — topological order, per-step levels,
  `parallelSets` (dependency-derived concurrency), explicit edges. Boring by
  design: no optimize, no simulate, no validate, no execute.
- **Executable specification** — `packages/reasoning/examples/`: 9 end-to-end
  scenarios (open-settings, reply-message, flight-search clarification seam,
  photo-cleanup multi-goal, guarded-message safety constraints, open-camera
  candidate selection, validator diagnostics, network-check simulation,
  execution-graph).
- **Test suite:** 64 reasoning tests / 17 test files; full workspace 20/20
  test tasks, 18 typechecks, lint PASS, `scripts/architecture-check.mjs` PASS
  (`@athena-os/reasoning` registered at layer 1, Appium-forbidden).
- **Documentation:** RFC-0011 (Status: **Implemented** in the RFC index),
  `docs/reference-implementations/RFC-0011.md` (implementation guide with
  per-stage design decisions/limitations/extensions), Engineering
  Principle #13 ratified (implementation RFCs include a Reference
  Implementation section).

## Decisions

- **Validation is authoritative; simulation is advisory.** An invalid plan
  never leaves the engine; simulation reports `blocked`/`warnings` but never
  rejects (RFC-0008 belongs to execution).
- **Selection is a separate act.** The matcher returns all candidates with
  reasons; `selectCapabilities` picks the first — the Plan Optimizer seam.
- **Diagnostics, not pass/fail.** The validator reports *why* (codes,
  messages, phase), making Athena explainable.
- **Stage naming describes the output:** Execution Graph Builder (not
  "Router") — it builds the graph the plan already declares; it never invents
  parallelism.
- **The LLM, when it arrives, implements RFC-0009 exactly** — it replaces
  selected stages behind the same interfaces; validation, simulation, and
  execution graph generation are never bypassed.

## Lessons Learned

- Example scenarios pay off: behavioral bugs (target extraction, Map-collapse
  hiding duplicate step ids) surfaced first in `examples/`, not unit tests.
- Honesty beats optimism in prediction: undeclared reliability predicts
  `unknown`, not success — trust is earned from declared facts.
- Keep stages boring: the graph builder reports exactly what the plan
  declares (a serial plan yields one step per level), which keeps each stage
  simple enough to prove correct.
- Loosely-typed fixtures bypass zod defaults at runtime; consumers must
  guard against absent optional fields (`requiresResources ?? []`).

## Remaining Debt (Non-Blocking)

- `semantic` validation phase (RFC-0006 §4–§8, RFC-0007, RFC-0008, RFC-0009)
  declared but unimplemented — the open door in the validator.
- Multi-verb phrase extraction and capability parameter/schema validation not
  yet implemented.
- Plan Optimizer stage (soft constraints → preferred orderings) — separate
  stage, never inside Plan Builder.
- RFC-0003 (Planner, Draft) superseded by RFC-0005/0011; not yet rewritten.

## What Comes Next

- **RFC-0012 — LLM Reasoning Backend:** the LLM replaces the Goal Extractor
  behind its interface; the validator remains the authority. GPT is never
  trusted, only validated. (Beginning: model output → same validator.)
- **Memory:** persistent user memory, recurring-intent templates, learned
  preferences (governed by RFC-0007).
- **Learning:** telemetry becomes optimization — capability `reliability`
  evolves from observed outcomes instead of static declaration.
- **Multi-Agent:** the same reasoning contract targets iPhone, Browser,
  macOS, Slack, Gmail, Calendar, Filesystem — without changing the engine.

## What a Baseline Means Here

Per Engineering Principle #10: this milestone is a **dependency, not a
redesign target**. RFC-0011 is Implemented; future work (RFC-0012, Memory,
Learning, Multi-Agent) builds on the pipeline and its contracts. Changing the
reasoning contract requires a deliberate, versioned decision.

> **Deterministic Cognition Baseline Established.**
