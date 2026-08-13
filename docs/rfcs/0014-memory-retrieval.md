# RFC-0014: Memory Retrieval

- Status: **Accepted**
- Reference Implementation: **implemented** — `packages/memory` (`DeterministicRetriever`)
  and surfaced in reasoning output via `RetrievalResult` → `ReasoningBackendResult.retrievedMemory`.
  (RFC-0014/0015/0016) is accepted and reviewed.
- Authors: Athena Core Team
- Created: 2026-08-07
- Depends on: RFC-0013 (The Memory Model)

---

## Abstract

RFC-0013 established what Memory is: four typed, append-only knowledge
categories, with lifecycle rules and a trust boundary. This RFC defines the
**read path** — how stored Memory becomes *reasoning context*. It answers one
question:

> Which memory entries does this intent's reasoning get to see, and in what
> order?

Retrieval is the mirror of RFC-0012's conformance idea: two reasoning
backends must produce the same plan for the same intent, so two retrievers
must produce the **same entries for the same memory and request**. Because
Memory informs candidates through Context (RFC-0005 §4) and the validator
remains memory-blind (RFC-0013 §6), retrieval can be defined
deterministically, certified by conformance, and replaced by a model-backed
implementation without touching the trust boundary.

## Motivation

RFC-0013 says Memory informs Context, but not *how* the right entries are
chosen for a given intent. Without an explicit retrieval contract, every
backend would invent its own "grab what looks relevant" logic — plausible,
non-deterministic, and uncertifiable. Retrieval must be a protocol of its
own, with a deterministic reference as the certified baseline — exactly as
RFC-0012 treated reasoning.

## The Retrieval Contract

A retriever turns a request into an ordered, de-duplicated entry set, read
from the memory store. It is **read-only**: RFC-0013 §6 assigns the write
path to the Execution Engine; reasoning never writes.

```ts
interface RetrievalRequest {
  readonly intentKind: string;   // what the plan will do ("communication", "travel", …)
  readonly requested: string[];  // canonical subjects the session needs (RFC-0013 §5)
  readonly at?: string;          // ISO-8601 snapshot; default: now
}

interface RetrievalResponse {
  readonly entries: readonly MemoryEntry[];   // strict total order, no duplicate subjects
}

interface MemoryRetriever {
  readonly id: string;                       // e.g. "memory:deterministic"
  retrieve(request: RetrievalRequest, memory: MemoryReader): RetrievalResponse;
}
```

- `requested` is how the backend states *what it needs*. Retrieval does not
  guess: a subject not requested is returned only if it belongs to the
  always-eligible set (below).
- `at` makes reads deterministic and historical reads possible (snapshots).
- The response is a **strict total order**: same memory, same request,
  same bytes.

## 1. Selection and Ordering (deterministic reference)

The reference retriever `memory:deterministic` applies these rules in order.
The outcome is computed exclusively from entry fields — no heuristics:

1. **Scope.**
   - If `requested` is non-empty: keep entries whose `subject` is in
     `requested`.
   - Else: keep the store's **always-eligible** set — standing `fact` and
     `preference` entries that apply to every intent (e.g.
     `user.language`, `user.preferredSeat`). The always-eligible set never
     includes `trigger`.
2. **Supersession (RFC-0013 §5):** per `subject`, keep the newest
   `recordedAt`; ties broken by `id` ascending.
3. **Kind ordering:** `fact`, then `preference`, then `experience`, then
   `trigger` — declarative truth binds before preference and outcome.
4. **Stability tiebreak:** `recordedAt` descending, then `id` ascending.

This is a strict total order: no two entries share a subject (supersession
already removed older copies), so ranking is never ambiguous.

### Kind scoping for `intentKind`

`intentKind` has one retrieval-level effect in this RFC: a request for a
one-off action never receives `trigger` entries; a request produced by
trigger firing (a synthetic intent) may. Richer intent-kind ↔ preference
interplay is RFC-0015 territory.

## 2. Context Assembly (the read path)

RFC-0013 bound the path `Memory → Context → ReasoningBackend` and fixed the
integration seam in its *Contract* section: `reason(intent, registry)` stays
**exact**, and the engine hands a memory-aware backend an optional read-only
`memory?: MemoryReader` (RFC-0013 §The Contract). This RFC defines the
*retrieval* half of that seam — the deterministic function the engine runs
against the `MemoryReader` to select the entries a candidate may see:

```
MemoryReader            (handed off by the engine — RFC-0013 §The Contract)
   │
   ▼
retrieve(request, memory) → RetrievalResult { entries }     (this RFC)
   │
   ▼
ReasoningBackend (candidate)                                (RFC-0012)
   — receives memory via the `memory?: MemoryReader` handoff;
     `reason(intent, registry)` is unchanged (RFC-0013 §The Contract)
```

- `RetrievalResult` is the **output of this RFC**: the ordered, de-duplicated
  `entries`. It is **not** the RFC-0005 §4 `Context`; it is the persistent
  memory portion that the engine merges into the session `Context` (RFC-0005 §4)
  and/or exposes to the backend through the `MemoryReader` handoff.
- Assembly is **read-only**: entries cross the boundary as immutable
  `MemoryEntry` values; the retriever never writes.
- Entries appear in the retriever's total order. Projection of preferences
  into soft constraints, if any, happens at planning time (RFC-0015) — never
  inside retrieval.

## 3. The Trust Boundary

Retrieval inherits RFC-0013's authority rules without modification:

- Retrieval **cannot fabricate or alter** entries — it only reads.
- Retrieval **does not decide validity**; a retriever that returns wrong
  entries produces a candidate the validator still rejects. Retrieval is not
  an authority, it is a supplier.
- Retrieval never writes; it is not the recording path (that is the
  Execution Engine → `experience` write of RFC-0013 §6).

## 4. Conformance (this RFC)

An implementation conforms when:

1. **Determinism:** fixed memory + fixed request → byte-identical
   `entries` across repeated calls.
2. **Supersession honored:** no response contains two entries for one
   `subject`; only the newest copy appears (RFC-0013 §5).
3. **Empty memory:** on an empty store, a retriever returns `[]` — Memory
   never invents entries it cannot prove.
4. **Subject faithfulness:** every `entries[i].subject` in the response is
   sourced from the store for the request — no synthesized entries.
5. **Certified fixtures:** the canonical fixture set in
   `packages/memory/conformance/fixtures/retrieval.ts` — memory states ×
   requests → exact expected `entries`. A retriever (deterministic or
   model-backed) conforms by reproducing every fixture exactly.
6. **Authority ceiling:** a one-off request never receives `trigger`
   entries (§1 kind scoping); retrieval never exposes a write path.

## 5. Beyond the Deterministic Reference

A model-backed retriever is a **second implementation of the same contract**,
certified by the same fixtures. What it may change:

- **Candidate breadth:** it may consider a wider base of entries to rank
  (e.g. semantic recall) and re-rank them.

What it may **never** change:

- the **total order of the certified subset** — it must reproduce the
  fixture-expected order exactly when the fixture request is used;
- the trust boundary — no fabrication, no writes, no validator bypass.

A model-backed retriever that passes the fixtures is legitimate; one that
cannot reproduce them does not conform, exactly like an LLM backend that
fails RFC-0012 parity.

```
Deterministic reference   → certified by conformance
Model-backed retriever    → certified by the same conformance
```

## 6. Reference Implementation Map

The Memory **model types** (`MemoryEntry`, `MemoryReader`, `MemoryKind`) are
defined in `@athena-os/core` per RFC-0013 §The Contract (one concept, one
canonical definition). Retrieval **implementation** lives in a new package,
`packages/memory`, which depends on those core types:

| Concern | Module |
|---------|--------|
| Retrieval contract types | `retrieval/contract.ts` |
| Deterministic reference | `retrieval/reference.ts` |
| In-memory store (write half, RFC-0013) | `memory/inMemory.ts` |
| Context assembly | `memory/context.ts` |
| Retrieval fixtures | `conformance/fixtures/retrieval.ts` |
| Retrieval harness | `conformance/harness.ts` |

Implementation begins only after this RFC and the stack (0015, 0016) are
accepted, per RFC-0013's discipline note.

## 7. Non-Goals (explicitly out of this RFC)

- Preference dimension semantics and projection into soft constraints —
  RFC-0015.
- Trigger evaluation, scheduling, recurrence, firing — RFC-0016.
- Learning from `experience` — later RFC.
- Persistence: files, SQLite, object stores, synchronization —
  implementation choice.
- Wide-recall relevance scoring (embeddings, LLM ranking) as the *certified*
  baseline — the certified baseline is `requested`-subject targeted; broad
  recall is the model-backed variant of §5.

## Glossary

To avoid colliding with RFC-0005 §4's use of "Context", this RFC fixes the
following terms:

| Term | Meaning |
|------|---------|
| **Context** (RFC-0005 §4) | The ambient world state at planning time (device, user, environment, session history). Representation-independent; session-scoped. Memory is its *persistent* portion. |
| **Memory** (RFC-0013) | The persisted, typed knowledge store (`fact` / `preference` / `experience` / `trigger`). The persistent backing of Context. |
| **RetrievalResult** (this RFC) | The ordered, de-duplicated `MemoryEntry[]` a retriever returns for a request. It is **not** the RFC-0005 §4 Context. |
| **MemoryReader** (RFC-0013 §The Contract) | The read-only handoff the engine gives a memory-aware backend (`memory?: MemoryReader`); retrieval runs against it. |

## Cross-References

- RFC-0013 — the memory model: entity types, lifecycle, subjects, and the
  authority boundary retrieval must honor.
- RFC-0005 §4 — Context, the transport that carries Memory into reasoning;
  this RFC's `RetrievalResult` is merged into it (see §2).
- RFC-0012 — the ReasoningBackend contract whose candidate path consumes
  Context.
- RFC-0011 — the validator that retrieval can never bypass.
- RFC-0015, RFC-0016 — the semantics on top (preferences, triggers), closed
  before implementation begins.