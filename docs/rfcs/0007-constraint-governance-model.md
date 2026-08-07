# RFC-0007: Constraint and Governance Model

- Status: **Accepted**
- Authors: Athena Core Team
- Created: 2026-08-07
- Depends on: RFC-0005 (Intent Model), RFC-0006 (Execution Plan Model)

---

## Abstract

This RFC defines the **Constraint and Governance Model** — the rules that
govern what Execution Plans are permitted to do, who may authorize them, and
how conflicts between competing requirements are resolved.

Constraints restrict the *space of valid plans*. Governance defines *who decides*
when a plan pushes against those boundaries. Together, they ensure that
Athena's reasoning operates within boundaries that are explicit, auditable,
and enforceable without trusting the Reasoning Engine.

---

## Motivation

The Execution Plan is the contract between reasoning and execution. But a
contract is only meaningful if its boundaries are enforced.

Without a Constraint and Governance Model:

- A Reasoning Engine could generate a plan that violates budget, privacy, or
  safety policies.
- There would be no systematic way to detect conflicting requirements
  ("cheapest" + "business class" + "under $500").
- Approval would be ad-hoc rather than a first-class plan property.
- Organizational rules (compliance, data residency, role-based access) could
  not be expressed in the plan itself.

This RFC makes constraints and governance **first-class, checkable, and
enforceable** — part of the plan's validity, not an afterthought.

---

## Core Concepts

### Constraint

**Definition:** A declarative boundary condition that a valid Execution Plan
must satisfy. Constraints restrict the *space of valid plans*; they do not
prescribe *which* plan to choose.

**Categories:**

| Category | Enforcement | Examples |
|----------|-------------|----------|
| **Hard** | Must hold for plan to be valid. Violation = invalid plan. | Budget ≤ $500, departure after 6 PM, no layovers, data never leaves EU. |
| **Soft** | Evaluated with weights; plan optimizes for satisfaction. | Prefer window seat, minimize travel time, prefer direct flights. |
| **Safety** | Non-negotiable; violation = invalid plan + audit alert. | No destructive writes without approval, no credential exposure, no PII in logs. |
| **Temporal** | Time-bound conditions. | Deadline: 2026-08-15T18:00:00Z, maintenance window 02:00–04:00 UTC. |
| **Resource** | Limits on consumption. | Max 3 concurrent browser sessions, max 10 MB screenshot, rate limit 10 req/min. |

**Note on terminology:** "Resource constraint" (above) refers to *consumption limits*
(e.g., rate limits, concurrency caps). This is distinct from **Resource** (RFC-0005
§5) — an external entity (contacts, calendar, browser session, credentials) that a
plan may depend on. Access to Resources (RFC-0005 sense) is governed by the
policies and authorities defined in this RFC (§ Governance).

**Properties:**
- **Declarative:** Constraints state *what must be true*, not *how to achieve it*.
- **Checkable:** Given a candidate plan, a constraint evaluates to `satisfied`,
  `violated`, or `indeterminate` (cannot be determined statically).
- **Composable:** Multiple constraints combine via logical AND (all must hold
  for hard/safety; weighted sum for soft).
- **Scoped:** Constraints apply at Intent level, Goal level, or Plan Segment
  level.

### Constraint Expression

Constraints are expressed in a **formal, decidable language** (not natural
language). The language supports:

- Arithmetic comparisons (`budget <= 50000`)
- Temporal operators (`departure > now + 6h`, `deadline < 2026-08-15`)
- Set membership (`region in {EU, US}`)
- Logical connectives (`and`, `or`, `not`, `implies`)
- Quantifiers over plan nodes (`forall node: node.capability != "delete"`)
- References to plan parameters and Capability metadata

The language is **intentionally not Turing-complete** — it guarantees
decidability of constraint checking at plan validation time.

### Constraint Conflict

**Definition:** A set of constraints is **conflicting** iff no Execution Plan
exists that satisfies all of them simultaneously.

**Examples:**
- `budget <= 40000` AND `class = business` AND `route = DEL-NRT` (if business
  class on that route always costs > 40000)
- `dataResidency = EU` AND `useService = "us-west-2-api"`
- `noDestructiveActions` AND `goal = "delete account"`

**Conflict Detection:**
- Performed at **plan validation time** (static analysis).
- For hard/safety constraints: conflict = plan invalid.
- For soft constraints: conflict = Pareto frontier analysis (no plan dominates
  all others on all soft constraints).

**Conflict Resolution Strategies:**
1. **Relax soft constraints** (drop lowest-weight preferences).
2. **Escalate to Decision Point** (human chooses which hard constraint to
   relax).
3. **Reject Intent** (no valid plan exists under current constraints).
4. **Negotiate** (Reasoning Engine proposes alternative Intent with relaxed
   constraints).

### Governance

**Definition:** The system of **authorities**, **policies**, and **approval
workflows** that determine whether a plan (or plan segment) may execute.

Governance answers: *Who decides when a plan pushes against a boundary?*

**Components:**

| Component | Role |
|-----------|------|
| **Authority** | An entity (human, role, policy engine, external system) empowered to grant or deny approval. |
| **Policy** | A rule mapping (plan context, constraint type, risk level) → required authority. |
| **Approval Workflow** | The sequence of steps: request → review → decision → audit. |
| **Audit Log** | Immutable record of every approval request, context, decision, and timestamp. |

**Authority Types:**
- **Human:** Individual user or role (e.g., "finance-approver").
- **Policy Engine:** Automated evaluator (e.g., OPA/Rego, custom rules).
- **External System:** Third-party approval service (e.g., ITSM, CRM).
- **Composite:** Quorum (e.g., "2 of 3 security reviewers").

**Policy Examples:**
- `IF capability = "financial-transaction" AND amount > 10000 THEN authority = "finance-director"`
- `IF capability = "delete-data" AND dataClass = "PII" THEN authority = "privacy-officer" AND quorum = 2`
- `IF planSegment.containsCapability("send-email") AND recipientDomain != "company.com" THEN authority = "data-loss-prevention-engine"`

---

## Integration with Execution Plan Model (RFC-0006)

### Constraints in the Plan
- Every Execution Plan carries a **Constraint Set** (the union of Intent-
  level, Goal-level, and Segment-level constraints).
- **Validity Rule 5 (Constraint Satisfaction)** requires: all hard/safety
  constraints satisfied; soft constraints evaluated with weights.
- Constraint checking is a **static analysis pass** — no execution required.

### Decision Points as Governance Enforcement
- Every Decision Point (RFC-0006) **embodies a governance decision**.
- The Decision Point's `authorityBinding` references an Authority.
- The Decision Point's `typedApprovalRequest` contains the policy-relevant
  context for the authority to decide.
- **No execution past a Decision Point without approval** — enforced by the
  Execution Engine, not trusted to the Reasoning Engine.

### Governance Metadata in Plan Identity (RFC-0006)
- `createdBy` identifies the Reasoning Engine or human author.
- `derivedFromIntent` links to the Intent that originated the constraints.
- Audit log entries reference `planId` + `revision` for full traceability.

---

## Constraint Conflict Resolution Protocol

When validation detects a conflict:

```
Conflict Detected
       │
       ▼
Classify: Hard/Safety vs Soft
       │
       ├─ Hard/Safety Conflict ──► Escalate to Decision Point (human)
       │
       └─ Soft Conflict ──► Pareto Analysis
                │
                ├─ Dominated plans exist ──► Drop dominated
                │
                └─ True trade-off ──► Escalate to Decision Point
```

**Decision Point for Conflict Resolution:**
- Contains the conflicting constraints.
- Contains the candidate plans (or plan fragments) that illustrate the
  trade-offs.
- Authority chooses: relax constraint A, relax constraint B, reject Intent,
  or defer.

---

## Policy as Code

Governance policies are **executable artifacts**, not documentation.

- Policies are versioned, tested, and deployed independently of the
  Reasoning Engine.
- The Execution Engine evaluates policies at Decision Points.
- Policy language: declarative, decidable (e.g., Rego, CEL, or Athena DSL).
- Policy changes do not require Reasoning Engine retraining.

---

## Non-Goals (Explicitly Out of Scope)

- The specific policy language syntax — that is an implementation choice
  (Rego, CEL, Athena DSL). This RFC defines the *model*, not the DSL.
- The approval UI — that is an application concern.
- The identity management system (who is "finance-director") — that is
  infrastructure.
- How the Reasoning Engine generates constraint-satisfying plans — that is
  RFC-0009.

---

## Conformance

A system conforms to the Constraint and Governance Model iff:

1. Every Execution Plan carries a Constraint Set that is evaluated at
   validation time (RFC-0006 Validity Rule 5).
2. Hard and safety constraint violations make a plan **invalid** (not
   executable).
3. Soft constraints are evaluated with declared weights; Pareto-optimal
   plans are preferred.
4. Conflicting constraints are detected at validation time and resolved via
   the Conflict Resolution Protocol.
5. Every Decision Point has an `authorityBinding` that references a defined
   Authority.
6. No Action in a gated Plan Segment executes before its Decision Point's
   authority grants approval.
7. Every approval decision (grant/deny/timeout) produces an immutable audit
   log entry referencing `planId`, `revision`, `decisionPointId`, authority,
   context, and timestamp.
8. Policies are versioned artifacts evaluated by the Execution Engine, not
   embedded in the Reasoning Engine.

---

## Future RFCs This Model Informs

- **RFC-0008: Decision Point Protocol** — wire format for approval
  requests/responses, timeout semantics, audit log schema.
- **RFC-0009: Reasoning Engine Interface** — how the Reasoning Engine
  receives constraints and produces constraint-satisfying plans.

---

## Appendix: Normative Glossary (Additions to RFC-0005/0006)

| Term | One-Line Definition |
|------|---------------------|
| **Constraint** | A declarative boundary condition that a valid Execution Plan must satisfy (hard, soft, safety, temporal, resource). |
| **Constraint Conflict** | A set of constraints for which no satisfying Execution Plan exists. |
| **Governance** | The system of authorities, policies, and approval workflows that decide whether a plan may execute. |
| **Authority** | An entity (human, role, policy engine, external system) empowered to grant or deny approval at a Decision Point. |
| **Policy** | A declarative rule mapping (plan context, constraint type, risk level) → required authority. |
| **Approval Workflow** | The sequence: request → review → decision → audit, executed at a Decision Point. |
| **Audit Log** | Immutable record of every approval request, context, decision, and timestamp, keyed by planId + revision. |
| **Conflict Resolution Protocol** | The procedure for resolving constraint conflicts: classify → Pareto analysis → escalate to Decision Point. |
| **Policy as Code** | Governance policies as versioned, testable, executable artifacts evaluated by the Execution Engine. |
| **Resource (RFC-0005)** | An external entity (contacts, calendar, browser session, credentials) that a plan may depend on; access governed by policies in this RFC. |

---

*End of RFC-0007 (Draft)*