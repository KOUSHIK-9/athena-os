# Milestone 3 — Conceptual Architecture

- Status: **Baseline Established**
- Date: 2026-08-07
- Depends on: Milestone 2 (`v0.3.0-alpha.1`, commit `5a9e4cb`)

## Summary

Milestone 3 established the **conceptual language of Athena**: the ontology,
grammar, governance, approval protocol, and reasoning contract that every
future component must speak. No implementation code was written — this
milestone is pure architecture, validated by a cross-RFC consistency review.

This is the milestone where Athena stopped being an automation project and
became a **protocol-driven reasoning and execution platform**.

## Deliverables

- **RFC-0005: Intent Model (Accepted)** — the ontology: Intent, Goal,
  Constraint, Context, Resource, Trigger, Execution Plan, Capability, Action,
  Result, Decision Point. Single source of truth for the vocabulary.
- **RFC-0006: Execution Plan Model (Accepted)** — the grammar: plan validity,
  lifecycle states (incl. Waiting), Plan Identity, Plan Invariants, branching/
  merging/parallelism, portability, progress at Goal level.
- **RFC-0007: Constraint and Governance Model (Accepted)** — constraint
  categories, conflict detection/resolution, authorities, policies, approval
  workflows, audit log, policy-as-code.
- **RFC-0008: Decision Point Protocol (Accepted)** — the approval state
  machine (Pending/Granted/Denied/Expired/Cancelled/Rescinded), timeout
  semantics, audit requirements, retry/cancellation behavior.
- **RFC-0009: The Contract Between Intent and Execution (Accepted)** — the
  permanent interface: inputs, Reasoning Result outputs (Execution Plan,
  Confidence, Assumptions, Alternatives, Clarification Requests), 8
  guarantees, 6 classified failure modes.
- **ATHENA_MANIFESTO.md v1.0 (Released)** — the philosophy, now supported by
  the architecture. Identity line: *"Intent is the API. Execution is the
  implementation."*
- **ENGINEERING_PRINCIPLES.md** — now includes Principle #10 (baselines not
  redesign targets) and #11 (one concept, one canonical definition); #12
  (contract permanence) remains a proposal pending ratification.
- **ARCHITECTURE_REVIEW_M3A.md** — the stress-test review: vocabulary,
  grammar, governance, 5 scenarios, red team, and the cross-RFC consistency
  review (all PASS).

## Decisions

- The reasoning layer is a **contract** (RFC-0009), not an implementation.
  Reasoning Engines are interchangeable backends.
- Every concept has **one canonical definition** (Engineering Principle #11);
  RFCs reference, never redefine.
- The **Execution Plan is the stable contract** between reasoning and
  execution (RFC-0009; Principle #12 as proposal).
- The architecture is **model-free**: deterministic planning is the primary
  path; LLMs are optional implementations of one step.
- Terminology: **Trigger** (not "Schedule") generalizes temporal and event
  initiation. **Clarification Requests** (not "Open Questions") are the
  reasoning output for Intent ambiguity.

## Lessons Learned

- Design the vocabulary before the grammar: RFC-0005 (nouns) had to be stable
  before RFC-0006 (verbs) could be written.
- Bulk-editing foundational documents causes documentation entropy
  (duplicated headings, mixed numbering). Each RFC has a single owner and
  discipline: patch, don't rewrite.
- Cross-RFC review catches drift: "hard vs mandatory" constraint terminology
  and "scope-bound Context" wording remain as known editorial nits.

## Remaining Debt (Non-Blocking)

- Editorial nits: align "hard"/"mandatory" Constraint terminology across
  RFC-0006/0009; tighten "scope-bound" Context wording in RFC-0005.
- Engineering Principle #12 not yet ratified (proposal status).
- RFC-0004 and RFC-0001/0002 predate the ontology; their vocabularies should
  eventually reference RFC-0005/0006 rather than stand alone.
- No implementation of the reasoning contract exists yet (that is Milestone 4).

## What Comes Next

- **Milestone 4 — Reasoning.** First deliverable: RFC-0011 Deterministic
  Reasoning Engine (prove Intent → Execution Plan without any LLM).
- Then: GPT/Claude as a second Reasoning Engine implementation (validator
  stays the authority — GPT is never trusted, only validated).
- Then: Memory, Voice, Browser Agent, macOS integration, personal-assistant
  behaviors — each must answer "which RFC does this implement?" before code.

## What a Baseline Means Here

Per Engineering Principle #10: this milestone is a **dependency, not a
redesign target**. RFC-0005..0009 are Accepted. Future work builds on them;
changing the ontology requires a deliberate, versioned decision.
