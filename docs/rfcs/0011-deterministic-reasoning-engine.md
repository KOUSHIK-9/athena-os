# RFC-0011: The Deterministic Reasoning Engine

- Status: **Accepted**
- Reference Implementation: [`packages/reasoning`](../../packages/reasoning/README.md)
- Authors: Athena Core Team
- Created: 2026-08-07
- Depends on: RFC-0005 (Intent Model), RFC-0006 (Execution Plan Model),
  RFC-0007 (Constraint and Governance Model), RFC-0009 (The Contract Between
  Intent and Execution)

---

## Abstract

This RFC defines the **Deterministic Reasoning Engine** — the first reference
implementation of the RFC-0009 contract. It transforms an Intent into a
validated Execution Plan **without using an LLM**.

The engine is deliberately **not intelligent**. It is a pipeline of small,
independently replaceable stages, each with a narrow contract. Intelligence
may later be layered on top (RFC-0012, LLM Reasoning Backend) by swapping
individual stages — never by rewriting the architecture.

## Motivation

RFC-0009 defined the contract between Intent and Execution. A contract needs
an implementation to be validated. The deterministic engine is that
implementation: a minimal, auditable, fully testable path from Intent to
Execution Plan.

Why deterministic first?

- **It proves the architecture.** Every stage can be unit-tested against a
  fixed input with a fixed output. There is no stochasticity to explain away.
- **It is honest about its limits.** The engine never pretends to understand
  free-form language. When it cannot extract Goals, it asks for
  clarification (RFC-0009, Clarification Requests) instead of guessing.
- **It defines the seams.** Each stage boundary is a contract. A smarter
  stage (e.g., an LLM Goal Extractor) can replace a deterministic one later,
  behind the same interface.

## The Pipeline

```
Intent
   │
   ▼
Goal Extractor
   │
   ▼
Constraint Checker
   │
   ▼
Capability Matcher
   │
   ▼
Plan Builder
   │
   ▼
Plan Validator
   │
   ▼
Execution Plan
```

## 1. Stage Contracts

Every stage has one input, one output, and no side effects.

### 1.1 Goal Extractor

- **Input:** `Intent` (RFC-0005 §1)
- **Output:** `Goal[]` (RFC-0005 §2)
- **Contract:** Decomposes the Intent into verifiable Goals. The
  deterministic implementation reads structured Goals declared by the
  Intent, or maps simple verb/target phrases (e.g., `open` + `Settings`) to
  Goals via a fixed lexicon. It never invents Goals from ambiguous text.
- **Failure:** Returns zero Goals — the engine must request clarification.

### 1.2 Constraint Checker

- **Input:** `Goal[]`, `Constraint[]` (RFC-0005 §3)
- **Output:** Accepted Goals + Rejected Goals with reasons
- **Contract:** Filters Goals against the Intent's constraints (RFC-0007).
  The deterministic implementation applies exact-match forbid/allow rules on
  Goal kinds, with explicit `allow` overriding `forbid`.
- **Failure:** Any rejected Goal fails the Intent (RFC-0005 §2: all Goals
  must succeed).

### 1.3 Capability Matcher

- **Input:** Accepted `Goal[]`, `CapabilityRegistry`
- **Output:** Capability Candidates per Goal + Unmatched Goals
- **Contract:** Resolves each Goal to **every** capability that can satisfy
  it (RFC-0005 §8). The matcher never assumes uniqueness: a Goal may have
  zero, one, or many candidates (e.g. "Open Camera" → `launch_app` or
  `activate_existing_app`). Each candidate carries a reason explaining its
  selection. The matcher reasons over **Capability Descriptors** (what a
  capability *can do*), never over runtime Capability objects (how it
  *does it*). The engine must not know `driver.launch()`.
- **Selection is a separate act.** The deterministic engine selects the
  first candidate (registry order); a future Plan Optimizer may choose
  among candidates by preference. The matcher interface does not change.
- **Failure:** Unmatched Goals produce a Clarification Request.

### 1.4 Plan Builder

- **Input:** Intent id, Goal ↔ Capability bindings
- **Output:** `ExecutionPlan` (RFC-0006)
- **Contract:** Assembles plan Steps from explicit bindings, ordered by
  binding order. The builder performs **construction only** — no selection,
  no optimization, no search. One sequential Step per binding.

### 1.5 Plan Validator

- **Input:** `ExecutionPlan`, `CapabilityRegistry`
- **Output:** Diagnostics — `valid`, `errors`, `warnings`, `suggestions`,
  and a `trace` of the checks that ran
- **Contract:** The validator behaves like a compiler: it reports, it never
  mutates. It enforces the RFC-0006 Plan Invariants structurally (non-empty
  Steps, registered Capabilities, unique Step ids, valid `dependsOn`
  references, acyclic graph) and may warn (e.g. dependencies on
  later-declared Steps) or suggest (e.g. transitive dependencies) without
  affecting validity.
- **Phased design:** `structural` validation runs today; a `semantic` phase
  (RFC-0006 §4–§8, RFC-0007 constraint compliance, RFC-0008 decision
  points, RFC-0009 reasoning guarantees) is the open door — mirroring a
  compiler's parse-then-type-check split. Not yet implemented.
- **Authority:** an invalid plan never leaves the engine, regardless of
  which stage produced it.

## 2. Determinism Guarantees

1. **Same input, same output.** Identical `Intent` + `CapabilityRegistry`
   always produce the identical `ExecutionPlan`.
2. **No hidden state.** Stages hold no memory across calls.
3. **No external calls.** The engine performs no I/O: no LLM, no network,
   no device access. It reasons over the Intent and the Registry only.
4. **Auditable.** Every decision is a simple rule that can be traced in
   code and exercised by a unit test.

## 3. The Clarification Seam

The deterministic engine may produce one of three results (RFC-0009,
Reasoning Result):

| Result | Meaning | Consumer |
|--------|---------|----------|
| `executionPlan` | A validated plan | Execution platform |
| `clarificationRequired` | Goals missing or unmatched to a Capability | Human (refinement) or RFC-0012 |
| `rejected` | A Goal was forbidden by a Constraint, or the plan is invalid | Human |

`clarificationRequired` is the RFC-0012 seam: a future LLM backend can
absorb the same Intent and produce Goals the deterministic lexicon cannot.

## 4. Reference Implementation

- Package: [`packages/reasoning`](../../packages/reasoning/README.md)
- Module mapping (one-to-one with this RFC):

| Stage | Module | Interface |
|-------|--------|-----------|
| Goal Extractor | `goalExtractor.ts` | `GoalExtractor` |
| Constraint Checker | `constraintChecker.ts` | `ConstraintChecker` |
| Capability Matcher | `capabilityMatcher.ts` | `CapabilityMatcher` |
| Plan Builder | `planBuilder.ts` | `PlanBuilder` |
| Plan Validator | `validator.ts` | `PlanValidator` |
| Orchestration | `engine.ts` | `DeterministicReasoningEngine` |

- Contracts (Intent, Goal, Constraint, Capability Descriptor, Execution
  Plan) live in `packages/core/src/contract.ts` — the reasoning package
  consumes them; it does not re-define them (Engineering Principle #5).
- Executable specification: `packages/reasoning/examples/` — one file per
  end-to-end scenario through the entire pipeline.

## 5. Conformance

An implementation conforms to this RFC when:

- It produces `executionPlan` only after the Plan Validator accepts the plan.
- It returns `clarificationRequired` when Goals are absent or unmatched.
- It returns `rejected` with reasons when a Goal is forbidden.
- It never performs I/O or consults a model.
- Any stage can be replaced behind its interface without changing the other
  stages or the engine's orchestration.

## 6. Non-Goals (Explicitly Out of Scope)

- Free-form language understanding (RFC-0012).
- Planning with alternatives or preferences (RFC-0007 soft constraints are
  not evaluated).
- Recovery strategies and partial success planning (RFC-0005, Recovery).
- Decision Points and the Decision Point Protocol (RFC-0008) — handled
  during execution.
- Memory, learning, and personalization (future RFCs).

## 7. Future RFCs This Model Informs

- **RFC-0012 — LLM Reasoning Backend:** replaces selected stages (likely
  the Goal Extractor) behind the same interfaces; the Plan Validator
  remains the authority.
- **Memory RFCs:** supply Context to earlier stages.
- **Learning RFCs:** refine the Capability Matcher's choices.
