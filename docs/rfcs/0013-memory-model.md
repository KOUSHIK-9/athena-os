# RFC-0013: The Memory Model

- Status: **Draft**
- Reference Implementation: pending — no Memory code is written until this RFC
  (and its stack, RFC-0014/0015/0016) is accepted. See the closing discipline note.
- Authors: Athena Core Team
- Created: 2026-08-07
- Depends on: RFC-0009 (The Contract Between Intent and Execution),
  RFC-0011 (The Deterministic Reasoning Engine),
  RFC-0012 (The Reasoning Backend Contract & Conformance)

---

## 1. Purpose

Memory answers one question:

> **What knowledge should Athena preserve between reasoning sessions?**

Not: "what data can Athena store?". That distinction keeps Memory from
becoming an arbitrary database. Memory is the knowledge that survives a
session because it changes how a future session reasons — nothing else
belongs in it.

Athena is deterministic: the same Intent always produces the same candidate,
and conformance certifies that. Without Memory, that determinism is preserved
at the cost of amnesia. With Memory, Athena answers the same intent
differently *given context it is allowed to remember*: "Book me a flight to
Japan next month" carries unspoken context — preferred airline, seat
preference, available documents, budget — that Memory supplies to the
Reasoning Backend without changing the contract that produced the plan.

## 2. Memory Principles

1. **Memory informs reasoning. Memory never authorizes execution.**
   The Validator (RFC-0011 §1.5) remains the sole authority over what
   executes. Memory can bias *which candidate a backend produces*; it can
   never make a candidate valid.
2. **Memory is knowledge, not a database.** Only knowledge that affects
   future *reasoning sessions* is stored. Telemetry logs, raw events,
   ephemeral observations, and operational data are not Memory.
3. **Memory is structural, not free text.** Every stored unit is a typed,
   stamped, immutable `MemoryEntry` (below), so that retrieval and
   conformance stay deterministic.
4. **Memory is additive to the protocol.** Existing RFC-0009/0011/0012
   contracts are unchanged; Memory docks at the RFC-0012 backend seam as an
   optional, read-only context.
5. **Memory is replaceable.** The model is provider- and
   storage-engine-agnostic. A memory store is an implementation, like a
   reasoning backend — interchangeable behind one contract.

## 3. Memory Taxonomy

Four canonical memory types.

| memory type | declares | examples | lifecycle |
| ----------- | -------- | -------- | --------- |
| `fact` | what is believed to be true about the world or the user, in the present | "home airport = SFO", "passport valid through 2029", "team name = Meridian" | persists until **superseded** by a newer fact on the same subject |
| `preference` | how the user wants things done | "window seat", "vegetarian meals", "dark mode" | persists until **superseded** on the same dimension; never expires by age |
| `experience` | the outcome of a past reasoning+execution | "flight booking failed (UNAVAILABLE)", "hotel booking succeeded", "Settings app crashed" | survives; append-only; **never expires** — the substrate for Learning |
| `trigger` | a future condition Athena is asked to act on | "every Monday", "flight tomorrow", "package delivered" | persists until **fired-and-satisfied** or cancelled; a recurring trigger never expires |

### What each type is *not*

- `fact` / `preference` are **not constraints**. The user's "preference for
  window seat" must never block a plan that has a middle seat — it biases
  the candidate, it does not vet it.
- `experience` carries **outcome facts**, not blame. It exists so a future
  session can reason about what worked (Learning is a later RFC; this
  record is its input).
- `trigger` is a **condition**, not an action. Acting on it is ordinary
  reasoning + execution, exactly like any other intent.

## 4. Memory Ownership

| memory | created by | deletable by |
|--------|-----------|--------------|
| `fact` | user (or user-confirmed) | only the user |
| `preference` | user | only the user |
| `experience` | system (append-only outcome of execution) | nobody, by policy; user deletion at product level |
| `trigger` | user or system | user; or the system once fired-and-satisfied |

Ownership means **who may change a fact** — not who gets to read it. Athena
records experiences because the user delegated execution to it; it does not
own the preferences those executions reveal.

## 5. Memory Lifecycle

- **What gets stored:** typed `MemoryEntry` records with a stable `id`, a
  `kind`, a `recordedAt` stamp, and a typed `payload`. Immutable once
  written — change is expressed as a *newer entry on the same subject*.
- **What expires:**
  - `trigger`: expires when it fires and is satisfied, or when cancelled.
  - nothing else expires by age.
- **What never expires:**
  - `experience`: what was executed is protocol truth; the platform does
    not auto-prune execution outcomes.
  - standing `fact` and `preference` entries: until superseded by
    user-confirmed newer information on the same subject/dimension.
- **Ephemerality is a runtime concern, not a memory type.** In-session
  data (screen dump, sensor blurbs) is not Memory; the pipeline already
  handles it. Only knowledge worth preserving between sessions has a type.

## 6. Authority Boundaries

```
Intent
   │
   ▼
Memory (context)              ── informs; never read by validator /
Reasoning Backend (candidate)     simulation / graph builder
   │
   ▼
Candidate Execution Plan      ── carries NO memory provenance
   │
   ▼
Validator (RFC-0011 §1.5)     ── the authority; memory is invisible to it
   │
   ▼
Simulation → Execution Graph → Execution
```

Consequences:

- Memory cannot bypass validation.
- Memory cannot block or create a hard constraint.
- Memory cannot add goals or constraints to the protocol objects.
- A memory-biased candidate the validator rejects is *wrong*, full stop.
- Experience `outcome` cannot retroactively change the validator's verdict
  on an execution, nor shape a running execution.

## 7. Relationship to Intent / Goals / Constraints

| protocol object | what Memory may do | what Memory never does |
|-----------------|--------------------|------------------------|
| `Intent` | guide goal extraction inside a backend | author the Intent |
| `Goal` | prefer an ordering or form among existing candidates | create a goal |
| `Constraint` | inform how the backend weights its search | add or override a constraint (RFC-0007 governance) |
| `ExecutionPlan` | bias how the candidate is assembled | edit a plan post-candidate, or self-certify it |
| `DecisionPoint` | inform *preference* between legal decisions | expand the legal set |

The rule, once more: **every deterministic stage and the validator are
memory-blind.** Everything Memory touches lives behind the RFC-0012 contract,
inside the backend's candidate path.

## The Contract (additive seam)

Keeps `reason(intent, registry)` exact — a memory-aware backend is handed an
optional read-only view and either ignores it. The engine wiring gains
`memory?: MemoryReader` solely as handoff.

```ts
type MemoryKind = 'fact' | 'preference' | 'experience' | 'trigger';

interface MemoryEntry {
  readonly id: string;          // stable, protocol-scoped
  readonly kind: MemoryKind;
  readonly subject: string;       // the session-dimension this entry is about
  readonly recordedAt: string;    // ISO-8601
  readonly payload: unknown;      // typed per kind
}

interface MemoryReader {          // read-only seam — RFC-0014 fills retrieval
  readonly id: string;
  entries(subject?: string): readonly MemoryEntry[];  // deterministic base read
}
```

Ownership of code: the Memory *model* types belong to `@athena-os/core`
(one concept, one canonical definition), exactly as `Intent` and
`Constraint` do. Storage engines, TTL drivers, and persistence are
implementations elsewhere (and out of scope here).

## Conformance (this RFC)

An implementation conforms when:

- Every stored entry has `kind ∈ {fact, preference, experience, trigger}`, a
  stable `id`, `recordedAt`, and a typed `payload`; round-trip
  record → replay is lossless and equal.
- `superseded` is deterministic: a newer entry on a subject replaces the
  older one on read.
- no validator, simulation, or graph-builder code path reads Memory.
- a memory-aware backend on an **empty** memory produces the exact
  RFC-0012 candidate set (memory changes nothing when it holds nothing).

## 8. Non-Goals (explicitly out of this RFC)

- Retrieval algorithms, relevance scoring, vector search, or embeddings —
  RFC-0014.
- LLM memory / memory-augmented generation details (Retrieval/0014 + the
  Reasoning implementation later).
- Storage engines: SQLite, Postgres, files — implementation choice.
- Preference dimension semantics (what "dark mode" vs "vegetarian" means) —
  RFC-0015.
- Trigger evaluation protocol — RFC-0016.
- Learning from outcomes (telemetry → memory → future reasoning) — later
  RFC. `experience` only records the input for it.
- User identity, multi-account, consent surfaces.

## Discipline Note: RFC First, Code After

This is the first of the Memory stack, and it ships exactly how RFC-0011 →
RFC-0012 shipped: concepts, then review, then implementation.

1. **RFC-0013 (this)** — model, lifecycles, authority.
2. Architecture review.
3. **RFC-0014 — Memory Retrieval** — the retrieval contract and conformance.
4. Architecture review.
5. **RFC-0015 — Preferences**; **RFC-0016 — Triggers**.
6. Cross-RFC consistency review.
7. **Then implement**: deterministic in-memory reference → conformance →

No Memory code is written before this RFC is accepted.

## Cross-References

- RFC-0009 — the Intent ↔ Execution contract Memory informs.
- RFC-0011 — the validator authority that stays memory-blind.
- RFC-0012 — the backend seam where Memory docks.
- RFC-0007 — constraint governance; preferences never outweigh hard
  constraints.