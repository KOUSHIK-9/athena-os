# RFC-0013: The Memory Model

- Status: **Accepted**
- Reference Implementation: **implemented** — `packages/memory` (store + retriever)
  and the read handoff into `packages/reasoning` (`ReasoningBackend.memory`); wired
  through `servers/mcp-server/src/run/reason.ts`.
  RFC-0014/0015/0016 are accepted (see the closing discipline note).
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
6. **Memory is append-only by default.** Updates never mutate an entry; they
   write a new entry on the same subject that deterministically supersedes
   the previous one. (Auditability, synchronization, learning, and conflict
   resolution all depend on this; it does not force event sourcing today.)
7. **Memory is the persistent backing of Context.** RFC-0005 §4 Context
   ("ambient state at planning time") is session-scoped and "does not
   persist across unrelated Intents unless explicitly carried forward."
   Memory *is* that explicit carry-forward: Memory persists, Context is its
   session-scoped read. Memory reaches the Reasoning Backend in two consistent
   ways (see §The Contract): it informs the RFC-0009 §1 `Context` input —
   Memory is its persistent portion — and a memory-aware backend may
   additionally read it directly through the `memory?: MemoryReader` handoff.
   No new input kind is introduced and `reason(intent, registry)` stays exact.

## 3. Memory Taxonomy

Four canonical memory types.

| memory type | declares | examples | lifecycle |
| ----------- | -------- | -------- | --------- |
| `fact` | what is believed to be true about the world or the user, in the present | "home airport = SFO", "passport valid through 2029", "team name = Meridian" | persists until **superseded** by a newer fact on the same subject |
| `preference` | how the user wants things done | "window seat", "vegetarian meals", "dark mode" | persists until **superseded** on the same dimension; never expires by age |
| `experience` | the outcome of a past reasoning+execution | "flight booking failed (UNAVAILABLE)", "hotel booking succeeded", "Settings app crashed" | survives; append-only; **never expires** — the substrate for Learning |
| `trigger` | a future condition Athena is asked to act on | "every Monday", "flight tomorrow", "package delivered" | persists until **fired-and-satisfied** or cancelled; a recurring trigger never expires |

### Classifying an entry (orthogonality)

One assertion lands in **exactly one** type; dual-typed entries are forbidden.
Evaluate in order:

```
1. Assertion of a future condition to act on     → trigger
2. Assertion of how the user wants things done
   (normative voice: "prefer", "never", "always") → preference
3. Outcome of Athena's own past execution        → experience
4. Otherwise                                     → fact
```

Two consequences:

- A fact may never carry a preference payload: normative-vocal assertions
  like "user prefers window seats" are Preferences, full stop.
- "Never book red-eye flights" is a **Preference** (rule 2). Memory never
  emits constraints — see §7 for how preferences project into a plan.

### What each type is *not*

- `fact` / `preference` are **not constraints**. The user's "preference for
  window seat" must never block a plan that has a middle seat — it biases
  the candidate, it does not vet it.
- `experience` carries **outcome facts**, not blame. It exists so a future
  session can reason about what worked (Learning is a later RFC; this
  record is its input).
- `trigger` is a **condition**, not an action. Acting on it is ordinary
  reasoning + execution, exactly like any other intent. The `trigger`
  memory type is the **persistent record of an RFC-0005 §6 Trigger**;
  its protocol semantics (initiation, idempotency, orchestration
  evaluation) are owned by RFC-0005, with evaluation mechanics later in
  RFC-0016. RFC-0013 stores and classifies it, one concept, one owner.
- `facts` are **asserted knowledge, unverified at write time**. Verification
  and trust-weighting are retrieval-time concerns (RFC-0014), not the write
  path.

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

### Subject identity & supersession (deterministic)

"Same subject" is a canonical, stable identifier — never free text.

- Syntax: dotted identifier, lower camel case after the namespace. Stable,
  implementation-independent. Examples:

  ```
  user.homeAirport          user.preferredSeat         user.language
  travel.passport.available device.defaultBrowser      calendar.work
  ```

- **Supersession rule:** two entries conflict when they share a `subject`;
  the later `recordedAt` wins, ties are broken by `id`. Appending a newer
  entry on a subject deterministically supersedes the older one — the old
  entry is retained (append-only) but excluded from reads.
- A preference's "dimension" (§3) is its `subject`; preference supersession
  is the same rule.

### Trigger lifecycle states

The `trigger` memory type moves through an explicit small state set.
Evaluation mechanics (scheduling, recurrence, firing) are **not** part of
RFC-0013 — they belong to RFC-0016. RFC-0013 only defines the states:

```
pending ──(fires)──▶ fired ──(satisfied)──▶ (done)
                        │
                        ├──(recurring)──▶ re-armed ──▶ pending
                        └──(cancelled)──▶ (done)
```

- `pending` → `fired`: the condition becomes true.
- `fired` → `satisfied`: the triggered intent was reasoned and executed.
- `fired` → `re-armed`: recurring triggers return to `pending`.
- `fired` → `cancelled`: user cancels (always allowed, see §4).

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

Two arrows, both explicit:

```
READ:  Memory → Context (RFC-0005 §4) → ReasoningBackend (candidate)
WRITE: Execution → Experience → Memory   (side-channel; never a planning input)
```

The **write** path belongs to the Execution Engine: Actions produce Results,
Verification, Telemetry (RFC-0005 §9–10), and the engine records the outcome
as an `experience` entry. Reasoning only *reads* Memory; it never writes it.

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
| `Context` (RFC-0005 §4) | **be the persistent backing of Context** — Context is the session-scoped read of Memory | persist in Context's session scope; Memory persists, Context does not |
| `Trigger` (RFC-0005 §6) | persist trigger records; the memory type is the record of an 0005 Trigger | own initiation/idempotency semantics (those stay in 0005, evaluation in 0016) |

The rule, once more: **every deterministic stage and the validator are
memory-blind.** Everything Memory touches lives behind the RFC-0012 contract,
inside the backend's candidate path.

### Preference projection (never a constraint at the memory level)

At **assembly time**, a `preference` may project into a weighted **soft**
constraint (RFC-0007) that biases candidate selection — e.g. preference
`user.preferredSeat` → soft constraint `PreferWindowSeat`. Only an explicit
user Intent may attach a **hard** constraint, and only for that execution
("I must have a window seat" → hard constraint scoped to that Intent). Memory
never emits constraints; there is **no "hard preference" type**.

## The Contract (additive seam)

Keeps `reason(intent, registry)` exact — a memory-aware backend is handed an
optional read-only view and either ignores it. The engine wiring gains
`memory?: MemoryReader` solely as handoff.

```ts
type MemoryKind = 'fact' | 'preference' | 'experience' | 'trigger';

interface MemoryEntry {
  readonly id: string;          // stable, protocol-scoped
  readonly kind: MemoryKind;
  readonly subject: string;       // canonical dotted identifier (§5): user.homeAirport
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
- Classification is deterministic: under the §3 precedence rule, each entry
  maps to exactly one `kind`; no dual-typed entries exist.
- Supersession is deterministic: same `subject` (§5 identity), later
  `recordedAt` wins, ties broken by `id`; the superseded entry is retained
  (append-only) but excluded from reads.
- A `trigger` entry's state is always one of `pending | fired | re-armed |
  satisfied | cancelled`.
- No validator, simulation, or graph-builder code path reads Memory.
- A memory-aware backend on an **empty** memory produces the exact
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

This RFC was reviewed before acceptance (Milestone 5A review) and the review's
eight findings were adopted as additive amendments — the four-type ontology,
the authority boundary, and the lifecycle philosophy were unchanged.

1. ✅ **RFC-0013 (this)** — model, lifecycles, authority. **Accepted.**
2. ✅ **RFC-0014 — Memory Retrieval** — Accepted; deterministic retriever implemented.
3. ✅ Architecture review — passed (dependency pyramid + Appium boundary enforced).
4. ✅ **RFC-0015 — Preferences**; **RFC-0016 — Triggers** — Accepted; implemented in
   `packages/memory` and `servers/mcp-server/src/run/triggers.ts`.
5. ✅ Cross-RFC consistency review — see `REVIEW-memory-rfcs-consistency.md` (resolved).
6. ✅ Implemented: deterministic in-memory reference, retriever, preference + trigger
   firing, experience write-back, and the Apple on-device memory loop — runtime-verified
   on an iPhone 17 Simulator (Developer Preview v1.0).

All four Memory RFCs (0013–0016) are **Accepted and frozen for Developer Preview v1.0**.

## Cross-References

- RFC-0005 — the Intent Model: Context (§4) whose persistent backing Memory
  is, and Trigger (§6) whose records the `trigger` type persists.
- RFC-0007 — constraint governance; preferences never outweigh hard
  constraints, and projection is soft-constraint-only (§7).
- RFC-0009 — the contract whose Context input carries Memory into reasoning.
- RFC-0011 — the validator authority that stays memory-blind.
- RFC-0012 — the backend seam where Memory docks.