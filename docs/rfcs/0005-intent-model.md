# RFC-0005: Intent Model

- Status: **Accepted**
- Authors: Athena Core Team
- Created: 2026-08-07
- Supersedes: RFC-0003 (Planner)

---

## Abstract

This RFC defines the **Intent Model** — the conceptual vocabulary that describes
how human intent flows through Athena. It establishes precise, non-overlapping
definitions for the terms that form Athena's reasoning and execution language.

This is not an API specification. It is a dictionary. Every RFC, ADR, and
implementation in Milestone 3 and beyond must use these definitions
consistently.

---

## Motivation

Athena's identity is architectural, not technological:

> **Intent is the API.** *Execution is the implementation.*

If we cannot define *Intent* without referencing GPT, prompts, tokens, or any
specific model, then we have not defined a protocol — we have defined a wrapper
around today's AI. A true protocol must survive the replacement of its
reasoning backend.

The Intent Model provides that foundation: a model-free vocabulary for
describing what a human wants, how it decomposes, and what it means to fulfill
it.

---

## Core Vocabulary

The following terms form a strict hierarchy. Each has exactly one meaning.
No synonyms. No overlap.

### 1. Intent

**Definition:** A human's declared desire for a change in the world, expressed
in domain language, without reference to *how* that change is achieved.

**Properties:**
- **Declarative:** Describes *what*, not *how*.
- **Atomic at the human level:** One Intent = one coherent user goal. "Book a
  flight to Tokyo" is one Intent. "Open browser, navigate to airline site,
  select dates..." is not an Intent — it is a plan.
- **Outcome-oriented:** An Intent is satisfied when the world matches the
  described end state, not when a sequence of actions completes.
- **Model-agnostic:** An Intent can be expressed in natural language, a
  structured form, a voice command, or a programmatic call. Its representation
  is irrelevant to its meaning.

**What Intent is NOT:**
- A prompt to an LLM.
- A sequence of steps.
- An API call.
- A capability invocation.

### 2. Goal

**Definition:** A verifiable sub-outcome that contributes to satisfying an
Intent. An Intent decomposes into one or more Goals.

**Properties:**
- **Verifiable:** A Goal has a clear success criterion that can be evaluated
  against the world (e.g., "flight confirmation email received," "appointment
  appears in calendar").
- **Decomposable:** A Goal may further decompose into sub-Goals, but only when
  each sub-Goal is independently verifiable.
- **Ordered or unordered:** Some Goals have temporal dependencies (Goal B
  requires Goal A complete); others are parallel.
- **Owned by the Reasoning Engine:** The decomposition of Intent → Goals is a
  reasoning act, not an execution act.

**Relationship to Intent:**
- One Intent → one or more Goals.
- All Goals of an Intent must succeed for the Intent to be satisfied.
- If any Goal fails irrecoverably, the Intent fails.

### 3. Constraint

**Definition:** A boundary condition that any valid Execution Plan must respect.

**Categories:**
- **Hard constraints:** Must hold for the plan to be valid (budget ≤ $500,
  departure after 6 PM, no layovers).
- **Soft constraints:** Preferences with trade-off weights (prefer window seat,
  minimize total travel time).
- **Safety constraints:** Non-negotiable boundaries derived from policy
  (no destructive actions without approval, no credential exposure).
- **Temporal constraints:** Deadlines, windows, ordering requirements.

**Properties:**
- Constraints are *declarative* — they restrict the space of valid plans, they
  do not prescribe a plan.
- Constraints are *checkable* — given a candidate plan, a constraint can be
  evaluated as satisfied, violated, or indeterminate.

---

### 4. Context

**Definition:** The ambient state of the world available to the Reasoning Engine
at planning time. Context is *observed*, not declared.

**Categories:**
- **Device state:** Current app, screen, connectivity, battery, permissions.
- **User profile:** Preferences, aliases, default accounts, accessibility settings.
- **Environmental:** Current time, timezone, location, network conditions.
- **Session history:** Recent Intents, completed Goals, learned patterns.

**Properties:**
- **Read-only for planning:** The Reasoning Engine consumes Context; it does not
  modify it through the plan (Context changes are side effects of Actions).
- **Scope-bound:** Context is scoped to the planning session; it is not part of
  the Intent and does not persist across unrelated Intents unless explicitly
  carried forward.
- **Model-agnostic:** Like Intent, Context is representation-independent — it
  can be a structured object, a vector embedding, or a natural language summary.

**What Context is NOT:**
- A Constraint (Constraints restrict; Context informs).
- An Intent (Intent declares desired change; Context describes current state).
- A Goal (Goals are outcomes to achieve; Context is state to observe).

---

### 5. Resource

**Definition:** An external entity or capability that an Execution Plan may
depend on, access, or modify. Resources are *referenced*, not invoked.

**Categories:**
- **Data resources:** Contacts, calendar, photos, files, messages, email.
- **Service resources:** Browser sessions, API credentials, cloud storage, payment methods.
- **Device resources:** Camera, microphone, GPS, Bluetooth, biometric sensors.
- **System resources:** Clipboard, keychain, notifications, shortcuts.

**Properties:**
- **Governed by policy:** Access to Resources is controlled by Governance
  (RFC-0007) — policies declare which Authorities must approve which Resource
  accesses.
- **Declared in the plan:** Every Capability invocation that requires a
  Resource declares its Resource dependencies in its metadata.
- **Lifecycle-managed:** Resources may have setup/teardown (e.g., browser
  session start/end) modeled as Capability invocations in the plan.
- **Identity-bearing:** Resources have stable identifiers (e.g., contact ID,
  calendar URL, credential reference) that persist across plans.

**What Resource is NOT:**
- A Capability (Capabilities *act*; Resources *are acted upon*).
- A Constraint (Constraints restrict plans; Resources are dependencies).
- Context (Context is ambient state; Resources are explicit dependencies).

---

### 6. Trigger

**Definition:** A temporal or event-based condition that initiates or schedules
an Execution Plan. Trigger generalizes "schedule" to include any observable
condition.

**Categories:**
- **Temporal triggers:** Absolute time (run at 2026-08-15T07:00:00Z), recurring
  (every weekday 07:00), relative (24 hours after previous completion).
- **Event triggers:** External event (email received, calendar notification,
  GPS geofence entered, file changed, Bluetooth device connected).
- **Composite triggers:** Logical combinations (time window AND event, event OR
  time threshold).

**Properties:**
- **Declarative:** Triggers describe *when*, not *what* or *how*.
- **Plan-associated:** A Trigger is metadata attached to an Intent (or Intent
  template), not part of the Execution Plan itself.
- **Evaluated by orchestration:** The Execution Engine (or a scheduling layer)
  evaluates Triggers and initiates plan generation/execution when satisfied.
- **Idempotent-safe:** Trigger evaluation must be safe to repeat; duplicate
  firings produce the same Intent (deduplication via Intent identity).

**What Trigger is NOT:**
- A Constraint (Constraints apply to plan validity; Triggers apply to plan
  initiation).
- An Intent (Intent declares *what*; Trigger declares *when*).
- A Goal (Goals are outcomes; Triggers are initiation conditions).

---

### 7. Execution Plan

**Definition:** A directed acyclic graph of **Capability invocations** that,
when executed, aims to achieve all Goals of an Intent while respecting all
Constraints.

**Properties:**
- **Composed of Capabilities:** Every node is a Capability invocation (with
  concrete parameters). The plan contains *no* reasoning steps, no LLM calls,
  no "thinking" nodes.
- **Auditable data:** The plan is a serializable, inspectable artifact. It can
  be reviewed, approved, rejected, versioned, and replayed without re-running
  the Reasoning Engine.
- **Deterministic structure:** Given the same Intent, Goals, Constraints, and
  Capability registry, the Reasoning Engine should produce the same plan
  structure (modulo non-determinism explicitly modeled as uncertainty).
- **Verifiable:** Each node has a pre-condition (what must be true before
  invocation) and a post-condition (what the Capability's verification
  confirms). The plan succeeds iff all post-conditions hold.
- **Contains Decision Points:** Explicit nodes where the plan pauses for
  external approval (human or policy engine) before proceeding.

**What an Execution Plan is NOT:**
- A workflow (workflows describe *how* a system operates; plans describe *what*
  will be done to achieve a specific Intent).
- A script (scripts are imperative; plans are declarative compositions of
  verified capabilities).
- A prompt chain.

---

### 8. Capability

**Definition:** A verified, self-describing unit of execution that transforms
the world from one state to another. (Defined in RFC-0004.)

**Role in the Intent Model:**
- Capabilities are the *atoms* of an Execution Plan.
- The Reasoning Engine selects and composes Capabilities; it never invents
  new ones at planning time.
- A Capability grants *ability* (the power to effect a change), never
  *authority* (the right to decide *whether* to effect it). Authority resides
  in the Intent → Goal → Plan → Approval chain.

---

### 9. Action

**Definition:** A single invocation of a Capability with concrete parameters,
executed by the Execution Engine.

**Properties:**
- The atomic unit of *execution* (where Capability is the atomic unit of
  *planning*).
- Produces a **Result** (the outcome), a **Verification** (success confirmed),
  and **Telemetry** (evidence). No silent success, no silent failure.
- An Action either completes (verified) or fails (with a classified error).

---

### 10. Result

**Definition:** The observable outcome of an Action, including any state
changes, returned data, and side effects.

**Properties:**
- Immutable once produced.
- Includes sufficient information for downstream Actions to make decisions
  (e.g., a selector for an element that was found, a transaction ID for a
  booking made).

---

### 11. Decision Point

**Definition:** An explicit node in an Execution Plan where execution pauses
until an approval authority grants or denies permission to proceed.

**Properties:**
- **Explicit:** Decision Points are first-class plan nodes, not implicit
  behaviors.
- **Typed:** Each Decision Point declares what is being approved (e.g.,
  "financial commitment > $100," "destructive write operation," "privacy-
  sensitive data access").
- **Auditable:** The request, the context, the authority, the decision, and
  the timestamp are recorded.
- **Blocking:** Execution cannot proceed past a Decision Point without
  approval. Timeout = denial.

---

## Relationships (The Hierarchy)

```
Intent
  └─ decomposes into → Goals (1..n)
        └─ constrained by → Constraints (0..n)
              └─ informed by → Context (read-only)
                    └─ depends on → Resources (0..n)
                          └─ initiated by → Trigger (0..1)
                                └─ planned as → Execution Plan (1)
                                      └─ composed of → Capability invocations (1..n)
                                            └─ executed as → Actions (1..1 per invocation)
                                                  └─ produces → Result + Verification + Telemetry
```

**Key invariants:**
1. Every Intent has ≥1 Goal.
2. Every Goal maps to ≥1 Capability invocation in the plan.
3. Every Capability invocation in the plan executes as exactly 1 Action.
4. Every Action produces exactly 1 Result + 1 Verification + 1 Telemetry
   record.
5. Constraints apply to the *plan*, not to individual Actions.
6. Decision Points gate *plan segments*, not individual Actions (though a
   segment may be a single Action).
7. Context is read-only during planning; it does not appear in the plan.
8. Every Resource dependency is declared in the Capability metadata of the
   plan nodes that require it.
9. A Trigger (if present) initiates plan generation; it is not part of the
   Execution Plan itself.

---

## Uncertainty and Partial Knowledge

The Intent Model acknowledges that planning operates under uncertainty.

### Sources of Uncertainty
- **Environmental:** The world may not match the planner's model (element not
  found, network latency, device state changed).
- **Capability-level:** A Capability may have probabilistic success (e.g.,
  OCR confidence < 1.0).
- **Intent ambiguity:** The human's Intent may be underspecified ("book a
  *good* flight").

### Representing Uncertainty in the Plan
- **Confidence annotations:** Each Capability invocation in the plan carries a
  planner-assigned confidence (0.0–1.0) reflecting the likelihood that the
  Capability will verify successfully *given current knowledge*.
- **Fallback branches:** The plan may specify alternative sub-plans for
  predictable failure modes (e.g., "if element not found, try alternative
  selector").
- **Unknowns:** Explicit markers for "planner cannot determine X" — these
  become runtime checks, not plan holes.

### Uncertainty does NOT mean:
- "The LLM will figure it out at runtime."
- "The executor will improvise."
- Skipping verification.

---

## Recovery and Partial Success

### Failure Classification
Every Action failure is classified:
- **Transient:** Retry may succeed (network blip, temporary UI state).
- **Permanent:** Retry will not succeed (element gone, permission denied,
  invalid input).
- **Ambiguous:** Verification inconclusive (timeout, partial result).

### Recovery Strategies (declared in the plan)
- **Retry with backoff:** For transient failures, up to a plan-specified
  limit.
- **Fallback branch:** Switch to an alternative Capability sequence declared
  in the plan.
- **Escalate to Decision Point:** Pause for human guidance when automated
  recovery is exhausted or inappropriate.
- **Compensating Action:** For partially completed plan segments, execute
  declared rollback/cleanup Actions (e.g., "if booking succeeded but email
  failed, send confirmation via alternative channel").

### Partial Success
- A plan segment *succeeds* iff all its Actions verify.
- A plan segment *partially succeeds* if some Actions verify and others fail
  with declared compensating actions completed.
- An Intent *succeeds* only if all its Goals are satisfied (verified).
- An Intent *fails* if any Goal fails irrecoverably (no fallback, no
  compensation, or compensation also fails).

---

## What This Model Enables

1. **Model-independent reasoning:** Any Reasoning Engine (GPT, Claude, a
   classical planner, a human) that can produce an Execution Plan conforming
   to this model is a valid Athena backend.
2. **Auditability:** The plan is a complete, inspectable artifact before
   execution begins.
3. **Verifiability:** Success is defined by Verification, not by "the model
   said it worked."
4. **Interchangeability:** Swapping the Reasoning Engine requires no change
   to the Execution Engine, Capabilities, or verification logic.
5. **Policy enforcement:** Constraints and Decision Points are enforced by
   the Execution Engine, not trusted to the Reasoning Engine.
6. **Debuggability:** Every failure traces to a specific Action, Capability,
   Goal, and Intent.

---

## Non-Goals (Explicitly Out of Scope)

- How the Reasoning Engine generates the plan (algorithm, prompt, algorithm).
- The serialization format of the plan (JSON, protobuf, etc.) — that is
  RFC-0006.
- The API for submitting an Intent — that is an SDK concern.
- The specifics of any Capability — that is RFC-0004 and capability specs.
- The approval UI or policy engine — that is an implementation detail.

---

## Conformance

A system conforms to the Intent Model iff:

1. Every user request enters as an **Intent** (not a plan, not a command).
2. The system produces an **Execution Plan** composed solely of
   **Capability** invocations.
3. The plan respects all declared **Constraints**.
4. The plan includes explicit **Decision Points** for all actions requiring
   approval per policy.
5. Execution proceeds Action by Action, each producing **Result +
   Verification + Telemetry**.
6. No Action executes without a corresponding node in the plan.
7. No plan node executes without verification.
8. The Reasoning Engine and Execution Engine are separate components with
   no shared mutable state.

---

## Future RFCs This Model Informs

- **RFC-0006: Execution Plan Model** — serialization, lifecycle, state transitions,
  versioning, plan diffing.
- **RFC-0007: Constraint and Governance Model** — formal syntax for Constraints,
  conflict detection, resolution strategies; approval authority, safety policies.
- **RFC-0008: Decision Point Protocol** — approval request/response, timeouts,
  audit log format.
- **RFC-0009: Reasoning Engine Interface** — the contract between Athena and
  any reasoning backend (GPT, classical planner, human-in-the-loop).

---

## Appendix: Glossary (Normative)

| Term | One-Line Definition |
|------|---------------------|
| **Intent** | A human's declared desire for a change in the world, expressed in domain language, without reference to *how*. |
| **Goal** | A verifiable sub-outcome that contributes to satisfying an Intent. |
| **Constraint** | A boundary condition that any valid Execution Plan must respect. |
| **Context** | The ambient state of the world available to the Reasoning Engine at planning time (device, user, environment, history). |
| **Resource** | An external entity or capability that an Execution Plan may depend on, access, or modify (contacts, calendar, browser session, credentials). |
| **Trigger** | A temporal or event-based condition that initiates or schedules an Execution Plan (time, recurrence, event, composite). |
| **Execution Plan** | A DAG of Capability invocations that aims to achieve all Goals while respecting all Constraints. |
| **Capability** | A verified, self-describing unit of execution that transforms the world (RFC-0004). |
| **Action** | A single Capability invocation with concrete parameters, executed by the Execution Engine. |
| **Result** | The observable outcome of an Action. |
| **Verification** | Confirmation that an Action achieved its intended effect. |
| **Telemetry** | Structured evidence of an Action's execution (requestId, duration, attempts, device, etc.). |
| **Decision Point** | An explicit plan node where execution pauses for approval authority consent. |
| **Recovery** | A declared strategy (retry, fallback, escalate, compensate) for handling Action failure. |
| **Partial Success** | Some Goals satisfied, others failed with compensating actions completed. |

---

*End of RFC-0005 (Draft)*