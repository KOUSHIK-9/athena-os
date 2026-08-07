# RFC-0009: The Contract Between Intent and Execution

- Status: **Accepted**
- Authors: Athena Core Team
- Created: 2026-08-07
- Depends on: RFC-0005 (Intent Model), RFC-0006 (Execution Plan Model),
  RFC-0007 (Constraint and Governance Model), RFC-0008 (Decision Point Protocol)

---

## Abstract

This RFC defines the **Contract Between Intent and Execution** — the permanent
interface that transforms a human's Intent into a validated, executable
Execution Plan.

The Reasoning Engine is **one implementation** of this contract. GPT, Claude,
a classical planner, a rules engine, a human author, or a future model are all
interchangeable backends. The contract is the durable artifact; the engines
are replaceable. (Engineering Principle #11: one canonical definition.)

This RFC answers exactly four questions:

1. What are the **inputs**?
2. What is the **output**?
3. What are the **guarantees**?
4. What are the **failure modes**?

It does not describe any specific engine, algorithm, prompt, or model.

---

## Motivation

Everything above this contract (reasoning engines, models, planning
strategies) may evolve. Everything below it (execution platform, capabilities,
devices) may evolve. The contract itself must remain stable — it is what makes
reasoning swappable without touching execution, and vice versa.

If the contract is well-defined:

- Any reasoning backend can be substituted without changing the execution
  platform.
- Plans produced by different engines are interchangeable artifacts
  (RFC-0006, Portability).
- Validation is uniform: the same validity rules apply to a plan from GPT or
  from a hand-authored workflow editor.
- Failure analysis is uniform: reasoning failures are distinguishable from
  execution failures.

---

## 1. Inputs

The contract accepts the following information. None are optional except
those marked as such.

| Input | Definition (RFC) | Required? | Notes |
|-------|------------------|-----------|-------|
| **Intent** | The human's declared desire (RFC-0005 §1). | Always | The only purely human-supplied input. |
| **Goals** | Decomposed, verifiable sub-outcomes (RFC-0005 §2). May be inferred by the engine or supplied by the caller. | Always (final set) | The contract guarantees Goals are addressed (see Guarantees). |
| **Constraints** | Boundary conditions (RFC-0005 §3, RFC-0007). | Optional (0..n) | Includes hard, soft, safety, temporal, resource constraints. |
| **Context** | Ambient observed state (RFC-0005 §4). | Optional | Consumed read-only; never modified. |
| **Resources** | External dependencies (RFC-0005 §5). | Optional (0..n) | Access governed by RFC-0007 policies. |
| **Trigger** | Initiation condition (RFC-0005 §6). | Optional (0..1) | Attached to the Intent; not part of the plan. |
| **Capability Registry** | The set of available Capabilities (RFC-0004). | Always | The engine may only compose these; it never invents new ones. |
| **Environment** | Ambient technical state (device, connectivity, drivers, permissions). | Always | Supplies what Context captures at the platform level. |

**Input invariants:**
- The contract receives an **Intent**, never a prompt, never a pre-built plan
  (a pre-built plan may be *supplied as* the Intent's plan via the direct
  authoring path, but it is then validated under the same rules).
- Context is read-only for the contract; the contract does not mutate it.

---

## 2. Outputs

The contract produces exactly one result:

### Reasoning Result

```
Reasoning Result
├── Execution Plan        (validated under RFC-0006)
├── Confidence            (0.0 – 1.0)
├── Assumptions           (declared, human-reviewable)
├── Alternatives          (valid alternative plans, optional)
└── Clarification Requests (questions to the human, optional)
```

| Field | Description |
|-------|-------------|
| **Execution Plan** | The validated plan artifact (RFC-0006). This is the *only* output consumed by the execution platform. |
| **Confidence** | The engine's estimate that the plan will satisfy the Intent, given current Context and Constraints. Not a substitute for Verification (RFC-0002/0004) — Verification remains the platform's authority on success. |
| **Assumptions** | Declarations the engine made without evidence (e.g., "Assumed 'John' refers to your contact John Smith"). Must be human-reviewable before execution. |
| **Alternatives** | Optional set of equally valid plans (Pareto-optimal per RFC-0007), when the engine found more than one. |
| **Clarification Requests** | Optional questions to the human about unresolved Intent ambiguity. Each is either satisfied before execution (Intent refinement) or becomes a Decision Point (RFC-0008). If unanswered, the engine may not proceed (or falls back to a declared assumption with reduced Confidence). |

**Output invariants:**
- The Execution Plan is the **only** artifact that flows to the execution
  platform.
- The plan is valid under RFC-0006 before it is returned (the contract
  includes validation, not just generation).
- No prompt, token, or model-specific artifact leaves the contract.

---

## 3. Guarantees

The contract guarantees, for every Reasoning Result it returns:

| # | Guarantee | Source |
|---|-----------|--------|
| 1 | Every Goal is **addressed** by at least one plan node. | RFC-0006, Goal Coverage Validity. |
| 2 | Every **mandatory Constraint** is satisfied or **explicitly escalated** to a Decision Point. | RFC-0007. |
| 3 | Every **Resource dependency** is declared in the plan's Capability metadata. | RFC-0005 §5. |
| 4 | Every **Decision Point** is explicit in the plan. | RFC-0006 §Decision Point. |
| 5 | The plan is **valid** under all RFC-0006 Validity Rules. | RFC-0006 §Validity Rules. |
| 6 | No plan node invents a Capability outside the Registry. | RFC-0004. |
| 7 | **Assumptions** are declared, not hidden. | This RFC, §2. |
| 8 | The plan is **portable** (no environment-specific assumptions embedded). | RFC-0006 §Portability. |

If any guarantee cannot be met, the contract must **fail** (Failure Modes)
rather than return a degraded plan.

---

## 4. Failure Modes

Reasoning failures are distinct from execution failures. They occur *before*
execution begins, and they are classified:

| Failure Mode | Description | Contract Response |
|--------------|-------------|-------------------|
| **No Valid Plan Exists** | The space of possible plans is empty under the Constraints. | `ReasoningResult` with `plan = null`, a cause, and the conflicting Constraints (RFC-0007 Conflict Resolution). |
| **Constraint Conflict** | Declared Constraints cannot all hold simultaneously. | Escalate: return conflict report; the caller resolves (relax, renegotiate, or reject) per RFC-0007. |
| **Missing Capabilities** | The Registry lacks a Capability required to satisfy a Goal. | `plan = null`, cause = missing capability list; caller may add Capabilities and retry. |
| **Ambiguous Intent** | Intent is underspecified and no reasonable default exists. | Return `Clarification Requests`; optionally ask the human (this may raise a Decision Point before any plan exists). |
| **Insufficient Context** | Required Context is missing to make a safe plan decision. | `plan = null`, cause = missing Context; caller gathers and retries. |
| **Unknown / Unclassified** | Failure outside the above categories. | `plan = null`, cause = `unclassified`; always auditable (the failure itself must be observable). |

**Invariants:**
- Every failure produces a **structured, auditable Reasoning Result** — never a
  silent error, never a partial plan.
- Every failure is distinguishable from an execution failure (execution
  failures are classified by RFC-0005 §Recovery, RFC-0006 §Lifecycle).
- Retrying after a fix (new Constraints, new Context, new Capability) is
  explicit, never automatic (avoids loops).

---

## The Contract as a Boundary

```
Intent, Goals, Constraints, Context, Resources, Trigger
Registry, Environment
        │
        ▼
┌──────────────────────────────────┐
│  THE CONTRACT (RFC-0009)        │
│  Inputs → Reasoning →           │
│  Validation → Reasoning Result  │
└──────────────────────────────────┘
        │
        ▼
   Execution Plan
        │
        ▼
   Execution Platform (RFC-0006 engine, Capabilities, Verification)
```

- The contract **never** touches the device, the driver, or the UI.
- The contract **never** runs Actions, retries, or verifications (RFC-0005 §7
  — that is the execution layer).
- The contract **may** raise a Decision Point before a plan exists (Intent
  ambiguity), but the approval gate behavior is RFC-0008.

---

## Conformance

A system conforms to the Contract iff:

1. It accepts the Inputs defined in §1 and returns a Reasoning Result (§2).
2. It returns a valid Execution Plan under RFC-0006, or a classified
   reasoning failure — never anything else.
3. It honors all Guarantees (§3), or fails (§4) rather than degrading.
4. It never executes, never invents Capabilities, never embeds environment
   specifics into plans.
5. Its Reasoning Result is auditable: the failure, the assumptions, and the
   confidence are recorded as evidence.

---

## Non-Goals (Explicitly Out of Scope)

- The internal algorithm of any Reasoning Engine (rules, search, LLM, HTN).
- Prompts, tokens, model APIs.
- Plan serialization (RFC-0006 references; format is implementation).
- Execution, verification, retry, telemetry (RFC-0001/0004/0005 §Recovery).
- Approval UI (RFC-0008 references; presentation is implementation).
- Learning/memory — future milestone; the contract must not depend on it.

---

## Future RFCs This Model Informs

- **RFC-0010 (future): Capability Registry & Plan Validation Service** —
  the platform-side validator that both engines and direct plan authors use.
- **RFC-0011 (future): Deterministic Reasoning Engine** — first implementation
  of this contract (rules/HTN, no LLM).
- **RFC-0012 (future): Model Reasoning Engine (GPT/Claude)** — second
  implementation, proving interchangeability.

---

## Appendix: Glossary (Additions to RFC-0005..0008)

| Term | One-Line Definition |
|------|---------------------|
| **Contract Between Intent and Execution** | The permanent interface (inputs, output, guarantees, failures) defined in this RFC. |
| **Reasoning Result** | The structured output: Execution Plan + Confidence + Assumptions + Alternatives + Clarification Requests. |
| **Reasoning Failure** | A classified failure to produce a valid plan (no plan, conflict, missing capability, ambiguity, insufficient context). |
| **Reasoning Engine** | Any implementation of the contract (rules engine, LLM, human author, workflow editor). |
| **Direct Plan Author** | A human or external tool producing a plan artifact; must still be validated under the contract's guarantees. |

---

*End of RFC-0009 (Draft)*