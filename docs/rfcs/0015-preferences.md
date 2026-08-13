# RFC-0015: Preferences

- Status: **Accepted**
- Reference Implementation: **implemented** — `preference` MemoryEntry kind flows
  through `DeterministicRetriever` (always-eligible set) into `ReasoningBackendResult.retrievedMemory`.
- Authors: Athena Core Team
- Created: 2026-08-13
- Depends on: RFC-0005 (Intent Model), RFC-0007 (Constraint Governance Model),
  RFC-0013 (The Memory Model), RFC-0014 (Memory Retrieval)

---

## Abstract

`preference` is one of the four Memory types defined by RFC-0013: the knowledge
of **how the user wants things done**. This RFC specializes RFC-0013 for
preferences — their semantics, subject identity, supersession, conflict
resolution, expiration/invalidation, projection into soft constraints, override
by explicit intent, and retrieval interaction. It is a specialization, not a
new subsystem: every rule here is consistent with RFC-0013's general Memory
model and RFC-0014's retrieval contract, and it never crosses the authority
boundary in RFC-0013 §6 / RFC-0011 §1.5.

## 1. Preference Semantics

A `preference` entry asserts a **normative** claim about how the user wants
things done. It is recognized by voice, per RFC-0013 §3 precedence:

- "prefer", "never", "always", "usually" → preference.
- "user prefers window seats" is a preference; "user has a window seat
  booked" is a `fact`. Confusing the two is the most common classification
  error — facts describe the world, preferences prescribe desired behavior.

A preference has:

- `subject` — its canonical dimension (see §2).
- `payload` — the typed preference value (e.g. `window` for
  `user.preferredSeat`).
- `weight` (optional) — a planner hint in `[0,1]` for soft-constraint
  projection (§6); default `1.0`.

There is **no "hard preference" type**. A preference is always a bias, never a
requirement. If the user demands something as a requirement, that is an
**explicit Intent constraint** (RFC-0005 §3), not a memory preference.

## 2. Subject Identity

The preference `subject` is its dimension — a canonical dotted identifier,
exactly as RFC-0013 §5 defines for all Memory entries:

```
user.preferredSeat        user.language          user.mealPreference
travel.cabinClass         device.defaultBrowser  calendar.work
```

Subject identity is stable and implementation-independent; two preferences on
the same subject are the same dimension and are reconciled by supersession (§3).

## 3. Supersession

Preferences follow RFC-0013 §5's general supersession rule unchanged:

- Two entries conflict when they share a `subject`.
- The later `recordedAt` wins; ties broken by `id` ascending.
- The superseded entry is retained (append-only) but excluded from reads.

Example: `user.preferredSeat = window` superseded by
`user.preferredSeat = aisle` → retrieval returns only `aisle`.

## 4. Conflicts

- **Preference vs preference (same subject):** resolved by supersession (§3).
  No merging of payloads — the newer entry fully replaces the older on that
  dimension.
- **Preference vs preference (different subject):** independent; both may
  project as separate soft constraints (§6). The planner weighs them by
  `weight`.
- **Preference vs fact:** a fact describes the world, a preference prescribes
  desire. They live on different subjects by construction (§2); if a fact and a
  preference somehow share a subject it is a classification error to fix at
  write time, not a runtime conflict.
- **Preference vs explicit Intent constraint:** see §7.

## 5. Expiration & Invalidation

Per RFC-0013 §5, preferences **never expire by age**. They are removed only by:

- **Supersession** on the same subject (§3), or
- **Explicit user invalidation** (the user, or user-confirmed action, deletes
  or replaces the preference — ownership rules from RFC-0013 §4 apply:
  preferences are deletable only by the user).

"Ephemeral" user state (current mood, this-session toggle) is **not** a
preference and is not Memory (RFC-0013 §5).

## 6. Projection to Soft Constraints

At **planning time** (never inside retrieval — RFC-0014 §2), a retrieved
preference MAY project into a weighted **soft constraint** under RFC-0007:

- `user.preferredSeat = window` → soft constraint `PreferWindowSeat`
  (weight = preference `weight`, default `1.0`).
- The soft constraint **biases candidate selection** (e.g. the planner orders
  or prefers window-seat steps) but never *blocks* a plan. A plan that cannot
  satisfy it remains valid and is simply ranked lower.
- Projection is local to the candidate path behind the RFC-0012 backend seam
  (RFC-0013 §7). It does not mutate the `ExecutionPlan` post-candidate and
  never self-certifies a plan.

This is the only mechanism by which a preference influences reasoning, and it
is intentionally weak: preferences inform, they do not authorize.

## 7. Explicit-Intent Override

An **explicit Intent constraint** (RFC-0005 §3) always wins over any memory
preference on the same dimension:

- If the Intent attaches a **hard** constraint (e.g. "I must have a window
  seat"), it is a requirement; the planner must satisfy it, and any conflicting
  preference is irrelevant (the preference may still project as a redundant soft
  constraint, which is harmless).
- If the Intent is silent on a dimension, the preference projects as a soft
  constraint (§6).
- The reverse never holds: a preference can never override or relax an Intent
  constraint. Memory cannot add or override constraints (RFC-0013 §7).

## 8. Retrieval Interaction

Preferences are retrieved exactly like any other Memory entry under RFC-0014:

- The retriever selects `preference` entries by `subject` via the `requested`
  set, or includes them in the always-eligible set when applicable
  (RFC-0014 §1).
- `intentKind` scoping (RFC-0014 §1) applies: a one-off action request does not
  receive `trigger` entries; preferences are not subject-kind gated.
- Retrieval returns immutable `MemoryEntry` values; projection (§6) happens
  downstream in the backend, never in the retriever.

## 9. Authority Boundary

Preferences obey RFC-0013 §6 / RFC-0011 §1.5 without modification:

- A preference **never becomes a hard constraint** and never blocks or creates
  a constraint (RFC-0013 §7).
- The Validator is **memory-blind**: it never reads preferences; a
  preference-biased candidate the validator rejects is simply wrong.
- Preferences cannot add goals, constraints, or decision points to protocol
  objects, and cannot alter the validator's verdict.

## 10. Conformance

An implementation conforms when:

1. A stored `preference` on `user.preferredSeat = window` retrieves as that
   entry and projects to a *soft* `PreferWindowSeat` constraint (plan remains
   valid if unsatisfied).
2. Storing `user.preferredSeat = aisle` after `window` returns only `aisle`
   (supersession, §3).
3. An Intent with hard constraint "window seat" produces a plan that satisfies
   it regardless of a conflicting `aisle` preference (§7).
4. An empty Memory produces the baseline candidate with **no** preference
   projection (RFC-0013 Conformance: empty memory changes nothing).
5. Projection occurs only at planning time, never during retrieval (§6, §8).

## 11. Non-Goals

- Trigger evaluation, scheduling, recurrence, firing — RFC-0016.
- Learning from outcomes (telemetry → memory → future reasoning) — later RFC.
- Multi-agent preference negotiation — later RFC.
- Storage engines and persistence — RFC-0013 (implementation choice).
- The semantic meaning of specific dimensions ("dark mode" vs "vegetarian"):
  dimensions are user-defined subjects; this RFC defines the *mechanics*, not
  the vocabulary.

## Cross-References

- RFC-0013 — the Memory model: preference is one of four types; supersession,
  ownership, authority boundary, and soft-constraint projection are defined here
  against it.
- RFC-0014 — retrieval: preferences are retrieved as `MemoryEntry` values;
  projection happens downstream of retrieval.
- RFC-0007 — constraint governance: preferences project only to *soft*
  constraints, never hard ones.
- RFC-0005 §3 — explicit Intent constraints, which override preferences (§7).
- RFC-0011 §1.5 — the validator authority that stays memory-blind.
- RFC-0016 — triggers, which interact with preferences only at planning time.
