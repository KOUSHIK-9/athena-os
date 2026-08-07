# Architecture Review — Milestone 5A (RFC-0013: Memory Model)

**Date:** 2026-08-07
**Scope:** RFC-0013 (Memory Model) — Draft
**Grounding:** RFC-0005 (Intent Model), RFC-0007 (Constraint & Governance),
RFC-0009 (Reasoning Contract), RFC-0011 (Deterministic Engine), RFC-0012
(Backend Contract)
**Purpose:** Stress-test Memory before it becomes Athena's fifth foundational
pillar. Everything downstream (0014 Retrieval, 0015 Preferences, 0016
Triggers, Learning) will cite this RFC.

---

## Part 1 — Vocabulary Stress Test

| Concept | One-Sentence Definition (RFC-0013) | Overlaps? | Ambiguities? | Notes |
|---------|-----------------------------------|-----------|--------------|-------|
| **Fact** | What is believed to be true about the world or the user, in the present | Preference, Experience | "believed by whom?" | No verification/confidence model yet |
| **Preference** | How the user wants things done | Fact, (soft) Constraint | "never X" phrasing sounds constraint-like | RFC-0007 defines soft constraints as "preferences with weights" — must reconcile |
| **Experience** | Outcome of a past reasoning+execution | Fact, Telemetry | "outcome" vs "derived belief" | Telemetry is operational data (excluded); Experience is preserved knowledge |
| **Trigger** | Future condition Athena is asked to act on | **RFC-0005 §6 Trigger (existing)** | — | **RFC-0005 already canonically defines Trigger.** 0013 must cite, not redefine |

**Critical finding #1 — Trigger is already protocol-owned.** RFC-0005 §6
defines Trigger ("a temporal or event-based condition that initiates or
schedules an Execution Plan") and RFC-0009 lists it as a contract input
(Optional, attached to the Intent). RFC-0013's `trigger` memory type must be
positioned as **the persistent record of an RFC-0005 Trigger** — the memory
stores it; the protocol semantics (initiation, idempotency, orchestration
evaluation) stay in 0005. Otherwise we violate "one concept, one owner."

**Critical finding #2 — Context is the missing bridge.** RFC-0005 §4 defines
Context: ambient state at planning time, including "user profile:
preferences" and "session history," and it is *"scope-bound: does not
persist across unrelated Intents unless explicitly carried forward."*
RFC-0009 lists Context as an optional read-only contract input. RFC-0013
never mentions Context — yet Memory is precisely the mechanism that carries
Context forward between sessions. The relationship must be made explicit
(Part 5).

**Finding #3 — no verification/confidence on facts.** "Passport valid
through 2029" is asserted, unverified. Stale facts persist until superseded
or deleted. Acceptable for Draft; must be acknowledged (Fact = asserted
knowledge; RFC-0014 retrieval weights it).

---

## Part 2 — Orthogonality Test (one object, one type)

Can one object accidentally be two types?

| Candidate | Fact? | Preference? | Experience? | Trigger? | Verdict |
|-----------|-------|-------------|-------------|----------|---------|
| "user prefers window seats" | ⚠️ a fact *about* a preference | ✅ canonical | | | Needs classifier rule |
| "flight booking failed" | ⚠️ a fact *derived from* outcome | | ✅ canonical | | Needs classifier rule |
| "every Monday briefing" | | | | ✅ canonical (0005 §6 semantics) | Distinct by "condition to act" |
| "Settings app crashed" | ⚠️ | | ✅ (experience) | | Same as booking failure |

**Finding #4 — the taxonomy needs a classification precedence rule.** A
single assertion must land in exactly one type. Proposed deterministic rule
(evaluate in order):

```
1. If the entry asserts a future condition to act on  → trigger
2. Else if it asserts how the user wants things done   → preference
   (normative voice — "prefer", "never", "always")
3. Else if it is an outcome of Athena's own execution  → experience
4. Else                                              → fact
```

Plus one prohibition: **no entry may be dual-typed**, and a fact may not
carry a preference payload (preference-vocal assertions are Preferences,
full stop). Without this, the four-type ontology silently collapses back
into one "data" type.

**Finding #5 — "never book red-eye flights" must not read as a 5th type.**
"Never X" is normative voice → Preference (rule 2). Memory never emits
constraints; at assembly time a Preference may *project* to a soft
constraint with weight (RFC-0007), and the user may attach a hard
constraint to a specific Intent through the protocol — but that attachment
is an Intent-time act, not a memory type. RFC-0013 should say this
explicitly or the reader will invent "hard preferences."

---

## Part 3 — Authority Verification

The required flow:

```
Memory → Reasoning → Validator → Execution
```

| Check | RFC-0013 states | Verdict |
|-------|-----------------|---------|
| Validator never reads Memory | §6, §Conformance | ✅ |
| Simulation / Graph builder memory-blind | §6 | ✅ |
| Memory cannot bypass validation | §6 consequences | ✅ |
| Memory cannot create/veto goals, add constraints | §7 table | ✅ |
| Experience outcome cannot retroactively alter verdicts | §6 | ✅ |
| **Write path is explicit?** | — | ❌ **Missing arrow** |

**Finding #6 — the write path is undefined in the diagram.** Read path is
Memory → Reasoning. But *who writes Experience?* The Execution Engine,
post-action (Action → Verification → Telemetry → Memory). The RFC says
"system (append-only)" but draws no arrow. Two arrows must both be
explicit:

```
READ:  Memory → Context → ReasoningBackend (candidate)
WRITE: Execution → Experience → Memory   (side-channel; never a planning input)
```

This also prevents a subtle leak: without the write arrow, nothing prevents
a future reader from believing Reasoning writes Memory. It doesn't — the
Execution Engine records outcomes; reasoning only reads.

---

## Part 4 — Lifecycle Stress Test

| Question | RFC-0013 answer | Gap |
|----------|-----------------|-----|
| When is a Fact forgotten? | Superseded (same subject, newer) or user deletion | "Same subject" needs a deterministic identity rule |
| When is a Preference updated? | Superseded on same dimension | Dimension = subject; same rule needed |
| When does an Experience expire? | Never (append-only) | ✅ policy stated; retention = storage concern (out of scope) |
| When does a Trigger disappear? | Fired-and-satisfied or cancelled; recurring never | **Transition states unnamed** — pending → fired → satisfied / re-armed / cancelled |

**Finding #7 — supersession needs a determinism rule.** The conformance
section already says "a newer entry on a subject replaces the older one on
read," but RFC-0013 never defines *what a subject is*. Proposed: `subject`
is the canonical identity string of the thing the entry is about (e.g.,
`user.homeAirport`, `user.preference.seat`, `plan.plan-intent-x`) and
supersession = same `subject`, higher `recordedAt`; ties broken by `id`.
Conformance requires this be stated, not implied.

**Finding #8 — Trigger lifecycle states are unnamed.** Minimal state model
for the memory type: `pending → fired → satisfied` (disappears) /
`re-armed` (recurring) / `cancelled` (user). Evaluation mechanics belong to
RFC-0016; the *states* belong to the memory model so retrieval and
conformance are deterministic.

---

## Part 5 — Relationship Test (one arrow per concept)

| Link | Required arrow | Found? |
|------|----------------|--------|
| Memory → Reasoning | Memory → **Context** (0005 §4) → planning inputs (0009 §1) | ❌ RFC-0013 doesn't mention Context |
| Trigger → protocol | memory `trigger` ⇢ RFC-0005 §6 Trigger ⇢ attached Intent | ⚠️ Undefined relationship to 0005 |
| Preference → plan | Preference ⇢ soft constraint (0007, weighted) at assembly | ⚠️ Implied in §7, never stated |
| Execution → Memory | Execution Engine ⇢ `experience` (write) | ❌ No arrow (Finding #6) |
| Memory → Validator | **none** — validator is memory-blind | ✅ |

**Finding #9 — RFC-0013 must declare Memory as the persistent backing of
Context.** RFC-0005 §4 already lists "user profile: preferences" and
"session history" as Context categories and scopes Context to a session
"unless explicitly carried forward." Memory is the *explicit carry-forward*.
This resolves the contract cleanly without touching RFC-0009's input
table: Memory informs reasoning *through the existing Context input* —
one arrow, no new input kind, no amendment to an Accepted contract.

Trigger reconciliation (Finding #1) closes the loop: 0013 stores the
condition, 0005 owns its meaning, 0016 will own evaluation.

---

## Part 6 — Scenario Stress Tests

| Scenario | Representable in 4 types? | Mapping |
|----------|---------------------------|---------|
| "Book me a flight to Japan next month" | ✅ | facts (home airport, passport) + preferences (airline, seat) → Context → backend |
| "Message Alice" | ✅ | fact (Alice's contact identity) |
| "Weekly news briefing" | ✅ | trigger (recurring; 0005 §6 semantics) |
| "Remember I like aisle seats" | ✅ | preference |
| "Never book red-eye flights" | ✅ | preference (normative voice; rule 2) — projects to weighted soft constraint at assembly; hard attachment is Intent-time only (Finding #5) |
| "Forget my work address" | ✅ | user-deletion of a fact (ownership table) |

**No fifth type is required in any scenario.** The "never" case is the only
near-miss, resolved by the classification rule + the projection rule.

---

## Summary of Findings

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | Trigger collides with RFC-0005 §6 (concept already protocol-owned) | **High** | Cite 0005 §6 as canonical owner; 0013's trigger = persistent record thereof |
| 2 | Memory ↔ Context relationship undefined (0005 §4 / 0009 §1) | **High** | Declare Memory = persistent backing of Context; memory informs via the existing Context input |
| 3 | No classification precedence rule (orthogonality) | **High** | Add the 4-step classifier + no-dual-typing prohibition |
| 4 | "Never X" could read as a 5th type | Medium | State: normative voice → Preference; Memory never emits constraints; soft-constraint projection at assembly; hard attachment is Intent-time |
| 5 | Write path (Execution → Experience) not drawn | Medium | Add WRITE arrow to §6 diagram |
| 6 | Supersession needs a subject/identity rule | Medium | Define `subject` identity + deterministic supersession (same subject, higher recordedAt, tie by id) |
| 7 | Trigger lifecycle states unnamed | Low | Add pending → fired → satisfied / re-armed / cancelled |
| 8 | Facts have no verification/confidence stance | Low | Acknowledge: facts are asserted knowledge; verification is retrieval/use-time (0014) |

## Decisions Needed (before Acceptance)

1. **Subject identity syntax** — canonical string per subject (e.g.,
   `user.homeAirport`) — confirm the convention.
2. **Preference projection** — confirm: at assembly a Preference may become
   a *soft* constraint (weighted); only Intent-time attachment can produce
   a hard constraint. No "hard preference" type.
3. **Trigger states** — confirm the 5-state mini-model ships in 0013 (with
   evaluation mechanics deferred to 0016).

## Recommendation

**PASS — RFC-0013 is conceptually sound; adopt the eight amendments before
marking Accepted.** All fixes are additive clarifications; none change the
four-type ontology, the authority boundary, or the lifecycle philosophy.
Findings #1–#2 are the only genuinely architectural items (reconciliation
with the existing protocol), and both resolve *without* touching Accepted
RFCs — 0013 aligns to them.

Amend, then status: **Draft → Accepted.**

---

*End of ARCHITECTURE_REVIEW_M5A.md*
