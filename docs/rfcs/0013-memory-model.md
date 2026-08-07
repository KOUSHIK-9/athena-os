# RFC-0013: The Memory Model

- Status: **Draft**
- Reference Implementation: pending (no Memory code is written until this RFC
  is accepted — see the closing discipline note)
- Authors: Athena Core Team
- Created: 2026-08-07
- Depends on: RFC-0009 (The Contract Between Intent and Execution),
  RFC-0011 (The Deterministic Reasoning Engine),
  RFC-0012 (The Reasoning Backend Contract & Conformance)

---

## Abstract

This RFC defines what **Memory** is for Athena: the persistent record of what
the platform knows about the world, about the user, and about itself. Memory
is a **readable context for reasoning** — it is never authority. It feeds the
Reasoning Backend's open-ended semantics (goal extraction, clarification,
plan biases) exactly as RFC-0012 intended ("a future backend may infer
constraints, insert clarifications"), and it is exposed to the engine as an
additive, optional seam so the RFC-0011/RFC-0012 trust model is unchanged.

This RFC defines the entity taxonomy, the lifecycle rules (what expires, what
never expires), and the authority boundary. Retrieval algorithms, preference
semantics, and triggers are separate RFCs (0014, 0015, 0016).

## Motivation

Athena is deterministic today: the same Intent always produces the same
candidate. That determinism is a strength — it is what conformance certifies.
But a cognitive platform must not be amnesiac. The user's "Book me a flight to
Japan next month" carries unspoken context: preferred airline, seat
preference, available documents, budget. Without Memory, every such request
must be re-discovered or resolved through clarification. With Memory, the
backend answers the same Intent differently *given context it is allowed to
remember*.

The risk is the opposite extreme: Memory that silently changes answers,
overrides constraints, or becomes an authority the validator cannot check.
RFC-0013 answers that by defining Memory as **context, never authority**:

- Memory cannot create or veto goals.
- Memory cannot override constraints.
- Memory cannot bypass validation.
- Memory can only bias how goals are extracted and how plans are assembled,
  inside the existing candidate path.

## What Memory Is

### The entity taxonomy

| Entity | Declares | Example | Owned by | Lifecycle |
|--------|----------|---------|----------|-----------|
| `Fact` | What is true about the world or the user | "passport valid through 2029", "frequent flyer #AQ9281" | User-facing, user may delete | Persists until **superseded** by a newer fact on the same subject |
| `Preference` | How the user wants things done | "window seat", "vegetarian", "dark mode" | User | Persists until **superseded** on the same dimension; never expires by age |
| `Observation` | What Athena perceived at an instant | "screen showed Settings", "notification: package delivered" | System (recorded at runtime) | **Ephemeral** — expires by age/TTL by default |
| `ExecutionRecord` | What Athena planned and did | plan id, intent, steps, outcome | System (append-only) | **Never expires** — protocol truth |
| `FailureRecord` | Execution that did not reach its outcome | plan id, failing step, error, reason | System (append-only) | **Never expires** — derived view of `ExecutionRecord` |

### How Memory maps to the existing protocol objects

Memory never replaces a protocol object; it **enriches** where the protocol
already expects freedom:

| Protocol object | Memory above it |
| --------------- | --------------- |
| `Intent` | Memory cannot author an Intent. It may guide goal extraction inside a backend. |
| `Goal` | Memory cannot create a goal. A backend may *prefer* a goal order or form given memory. |
| `Constraint` | Memory cannot add a constraint. Constraints stay protocol-authoritative (RFC-0007 governance). |
| `ExecutionPlan` | Memory cannot edit a candidate-level plan's steps. It can only bias the assembly that *produces* the candidate. |
| `DecisionPoint` | Memory may inform the *preference* between decisions, never the set of legal ones. |

The rule is one line: **the deterministic stages and the validator neither
read nor depend on Memory.** Everything Memory influences lives inside the
backend's candidate path, behind the RFC-0012 contract.

## The Lifecycle Rules

Three questions the RFC answers.

### What gets stored?

Anything a `MemoryWriter` records. Records are typed (`Fact`,
`Preference`, `Observation`, `ExecutionRecord`), stamped, and immutable.
Records, not free text — data that flows into reasoning must be
structural so retrieval and conformance stay deterministic.

### What expires?

- `Observation`: expires by a time-to-live, default policy short (session
  or hours); a memory not used by then is garbage.
- `Fact` with an explicit `at`/until: a fact whose subject is later
  superseded by a newer fact expires. Time-supersession is the only expiry
  path for Facts.
- Nothing else expires by age.

### What never expires?

- `ExecutionRecord` and `FailureRecord` — append-only, never pruned. What
  Athena did is protocol truth and, once recorded, cannot be erased by
  lifecycle policy (the user may, at product level, delete; the platform
  never auto-prunes it).
- Standing `Fact`s and `Preference`s — until superseded by user-confirmed
  new information.

### Deletion ownership

| entity | Who may delete |
|--------|----------------|
| `Fact`, `Preference` | only the user (or an explicit user action) |
| `Observation` | system, via TTL expiry |
| `ExecutionRecord`, `FailureRecord` | nobody, under policy; user deletion is a product-level action |

## The Contract

An additive, optional seam, RFC-0012 stays intact: `reason(intent, registry)`
keeps its exact signature; a memory-aware backend MAY accept a read-only
`memory` view passed by the engine. Existing backends compile unchanged and
run identically (conformance is unchanged).

```ts
type MemoryKind = 'fact' | 'preference' | 'observation' | 'execution' | 'failure';

interface MemoryEntry {
  readonly id: string;          // stable, protocol-scoped
  readonly kind: MemoryKind;
  readonly subject: string;       // what the entry is about (user dimension, entity, plan id)
  readonly recordedAt: string;    // ISO-8601
  readonly payload: unknown;      // typed per kind; unknown=opaque to the model
}

interface MemoryReader {          // read-only seam; RFC-0014 fills retrieval
  readonly id: string;
  entries(subject?: string): readonly MemoryEntry[];   // deterministic base read
  // search / relevance / context assembly: defined by RFC-0014
}
```

The engine's `ReasoningEngine` gains an optional `memory?: MemoryReader`,
maintained purely to hand to a memory-aware backend. The contract change is
additive; the deterministic backend ignores it entirely.

- Ownership: the Memory *model* lives in `@athena-os/core` (one concept, one
  canonical definition), like `Intent` and `Constraint`. The storage engine,
  TTL driver, and any persistence are separate implementations.

## The Authority Boundary

```
Memory (context)             ── never read by
   │                          validator / simulation / graph builder
   ▼
ReasoningBackend (candidate)  ── MAY consume memory to extract goals /
                                     prefer forms / seek clarification
   ▼
Candidate Plan                ── carries NO memory provenance
   ▼
Validator (RFC-0011 §1.5)     ── authority; memory is invisible to it
   ▼
Simulation / Execution Graph  ── deterministic, memory-blind
```

A memory that produces a candidate the validator rejects is simply wrong. A
memory that would produce a constraint-violating candidate is not "tuned", it
is eliminated by the same validator every backend passes. Memory can never:

- bypass validation,
- block a hard constraint satisfaction,
- add goals or constraints to the protocol objects,
- self-report that "memory made this plan conform".

## Conformance

An implementation conforms to this RFC when:

- Every stored `MemoryEntry` has `kind`, a stable `id`, a `recordedAt`, and
  a typed `payload` — and storage round-trips produce lossless, deterministic
  reads (record → replay → equal).
- TTL expiry is deterministic: given the same timestamps, the same entries
  are pruned.
- Supersession is deterministic: a newer `Fact` on a subject replaces the
  older one when read.
- A memory-less backend and a memory-ignoring backend produce identical
  candidates on an empty memory — RFC-0012 conformance is unchanged.
- No code path in the validator, simulation, or execution graph reads
  Memory.

## Non-Goals (Explicitly Out of Scope of This RFC)

- Retrieval, relevance scoring, or memory injection into candidates:
  proves RFC-0014, Retrieval.
- Preference *dimension semantics* (what "dark mode" vs "vegetarian" means
  as preferences): RFC-0015.
- Triggers / recurring intent (every Monday): RFC-0016.
- Persistence engine choice (SQLite, files, etc.) — the model is
  storage-agnostic; the storage layer is implementation.
- User identity, multi-account, or user-consent product surfaces.
- Learning from outcomes: telemetry → memory → future reasoning is a later
  RFC (Learning). `ExecutionRecord` records the input for that, nothing more.

## Discipline Note: RFC First, Code After

This RFC is the first of the Memory stack. The sequence, aligned with how
RFC-0011 → RFC-0012 shipped:

1. **Accept RFC-0013 (this RFC).**
2. RFC-0014 Retrieval — the retrieval contract and its conformance.
3. RFC-0015 Preferences; RFC-0016 Triggers.
4. Then implement: in-memory deterministic reference store → conformance →
   backend integration through the optional `Memory` seam.

No Memory code is written before this RFC is accepted.

## Cross-References

- RFC-0009 defines the Intent ↔ Execution contract Memory enriches.
- RFC-0011 defines the validator that remains memory-blind.
- RFC-0012 defines the backend seam where Memory docks.
- RFC-0007 constraint governance: preferences must never override hard
  constraints (RFC-0013 is consistent: constraints remain above memory).