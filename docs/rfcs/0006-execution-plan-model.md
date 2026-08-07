# RFC-0006: Execution Plan Model

- Status: **Accepted**
- Authors: Athena Core Team
- Created: 2026-08-07
- Depends on: RFC-0004 (Capability Paradigm), RFC-0005 (Intent Model)

---

## Abstract

This RFC defines the **Execution Plan Model** — the grammar of Athena's language.
Where RFC-0005 established the vocabulary (nouns), this RFC establishes the
validity rules, relationships, and lifecycle (verbs) that govern how those nouns
interact.

An Execution Plan is a portable artifact. It can be produced by any Reasoning
Engine (GPT, classical planner, human author, rules engine, workflow editor)
or by another application. Its validity depends *only* on its internal structure
and conformance to this model — not on its provenance.

---

## Motivation

The Execution Plan is the **stable contract** between reasoning and execution:

```
Intent
  │
  ▼
Reasoning Engine  (any implementation)
  │
  ▼
Execution Plan  ◄─── stable interface ───►
  │
  ▼
Execution Engine  (deterministic, verified)
  │
  ▼
Device
```

Everything above the plan can evolve (new models, new reasoning algorithms).
Everything below the plan can evolve (new capabilities, new devices, new
drivers). The plan itself remains the interface.

For this to work, "valid Execution Plan" must have a precise, implementation-
independent definition.

---

## Ontology vs. Protocol (Recap from RFC-0005)

| Ontology (Nouns) | Protocol (Verbs / Relationships) |
|------------------|----------------------------------|
| Intent | Intent **decomposes into** Goals |
| Goal | Goals **constrained by** Constraints |
| Constraint | Goals + Constraints **planned as** Execution Plan |
| Context | Plans **consume** Context (read-only) |
| Resource | Plans **declare** Resource dependencies |
| Trigger | Plans **initiated by** Trigger (metadata) |
| Execution Plan | Plan **composed of** Capability invocations |
| Capability | Capability invocations **executed as** Actions |
| Action | Actions **produce** Results + Verification + Telemetry |
| Decision Point | Decision Points **gate** Plan Segments |
| Result | |
| Plan Segment | |

This RFC formalizes the Protocol column.

---

## Core Definitions

### Execution Plan

**Definition:** A directed acyclic graph (DAG) where every node is a **Capability
invocation** with concrete parameters, and edges represent **data dependencies**
and **control flow**.

**Required properties:**
1. **Well-formed DAG:** No cycles. Every node reachable from at least one
   entry point.
2. **Capability-bound:** Every node references a Capability from the registry
   (RFC-0004). No node represents reasoning, LLM calls, or "thinking."
3. **Parameter-complete:** Every required parameter of every Capability is
   bound to either a constant, a data dependency (output of another node), or
   a runtime value resolved by the Execution Engine.
4. **Typed data flow:** Output schema of each node matches input schema of
   dependent nodes (structural typing).
5. **Segmented by Decision Points:** The DAG is partitioned into **Plan
   Segments** by Decision Point nodes. Execution pauses at each Decision Point
   until approval is granted.

**Relationship to RFC-0005 concepts:**
- An Execution Plan **consumes Context** (read-only) during planning; Context
  does not appear in the plan itself.
- An Execution Plan **declares Resource dependencies** via Capability metadata
  (RFC-0005 §5); Governance (RFC-0007) enforces access policies.
- An Execution Plan **may be initiated by a Trigger** (RFC-0005 §6); Triggers
  are metadata attached to the Intent, not part of the plan DAG.

### Plan Segment

**Definition:** A maximal subgraph of the Execution Plan containing no Decision
Point nodes, bounded by Decision Points (or plan entry/exit).

**Properties:**
- A Plan Segment executes atomically with respect to approval — once a
  Decision Point is passed, the entire segment runs to completion (or failure)
  without further approval gates.
- Segments may contain multiple Capability invocations in sequence or parallel
  (DAG structure).
- A segment may be a single Action.

### Decision Point

**Definition:** A special node in the Execution Plan that halts execution until
an approval authority grants consent.

**Required properties:**
- **Explicit scope:** The Decision Point declares which Plan Segment(s) it
  gates.
- **Typed approval request:** Contains structured data describing what is being
  approved (e.g., `{ type: "financial", amount: 2500, currency: "INR" }`).
- **Authority binding:** Declares the required approval authority (human,
  policy engine, role).
- **Timeout policy:** Specifies max wait time; expiry = denial.
- **Audit fields:** Request timestamp, context snapshot, correlating requestId.

---

## Plan Identity

An Execution Plan is a **living artifact**. It has an identity independent of
its content, enabling versioning, lineage, and resumption.

**Required identity fields:**
- `planId`: Globally unique identifier (UUIDv7 or equivalent).
- `revision`: Monotonically increasing integer; `1` for initial creation.
- `createdBy`: Identity of the author (Reasoning Engine ID, human user ID,
  external system ID).
- `derivedFromIntent`: The `intentId` this plan was generated to satisfy.
- `createdAt`: Timestamp of initial creation (RFC 3339).
- `updatedAt`: Timestamp of last revision.
- `parentPlanId` (optional): If this plan was derived from another (e.g.,
  after an Intent modification), the parent plan's `planId`.

**Properties:**
- Two plans with the same `planId` but different `revision` represent the same
  logical plan at different points in its evolution.
- A plan may be **revised** (new revision, same `planId`) when the Intent
  changes, Constraints change, or recovery produces a new plan structure.
- The Execution Engine may resume a revised plan from the last completed
  Action, provided data dependencies are satisfied.

---

## Plan Invariants (Mathematical Properties)

These are not implementation checks — they are mathematical properties that
**every valid Execution Plan must satisfy by definition**. A plan that violates
any invariant is not an Execution Plan.

| Invariant | Formal Statement |
|-----------|------------------|
| **Acyclicity** | The plan graph contains no directed cycles. |
| **Goal Coverage** | ∀ Goal ∈ Intent.Goals: ∃ node ∈ Plan.Nodes where node contributes to Goal. |
| **Constraint Satisfaction** | Plan satisfies all hard Constraints; soft Constraints evaluated; safety Constraints never violated. |
| **Decision Point Completeness** | Every Plan Segment is gated by at most one Decision Point; every Decision Point gates ≥1 Segment. |
| **Termination** | Every maximal path in the DAG reaches an exit node (no infinite paths). |
| **Data Flow Closure** | ∀ node ∈ Plan.Nodes: all required inputs are bound to constants, upstream node outputs, or runtime-resolvable references. |
| **Capability Existence** | ∀ node ∈ Plan.Nodes: node.capabilityId ∈ CapabilityRegistry. |
| **Recovery Well-Formedness** | Every declared recovery sub-plan is itself a valid Execution Plan (recursive). |
| **Deterministic Trace** | Given fixed registry, bindings, and initial environment, the sequence of Actions and their Verifications is unique. |

These invariants are the **definition** of validity. The Validity Rules (§
Validity Rules) are the algorithmic checks that verify these invariants hold.

---

## Validity Rules (The Grammar)

An Execution Plan is **valid** iff all of the following hold:

### 1. Structural Validity
- The graph is a DAG (no cycles).
- Every node has a unique identifier within the plan.
- Entry points (nodes with no incoming edges) are explicitly marked.
- Exit points (nodes with no outgoing edges) are implicitly the plan's
  terminal outcomes.

### 2. Capability Validity
- Every node's `capabilityId` exists in the Capability Registry at plan
  creation time.
- Every node's parameters satisfy the Capability's input schema (validated
  statically at plan creation).

### 3. Data Flow Validity
- For every edge `A → B`, the output type of `A` is compatible with the input
  type of `B` (structural subtyping).
- No node reads a value before it is produced (topological order respected).
- All required inputs of every node are bound (no unbound required parameters).

### 4. Goal Coverage Validity
- For every Goal in the originating Intent, there exists at least one node in
  the plan whose verified post-condition contributes to satisfying that Goal.
- The mapping from Goals → contributing nodes is explicit in the plan metadata.

### 5. Constraint Satisfaction Validity
- The plan as a whole satisfies all declared Constraints (hard constraints
  must hold; soft constraints are evaluated with weights; safety constraints
  are non-negotiable).
- Constraint checking is a static analysis pass over the plan structure and
  parameter values — it does not require execution.

### 6. Decision Point Validity
- Every Decision Point gates a non-empty Plan Segment.
- No two Decision Points gate overlapping segments (segments form a partition
  of the plan).
- Every Decision Point has a declared timeout and authority.

### 7. Recovery Validity
- For every node, if the plan declares a recovery strategy, that strategy is
  itself a valid sub-plan (recursively valid).
- Fallback branches rejoin the main plan at a well-defined merge point (or
  terminate the plan).
- Compensating actions are declared for any node whose partial execution
  leaves reversible side effects.

### 8. Determinism Validity
- Given the same Capability Registry, same parameter bindings, and same
  runtime environment state, the plan's execution trace (sequence of Actions,
  their Results, Verifications) is deterministic.
- Non-determinism (e.g., Capability-level probabilistic success) is explicitly
  annotated with confidence bounds, not hidden.

---

## Lifecycle States

An Execution Plan progresses through these states:

| State | Description | Transitions |
|-------|-------------|-------------|
| **Draft** | Plan created, not yet validated. | → `Validated` (on validation pass) |
| **Validated** | All validity rules pass. Plan is executable. | → `Approved` (all Decision Points pre-approved) or `PendingApproval` |
| **PendingApproval** | Awaiting approval at first Decision Point. | → `Executing` (approval granted) or `Rejected` (denied/timeout) |
| **Executing** | Execution Engine is running Actions. | → `Paused` (at Decision Point), `Waiting` (external event), `Completed`, `Failed` |
| **Waiting** | Paused for an external event (email arrival, download completion, scheduled time, GPS fix, user input) — not a Decision Point. | → `Executing` (event occurred), `Failed` (timeout), `Cancelled` |
| **Completed** | All Actions verified successfully; all Goals satisfied. | Terminal |
| **Paused** | Stopped at a Decision Point, awaiting approval. | → `Executing` (approval granted), `Rejected` (denied/timeout) |
| **Failed** | Unrecoverable failure (no fallback, compensation failed, or Goal unsatisfied). | Terminal |
| **PartiallyCompleted** | Some Goals satisfied; others failed with compensating actions completed. | Terminal (human review required) |
| **Cancelled** | Explicitly terminated by authority before/during execution. | Terminal |

**State invariants:**
- A plan never transitions from a terminal state.
- `Executing` → `Paused` only at Decision Points.
- `Executing` → `Waiting` only when an Action explicitly declares a wait condition with a timeout.
- `Waiting` → `Executing` only when the declared condition is satisfied.
- `Failed` implies at least one Goal is unsatisfied with no remaining recovery.
- `PartiallyCompleted` implies at least one Goal satisfied and at least one Goal failed with compensation executed.

---

## Branching, Merging, and Parallelism

### Branching (Conditional Execution)
- A node may have multiple outgoing edges with **guards** (predicates on the
  node's Result).
- Exactly one guard must evaluate true at runtime (mutually exclusive,
  exhaustive).
- Guard evaluation happens in the Execution Engine after the node's
  Verification.

### Merging (Convergence)
- Multiple nodes may feed into a single downstream node.
- The downstream node executes when all its upstream dependencies have
  completed (verified).
- Merge points are explicit in the DAG structure.

### Parallelism
- Nodes with no data/control dependency between them may execute in parallel.
- The Execution Engine determines parallelism from the DAG topology; the plan
  does not prescribe scheduling.

---

## Progress Measurement

Progress is defined at the **Goal level**, not the Action level.

- **Goal progress:** `0%` (not started), `100%` (verified satisfied). No
  intermediate percentages — a Goal is satisfied when its success criterion
  is verified.
- **Plan progress:** `satisfied_goals / total_goals`.
- **Segment progress:** `completed_actions_in_segment / total_actions_in_segment`
  (for observability during execution).

This avoids the illusion of precision that action-level percentages create.

---

## Portability

An Execution Plan is **portable** iff:

1. It references Capabilities only by stable identifier (`capabilityId` +
   version), not by implementation details.
2. All parameter values are either constants, data dependencies, or
   runtime-resolvable references (e.g., `"{{device.currentApp}}"`).
3. No node embeds environment-specific assumptions (hardcoded coordinates,
   device IDs, session tokens).
4. The plan declares its required Capability Registry version range.

A portable plan can be:
- Authored by a human in a visual editor.
- Generated by GPT, Claude, or any LLM.
- Produced by a classical planner (STRIPS, HTN, etc.).
- Exported from one Athena instance and imported into another (different
  device, different driver, different Reasoning Engine).
- Versioned, diffed, and reviewed in Git.

---

## Non-Goals (Explicitly Out of Scope)

- Serialization format (JSON, protobuf, etc.) — that is an implementation
  detail of the SDK/storage layer.
- How the Reasoning Engine produces the plan — that is RFC-0009.
- The Constraint language syntax — that is RFC-0007 (Constraint and Governance Model).
- The Decision Point wire protocol — that is RFC-0008.
- The Execution Engine's scheduling algorithm — that is an implementation
  detail.

---

## Conformance

A system conforms to the Execution Plan Model iff:

1. Every plan it accepts for execution passes all **Validity Rules** (§ Validity
   Rules).
2. The plan's lifecycle follows the **State Machine** (§ Lifecycle States).
3. Execution respects **Plan Segments** and **Decision Points** — no Action in
   a segment executes before its gating Decision Point is approved.
4. Progress is reported at the **Goal level** (§ Progress Measurement).
5. The plan can be exported/imported without loss of validity (portability).

---

## Future RFCs This Model Informs

- **RFC-0007: Constraint and Governance Model** — formal syntax for Constraints,
  conflict detection, resolution strategies; approval authority, safety policies, organizational rules.
- **RFC-0008: Decision Point Protocol** — approval request/response format,
  timeout semantics, audit log schema.
- **RFC-0009: Reasoning Engine Interface** — contract: (Intent, Goals,
  Constraints, CapabilityRegistry) → Execution Plan.

---

## Appendix: Normative Glossary (Additions to RFC-0005)

| Term | One-Line Definition |
|------|---------------------|
| **Execution Plan** | A DAG of Capability invocations with data/control flow, segmented by Decision Points, satisfying all Validity Rules. |
| **Plan Segment** | A maximal subgraph containing no Decision Points; executes atomically with respect to approval. |
| **Decision Point** | A plan node that halts execution until an approval authority grants consent for the gated segment(s). |
| **Guard** | A predicate on a node's Result that selects which outgoing edge to follow (branching). |
| **Merge Point** | A node with multiple incoming edges; executes when all upstream dependencies complete. |
| **Portable Plan** | A plan referencing only stable Capability IDs, with no environment-specific assumptions. |
| **Plan Validity** | Conformance to all 8 validity rule categories (structural, capability, data flow, goal coverage, constraint, decision point, recovery, determinism). |
| **Waiting** | A lifecycle state where execution pauses for an external event (not a Decision Point); resumes when the event occurs or times out. |
| **Plan Identity** | The immutable identifier (`planId` + `revision`) and lineage metadata (`createdBy`, `derivedFromIntent`, `parentPlanId`) that make a plan a living, versionable artifact. |
| **Plan Invariants** | Mathematical properties that define what it means for an Execution Plan to be valid (acyclicity, goal coverage, constraint satisfaction, termination, etc.). |
| **Context** | Defined in RFC-0005 §4; consumed read-only by plans during planning. |
| **Resource** | Defined in RFC-0005 §5; declared as dependencies in plan Capability metadata. |
| **Trigger** | Defined in RFC-0005 §6; initiates plan generation; not part of the plan DAG. |

---

*End of RFC-0006 (Draft)*