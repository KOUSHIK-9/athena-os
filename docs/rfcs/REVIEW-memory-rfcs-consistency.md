# RFC Consistency Review — Memory RFCs (0013, 0014) and Cross-References

> **Correction notice.** An earlier draft of this review contained fabricated and
> incorrect content for RFC-0014: it described an `EngineContext`, `intentCache`
> (5-min TTL), `Runtime Signals`, a `ContextRetriever`/`ContextAssembler`,
> `CapabilityRegistry` "usage notes" / "cost profiles", and a `ContextAggregator`
> that **do not exist** in the actual RFCs. It also mis-stated RFC-0013 as a
> "Draft / placeholder" (it is **Accepted**) and mis-cited RFC-0009 "§4.1"
> (§4 is *Failure Modes*). Those claims have been retracted. This version is
> based on a re-read of the actual files on disk.

**Scope:** Documentation/RFC consistency across the Memory subsystem and its
integration points. Focus: RFC-0013 (Memory Model), RFC-0014 (Memory
Retrieval), and their references to RFC-0005 §4, RFC-0009, RFC-0011, RFC-0012.

**Method:** Read the actual RFCs + the `ReasoningBackend` contract
(`packages/reasoning/src/backend.ts`) and the core capability/contract types
(`packages/core/src/contract.ts`). No automated doc-consistency / lint script
exists in `scripts/` or `docs/`, so this is a manual review.

**Severity:** Blocker > High > Medium > Low.

---

## Summary (corrected)

| # | Issue | Severity | Where |
|---|-------|----------|-------|
| A | Memory → ReasoningBackend integration is described **three incompatible ways**, and all conflict with the real `reason(intent, registry)` signature | High | 0013 §243 vs 0013 §7 / 0009 §1; 0014 §2; 0012:50; `backend.ts:40` |
| B | RFC-0014 §2 redefines RFC-0005 §4 `Context` as `{ intent, memoryEntries }`, contradicting §4's definition (ambient world state, representation-independent) | Medium | 0014 §2 vs 0005 §4 |
| C | Package ownership conflict: RFC-0013 §266 puts Memory model types in `@athena-os/core`; RFC-0014 §6 puts implementation (and implies the types) in `packages/memory` | Medium | 0013 §266 vs 0014 §6 |
| D | "Context" naming collision between RFC-0005 §4 (world state) and RFC-0014's retrieval result; no shared glossary | Medium | 0005 §4, 0013 §7, 0014 §2 |
| E | RFC-0014 references future RFC-0015/0016 — informational only, no action | Low | 0014 §1, §7 |

**Consistent (verified):** Validator authority (RFC-0011 §1.5) is preserved —
RFC-0013 §6 and RFC-0014 §3 confirm retrieval is a read-only supplier, never an
authority, and an invalid plan never leaves the engine. The
candidate → validator → simulation → graph pipeline in `backend.ts` matches
RFC-0009/RFC-0012.

---

## Detailed Findings

### A. Conflicting integration mechanisms (High)

How Memory/retrieval reaches the ReasoningBackend is described three different
ways, and none of them agree with the actual backend signature
`reason(intent: Intent, registry: CapabilityRegistry)` (`backend.ts:40`,
RFC-0012:50):

1. **RFC-0013 §243 (Accepted) — `MemoryReader` handoff:**
   > "Keeps `reason(intent, registry)` exact — a memory-aware backend is handed
   > an optional read-only view and either ignores it. The engine wiring gains
   > `memory?: MemoryReader` solely as handoff."

   → The backend receives a `MemoryReader` and pulls memory itself; `reason`
   signature is unchanged.

2. **RFC-0013 §7 / RFC-0009 §1 — through the RFC-0009 *Context input*:**
   > §7: "Memory reaches the Reasoning Backend through the existing Context input
   > of RFC-0009 §1 — no new input kind, no amendment to an accepted contract."
   > RFC-0009 §1 lists `Context` (RFC-0005 §4) as a contract **Input**.

   → Memory is delivered as part of the contract's `Context` input. But the
   `reason(intent, registry)` signature omits `Context`, so this contradicts
   mechanism (1) *and* the actual signature.

3. **RFC-0014 §2 — retrieval assembles a `Context` object pushed to the backend:**
   ```
   retrieve(...) → entries
      ↓
   Context (RFC-0005 §4, session-scoped) { intent, memoryEntries: entries }
      ↓
   ReasoningBackend (candidate)
   ```
   → Implies retrieval produces entries that are packed into a `Context` object
   and handed to the backend. Again, `reason(intent, registry)` takes no such
   object; and (see finding B) that object is not RFC-0005 §4 `Context`.

**Impact:** An implementer cannot tell whether memory arrives via (a) a
`MemoryReader` handoff, (b) the RFC-0009 `Context` input, or (c) an
engine-assembled `Context` object. The three mechanisms are mutually
inconsistent and two of them contradict the shipped contract signature.

**Recommended resolution (align to the Accepted RFC-0013 §243 model):**
- RFC-0014 §2 should describe retrieval as an **engine-internal step** that
  produces entries, which the engine exposes to the backend through the
  `memory?: MemoryReader` handoff (RFC-0013 §243). Drop the "Context object
  pushed to ReasoningBackend" framing.
- RFC-0013 §7's "through the existing Context input of RFC-0009 §1" should be
  softened to: "memory informs the RFC-0009 §1 `Context` (as its persistent
  portion) **and** is directly accessible to a memory-aware backend via the
  `MemoryReader` handoff."

### B. RFC-0014 §2 redefines RFC-0005 §4 Context (Medium)

RFC-0005 §4 defines `Context` as *"the ambient state of the world available to
the Reasoning Engine at planning time"* — device state, user profile,
environmental, session history — explicitly **representation-independent**
(structured object, vector embedding, or NL summary) and session-scoped.

RFC-0014 §2 instead writes:

> `Context (RFC-0005 §4, session-scoped) { intent, memoryEntries: entries }`

This asserts RFC-0005 §4 `Context` has a specific shape `{ intent,
memoryEntries }`, which it does not. The retrieval *result* (memory entries) is
one contributor to Context, not a redefinition of it.

**Fix:** In RFC-0014 §2, stop labeling the assembled object as "Context
(RFC-0005 §4)". Name it `RetrievalResult` (or `MemoryContext`) and state it is
**merged into** the RFC-0005 §4 `Context` by the engine (as the persistent
memory portion), not equal to it. Update the §2 diagram line accordingly.

### C. Package ownership conflict (Medium)

- RFC-0013 §266: *"the Memory model types belong to `@athena-os/core` (one
  concept, one canonical definition), exactly as `Intent` and `Constraint` do."*
- RFC-0014 §6: *"Implementation lives in a new core package, `packages/memory`"*
  and Conformance §4 references
  `packages/memory/conformance/fixtures/retrieval.ts`.

These are reconcilable (model types in `@athena-os/core`; retrieval
implementation + fixtures in `packages/memory`, depending on core), but RFC-0014
§6 reads as if the types themselves live in `packages/memory`.

**Fix:** In RFC-0014 §6, state explicitly that the Memory *model types*
(`MemoryEntry`, `MemoryReader`, etc.) are defined in `@athena-os/core` per
RFC-0013, and `packages/memory` *implements* retrieval against those types.

### D. "Context" naming collision / missing glossary (Medium)

Three distinct things are called "Context":

- **RFC-0005 §4 `Context`** — ambient world state at planning time (device,
  user, environment, session history). Not Memory.
- **RFC-0013 `Memory`** — the *persistent backing* of that Context (§7).
- **RFC-0014 retrieval result** — the memory entries selected for an intent
  (mislabeled "Context" in §2, per finding B).

No RFC defines these terms in one place, so a reader can't tell which "Context"
a sentence means.

**Fix:** Add a short glossary to RFC-0014 (or a shared `docs/rfcs/README`
section) naming each uniquely, and consistently use `RetrievalResult` (not
"Context") for RFC-0014's output.

### E. Future RFC references (Low / informational)

RFC-0014 §1 ("Richer intent-kind ↔ preference interplay is RFC-0015
territory") and §7 (Non-Goals: preferences → RFC-0015, triggers → RFC-0016)
reference RFC-0015/RFC-0016, which are not yet present in `docs/rfcs`. This is
expected for a Draft that depends on a future stack; no change required, noted
for completeness.

---

## Recommendations (priority order)

1. **A (High):** Reconcile the integration mechanism — align RFC-0014 §2 to the
   Accepted RFC-0013 §243 `MemoryReader` handoff model; clarify RFC-0013 §7.
2. **B + D (Medium):** In RFC-0014 §2, rename the assembled object to
   `RetrievalResult` and stop equating it with RFC-0005 §4 `Context`; add a
   glossary.
3. **C (Medium):** Clarify package ownership in RFC-0014 §6 (types in
   `@athena-os/core`, implementation in `packages/memory`).

All fixes are **documentation-only**; the chosen model keeps
`reason(intent, registry)` exact, matching `backend.ts`, so no code change is
required.

## Note on automated checks

Implemented as `scripts/rfc-consistency-check.mjs` (run via `pnpm run test:rfcs`).
It fails the run if any `RFC-00NN` citation has no matching file (unless the
number is in the planned-RFC allowlist, e.g. 0010/0015/0016) or cites a
non-existent section (e.g. `RFC-0009 §4.1`), and warns if
`docs/rfcs/GLOSSARY.md` is missing or omits the canonical terms (`Context`,
`Memory`, `RetrievalResult`, `MemoryReader`). This directly guards against the
fabricated-review failure mode: every citation is now validated against real
files and real section headings.
