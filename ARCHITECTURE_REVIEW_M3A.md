# Architecture Review — Milestone 3A

**Date:** 2026-08-07  
**Scope:** RFC-0005 (Intent Model), RFC-0006 (Execution Plan Model), RFC-0007 (Constraint and Governance Model)  
**Purpose:** Stress-test the conceptual language before adding RFC-0008/0009.

---

## Part 1 — Vocabulary Stress Test

| Concept | One-Sentence Definition (from RFCs) | Overlaps? | Ambiguities? | Notes |
|---------|-------------------------------------|-----------|--------------|-------|
| **Intent** | Human's declared desire for a change in the world, expressed in domain language, without reference to *how*. | Goal? Context? | | "What, not how" — core distinction |
| **Goal** | A verifiable sub-outcome that contributes to satisfying an Intent. | Intent? Constraint? | "Verifiable" = by whom/what? | 1 Intent → 1..n Goals |
| **Constraint** | A declarative boundary condition that a valid Execution Plan must satisfy. | Goal? Preference? | Soft vs hard boundary clear? | Categories: hard, soft, safety, temporal, resource |
| **Context** | *(Not formally defined in RFC-0005)* | Intent? Constraint? Resource? | **Missing concept** | What is ambient state vs declared constraint? |
| **Resource** | *(Not formally defined)* | Constraint? Capability? | **Missing concept** | External dependencies: contacts, calendar, files, browser sessions |
| **Capability** | A verified, self-describing unit of execution that transforms the world (RFC-0004). | Action? | "Ability, never authority" — clear | Atomic unit of planning |
| **Action** | A single Capability invocation with concrete parameters, executed by the Execution Engine. | Capability? Result? | 1:1 with Capability invocation | Produces Result + Verification + Telemetry |
| **Execution Plan** | A DAG of Capability invocations with data/control flow, segmented by Decision Points, satisfying all Validity Rules. | Plan Segment? | Portable artifact — key property | DAG, not linear |
| **Plan Segment** | A maximal subgraph containing no Decision Points; executes atomically with respect to approval. | Execution Plan? | Bounded by Decision Points | |
| **Decision Point** | A plan node that halts execution until an approval authority grants consent for the gated segment(s). | Constraint? Governance? | Gates segments, not actions | Embodies governance decision |
| **Result** | The observable outcome of an Action. | Action? Verification? | Immutable once produced | |
| **Verification** | Confirmation that an Action achieved its intended effect. | Result? | Part of Action output tuple | No silent success |
| **Telemetry** | Structured evidence of an Action's execution (requestId, duration, attempts, device, etc.). | Result? | Part of Action output tuple | No silent failure |

**Findings:**
- `Context` and `Resource` are used informally but not defined in RFC-0005.
- `Preference` appears in examples but is defined only as "soft constraint" in RFC-0007.
- `Authority` lives in RFC-0007 (Governance) — correct boundary.
- `Plan Identity` and `Plan Invariants` in RFC-0006 are well-scoped.

---

## Part 2 — Grammar Stress Test (RFC-0006)

### Chain Completeness

```
Intent → Goals → Execution Plan → Plan Segments → Actions → Results
```

| Link | RFC-0005 | RFC-0006 | Consistent? |
|------|----------|----------|-------------|
| Intent → Goals | "decomposes into" | Goal Coverage Validity (Rule 4) | ✅ |
| Goals → Plan | "planned as" | Plan composed of Capability invocations | ✅ |
| Plan → Segments | "gated by Decision Points" | Plan Segments partition the DAG | ✅ |
| Segments → Actions | "composed of Capability invocations" | Actions execute Capabilities | ✅ |
| Actions → Results | "produces Result + Verification + Telemetry" | Conformance Rule 4 | ✅ |

**Missing links:**
- Goals → Constraints (RFC-0005 says Goals constrained by Constraints; RFC-0006 Rule 5 validates at plan level)
- Intent → Constraints (RFC-0005 says Constraints constrain Goals; RFC-0007 says Constraints apply at Intent/Goal/Segment level)

**Gap:** Constraints scoping (Intent-level vs Goal-level vs Segment-level) needs explicit mapping in RFC-0006 validity rules.

---

## Part 3 — Governance Stress Test (RFC-0007)

### Can Athena Say "No"?

| Scenario | Representable? | Mechanism |
|----------|----------------|-----------|
| Delete all photos | ✅ | Safety constraint: `forall node: node.capability != "delete"` OR hard constraint `noDestructiveActions = true` → plan invalid |
| Transfer ₹5,00,000 | ✅ | Policy: `IF capability = "financial-transaction" AND amount > 10000 THEN authority = "finance-director"` → Decision Point |
| Spend ₹80,000 | ✅ | Hard constraint `budget <= 80000` → plan invalid if violated |
| "Ask before paying" | ✅ | Decision Point with typed approval request `{type: "financial", amount: ...}` |

### Governance Boundaries Check

| Concept | RFC-0005 | RFC-0006 | RFC-0007 | Correct? |
|---------|----------|----------|----------|----------|
| Authority | — | `authorityBinding` on Decision Point | Defined (human, policy engine, external, composite) | ✅ |
| Policy | — | — | Defined (context → authority) | ✅ |
| Approval Workflow | Decision Point gates segment | Lifecycle: PendingApproval → Executing | Request → review → decision → audit | ✅ |
| Audit Log | — | Plan Identity includes lineage | Immutable, keyed by planId+revision | ✅ |
| Constraint Conflict | — | — | Conflict Resolution Protocol | ✅ |

**Finding:** Governance is well-scoped to RFC-0007. Decision Points in RFC-0006 correctly reference `authorityBinding`.

---

## Part 4 — Scenario Stress Tests

### Scenario 1: Flight Booking

```
"Book the cheapest flight to Japan next month under ₹80,000 window seat preferred ask before paying"
```

| Element | RFC-0005 | RFC-0006 | RFC-0007 | Notes |
|---------|----------|----------|----------|-------|
| **Intent** | "Book cheapest flight to Japan next month" | — | — | Single Intent |
| **Goals** | 1. Flight booked<br>2. Price confirmed<br>3. Payment approved | Goal Coverage Validity: each Goal mapped to plan nodes | — | 3 Goals |
| **Constraints** | Budget ≤ ₹80k (hard)<br>Next month (temporal)<br>Window seat (soft, weight) | Constraint Satisfaction Validity (Rule 5): all hard satisfied, soft evaluated | Constraint categories match | Budget = hard; temporal = hard; window = soft |
| **Governance** | — | Decision Point before payment segment | Policy: financial > threshold → authority | "Ask before paying" = Decision Point gating payment segment |
| **Decision Point** | Gates payment segment | Plan Segment partitioning | Typed approval request | Correctly gates segment, not individual action |
| **Success** | All Goals verified | Completed state | — | |

**Verdict:** Fully representable. No new concepts needed.

---

### Scenario 2: Reply to Message

```
"Reply to John: 'I'm running 10 minutes late.'"
```

| Element | Representation |
|---------|----------------|
| **Intent** | Send message to John with content "I'm running 10 minutes late." |
| **Goal** | Message delivered to John |
| **Constraints** | Recipient = John (hard); content exact match (hard); channel = preferred messaging app (soft) |
| **Approval** | None needed (below threshold) |
| **Decision Points** | None |
| **Plan** | Find John in contacts → Open chat → Type message → Send → Verify delivered |
| **Success** | Message sent + delivery verified |

**Verdict:** Fully representable. Simple Intent → 1 Goal → linear Plan.

---

### Scenario 3: Planning Without Execution

```
"Plan a Europe trip. Don't book anything. Just prepare everything."
```

| Question | Answer |
|----------|--------|
| **Intent?** | "Create a Europe trip itinerary" (not "book") |
| **Goal?** | Itinerary document produced |
| **Constraint?** | No booking actions allowed (hard constraint: `forall node: node.capability not in {"book-flight", "book-hotel", "charge-card"}`) |
| **Approval?** | None — planning only |
| **Decision Point?** | None |
| **Execution Plan?** | Yes — Capability invocations: search-flights, search-hotels, build-itinerary, save-document. All read-only Capabilities. |
| **Distinction** | The *Intent* declares the outcome (itinerary). Constraints forbid booking Capabilities. The plan contains no write operations. |

**Verdict:** Representable. Key insight: "planning vs execution" = Intent outcome + Constraint on Capability set. No new concept needed.

---

### Scenario 4: Photo Library Cleanup

```
"Clean my photo library. Never delete photos without asking."
```

| Element | Representation |
|---------|----------------|
| **Intent** | Organize photo library (remove duplicates, create albums, etc.) |
| **Goals** | 1. Duplicates identified<br>2. Albums created<br>3. Unwanted photos deleted (with approval) |
| **Constraints** | Safety: `noDeletionWithoutApproval = true` (hard); no deletion of photos < 30 days old (hard) |
| **Approval** | Decision Point before each deletion (or batch deletion segment) |
| **Decision Points** | Gate deletion segment(s) |
| **Recovery** | Compensating action: "restore from recently deleted" if deletion approved then regretted |
| **Governance** | Safety constraint + Decision Point = "never delete without asking" |

**Verdict:** Fully representable. Safety constraint + Decision Point + Recovery = complete governance story.

---

### Scenario 5: Morning Briefing (Recurring)

```
"Every morning, summarize my calendar, weather, Slack, and Gmail."
```

| Question | Answer |
|----------|--------|
| **Can today's concepts express this?** | **Almost.** Missing: recurrence / scheduling concept. |
| **Intent** | "Generate morning briefing" (one Intent, but recurring) |
| **Goals** | Briefing generated and delivered daily |
| **Constraints** | Temporal: execute at 07:00 daily; data sources: calendar, weather, Slack, Gmail |
| **Plan** | Fetch calendar → Fetch weather → Fetch Slack → Fetch Gmail → Synthesize → Deliver |
| **Missing** | No concept of **Schedule / Trigger / Recurrence** in RFC-0005/0006/0007. |

**Verdict:** **Not fully representable.** Needs:
- `Schedule` / `Trigger` concept (temporal constraint with recurrence)
- Or: Intent includes "recurring" metadata, Execution Engine handles scheduling externally

**Decision needed:** Is scheduling part of the Execution Plan Model (RFC-0006) or a separate orchestration layer?

---

## Part 5 — Red Team (Break Attempts)

| Question | Can it happen? | Architectural Reason / Fix |
|----------|----------------|----------------------------|
| **Can an Intent have no Goal?** | **No.** RFC-0005: "One Intent → one or more Goals." Goal Coverage Validity (RFC-0006 Rule 4) requires ≥1 Goal. | Enforced by validity rule. |
| **Can a Goal exist without an Intent?** | **No.** Goals are defined as "sub-outcome that contributes to satisfying an Intent." Orphan Goals have no semantic anchor. | Ontology: Goal is child of Intent. |
| **Can two Decision Points conflict?** | **Yes, if they gate overlapping segments.** RFC-0006 Decision Point Validity: "No two Decision Points gate overlapping segments (segments form a partition)." | Enforced by validity rule. |
| **Can Constraints contradict each other?** | **Yes.** RFC-0007 defines Constraint Conflict and Conflict Resolution Protocol. | Detected at validation; resolved via Decision Point or Intent rejection. |
| **Can one Action satisfy multiple Goals?** | **Yes.** RFC-0005: "Every Goal maps to ≥1 Capability invocation." Many-to-many allowed. | A "send email" Action could satisfy "notify user" AND "log communication" Goals. |
| **Can a Plan be valid but impossible?** | **Yes.** Validity = structural + static constraint satisfaction. Runtime impossibility (element gone, network down) = recovery/failure, not invalidity. | Determinism Validity (Rule 8) + Recovery Validity (Rule 7) handle this. |
| **Can an Execution Plan loop forever?** | **No.** Plan Invariants (RFC-0006): **Termination** — "Every maximal path in the DAG reaches an exit node (no infinite paths)." Acyclicity invariant forbids cycles. | DAG structure guarantees termination. |

**Finding:** Red team questions are all answerable with existing invariants/validity rules. The architecture defends itself.

---

## Summary of Findings

### ✅ Strong Alignments
- Vocabulary across RFCs is largely consistent (Intent, Goal, Constraint, Plan, Action, Decision Point)
- Grammar chain (Intent → Goals → Plan → Segments → Actions → Results) holds
- Governance boundaries correct (Authority in RFC-0007, Decision Point in RFC-0006, gating in RFC-0006 lifecycle)
- Invariants and validity rules provide mathematical grounding

### ⚠️ Gaps / Ambiguities

| # | Issue | Severity | Suggested Fix |
|---|-------|----------|---------------|
| 1 | `Context` undefined | Medium | Define in RFC-0005: ambient state available to Reasoning Engine (device state, user preferences, time, location) — distinct from Intent (declared) and Constraint (boundary) |
| 2 | `Resource` undefined | Medium | Define in RFC-0005 or RFC-0007: external dependencies (contacts, calendar, files, browser sessions, API credentials) — referenced by Capabilities, governed by policies |
| 3 | `Preference` only as soft constraint | Low | Clarify in RFC-0005: Preference = soft constraint with weight; add to glossary |
| 4 | Constraint scoping (Intent/Goal/Segment) | Medium | RFC-0006 Rule 5 should specify how scoping maps to validation |
| 5 | Schedule/Recurrence missing | **High** (Scenario 5) | Add `Trigger` / `Schedule` concept — either in RFC-0006 (Plan metadata) or new RFC |
| 6 | `Resource` governance | Medium | RFC-0007 policies should reference Resources (e.g., "access to Gmail requires authority") |

### 🔴 Decisions Needed

1. **Where does `Resource` live?** RFC-0005 (ontology), RFC-0007 (governance), or both?
2. **Is `Schedule` part of Execution Plan Model or orchestration layer?**
3. **Context vs Constraint vs Resource** — formalize three-way distinction.
4. **Preference** — elevate to first-class term in RFC-0005 glossary?

---

## Open Questions for Next Session

1. Should `Context` be part of the Intent Model (RFC-0005) or the Reasoning Engine Interface (RFC-0009)?
2. Does `Resource` need its own RFC, or is it a Capability metadata field + Governance policy target?
3. Schedule/Recurrence: Plan-level metadata (RFC-0006) or separate `Schedule` concept (new RFC)?
4. Should `Plan Invariants` include an explicit "Constraint Satisfaction" invariant (currently implied by Rule 5)?

---

## Recommendation

**Proceed to RFC-0008 after resolving:**
- #1 Context definition (add to RFC-0005)
- #2 Resource definition (add to RFC-0005 + RFC-0007)
- #5 Schedule concept (add to RFC-0006 as Plan metadata: `schedule?: ScheduleSpec`)

These are **additive clarifications**, not architectural changes. The core ontology/grammar/governance is sound.

Once RFC-0005/0006/0007 are patched for these gaps, the language is complete enough for:
- RFC-0008 Decision Point Protocol
- RFC-0009 Reasoning Engine Interface
- Deterministic Reasoning Engine implementation
---

## Cross-RFC Consistency Review (RFC-0005 → RFC-0009)

**Scope:** Validate the complete conceptual stack as one unit before promotion.

### 1. Dependency Graph — Acyclic ✅

```
RFC-0005 → RFC-0006 → RFC-0007 → RFC-0008 → RFC-0009
```

Each RFC's `Depends on` list references only lower-numbered RFCs. No circular
dependencies. Promotion can proceed in order.

### 2. Single Canonical Definition ✅

| Concept | Canonical Home | Elsewhere |
|---------|----------------|-----------|
| Intent | RFC-0005 §1 | RFC-0009 references (§1 Inputs) — no redefinition |
| Goal | RFC-0005 §2 | RFC-0006 references (Goal Coverage Validity) |
| Constraint | RFC-0005 §3 | RFC-0007 references + extends categories (same definition) |
| Context | RFC-0005 §4 | RFC-0006 glossary: "Defined in RFC-0005 §4" |
| Resource | RFC-0005 §5 | RFC-0006 glossary references; RFC-0007 clarifies "Resource constraint" ≠ Resource |
| Trigger | RFC-0005 §6 | RFC-0006 glossary references |
| Execution Plan | RFC-0005 §7 | RFC-0006 deepens (validity rules, lifecycle) — same definition, more grammar |
| Capability | RFC-0005 §8 | RFC-0004 (canonical home), RFC-0005 references |
| Action / Result | RFC-0005 §9/§10 | RFC-0001 (execution protocol) |
| Decision Point | RFC-0005 §11 | RFC-0006 (node), RFC-0007 (governance), RFC-0008 (behavior) — consistent |

**Verdict:** No concept is defined twice with different meanings. RFC-0006/0007
**extend** (grammar/rules) rather than **redefine** (ontology). Glossary
entries in 0006/0007/0008 explicitly say "Defined in RFC-0005 §N."

### 3. Relationships Clear ✅

The Protocol chain holds end-to-end:

```
Intent → Goals → Execution Plan → Plan Segments → Actions → Results
         (0005)   (0006)          (0006)         (0001)    (0001/0005)
```

New concepts integrated: Context informs planning (read-only), Resources are
declared dependencies, Triggers initiate. All three have protocol verbs in
RFC-0006's Ontology/Protocol table.

### 4. Every Example Representable ✅

| Example | Representable? | How |
|---------|---------------|-----|
| "Book cheapest flight to Japan, ≤₹80k, window seat, ask before paying" | ✅ | Intent + Goals + Constraints (hard/soft) + Decision Point (payment) |
| "Reply to John: I'm 10 min late" | ✅ | Intent + Goal + linear plan |
| "Plan Europe trip, don't book anything" | ✅ | Intent + hard constraint on capability set |
| "Clean photos, never delete without asking" | ✅ | Safety constraint + Decision Point + recovery |
| "Every morning summarize calendar/weather/Slack/Gmail" | ✅ (post-Trigger) | Intent template + Trigger (recurring) |

The recurring-briefing gap (previously the only failure) is closed by Trigger
(RFC-0005 §6).

### 5. Reasoning Failures Distinct from Execution Failures ✅

- **Reasoning failures** (RFC-0009 §4): no valid plan, constraint conflict,
  missing capabilities, ambiguous intent, insufficient context — occur *before*
  execution, structured Reasoning Result, never silent.
- **Execution failures** (RFC-0005 Recovery, RFC-0006 Lifecycle): transient /
  permanent / ambiguous Action failures — occur *during* execution.
- Boundary is explicit: RFC-0009 never runs Actions; the Execution Engine never
  reasons. No ambiguity about which layer owns a failure.

### 6. Remaining Nits (Non-Blocking)

1. **RFC-0005 §4 Context property "Scope-bound"** — "does not persist across
   unrelated Intents unless explicitly carried forward" is slightly informal;
   RFC-0009 doesn't yet specify how Context is passed (engine input). This is
   resolved by RFC-0009 §1 already (Context is an input) — just noting the
   phrase could be tightened. Non-blocking.
2. **RFC-0006 Validity Rule 5** references "all hard Constraints satisfied" —
   RFC-0007 calls them "mandatory Constraints" in Guarantee #2 of RFC-0009.
   Minor terminology drift ("hard" vs "mandatory") — worth aligning to one
   term ("hard") during promotion. Non-blocking.

### Verdict

**PASS — RFC-0005 through RFC-0009 are internally consistent and may be
promoted from Draft → Accepted as a unit.**

Recommended promotion order (each buildable on the prior):
1. RFC-0005 (no dependencies)
2. RFC-0006
3. RFC-0007
4. RFC-0008
5. RFC-0009

---

*End of ARCHITECTURE_REVIEW_M3A.md (updated with Cross-RFC Consistency Review)*
