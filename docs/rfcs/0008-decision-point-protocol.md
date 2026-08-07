# RFC-0008: Decision Point Protocol

- Status: **Accepted**
- Authors: Athena Core Team
- Created: 2026-08-07
- Depends on: RFC-0005 (Intent Model), RFC-0006 (Execution Plan Model),
  RFC-0007 (Constraint and Governance Model)

---

## Abstract

This RFC defines the **Decision Point Protocol** — the lifecycle, states,
timeout semantics, outcomes, audit requirements, retry behavior, and
cancellation behavior of an approval at a Decision Point.

It does **not** define:
- The approval UI (an application concern).
- The wire format or transport (a networking concern).
- The authority identity system (infrastructure).

Those are implementation details. This RFC specifies *behavior*, independent of
how approval is presented or transported.

---

## Motivation

RFC-0006 defines Decision Point as a plan node that halts execution until an
approval authority grants consent. RFC-0007 defines the governance structure
(authorities, policies, audit). This RFC specifies **what happens** when a plan
reaches a Decision Point — the full lifecycle of an approval interaction.

Without this protocol:
- Different tools would implement approval inconsistently.
- Timeout, denial, and expiry semantics would drift.
- Audit logs would not be complete or comparable.
- Retry after denial, and cancellation mid-approval, would be undefined.

Every Decision Point in every Execution Plan is a governance gate. The protocol
governs it uniformly, whether the authority is a human, a policy engine, or an
external system.

---

## The Decision Point State Machine

A Decision Point node enters the following states as the plan executes:

| State | Description | Transitions |
|-------|-------------|-------------|
| **Pending** | Execution awaits review; approval request has been raised to the authority. | → `Granted`, `Denied`, `Expired`, `Cancelled` |
| **Granted** | Authority consented. The gated Plan Segment may execute. | → (segment runs) |
| **Denied** | Authority refused. Plan follows the denial path (RFC-0006 recovery, or `Rejected`). | Terminal for this Decision Point |
| **Expired** | Timeout elapsed without a decision. Equivalent to **denial**. | Terminal |
| **Cancelled** | The plan (or its authority) withdrew the request before a decision. | → `Pending` (**once**, if re-raised) or Terminal |
| **Rescinded** | Authority revoked consent after `Granted` but before the segment's completion (see § Correction). | → `Pending` again (re-review) or plan `Paused` |

**Invariants:**
- A Decision Point is in exactly one state at any time.
- `Granted` → `Rescinded` is allowed only before the gated segment completes.
- `Expired` ≡ `Denied` for all downstream semantics.
- A Decision Point once `Denied` or `Expired` may be **re-raised** only by an
  explicit new request (automatic retry is governed by § Retry Behavior).

---

## Approval Lifecycle (Request → Decision → Effect)

1. **Raise:** Before a gated plan segment executes, the Execution Engine
   materializes a Decision Point (RFC-0006) with:
   - `planId` + `revision` (RFC-0006, Plan Identity).
   - `decisionPointId`: unique within the plan.
   - `authorityBinding` (RFC-0007): the required authority.
   - `typedDecision`: structured description of what is being approved
     (e.g., `{ type: "financial", amount: 2500, currency: "INR" }`).
   - Context snapshot (the `Context` available at that point, RFC-0005 §4).
   - `timeout`: maximum wait before auto-denial.
2. **Review:** The authority inspects the typed request plus context snapshot.
3. **Decision:** The authority responds `grant`, `deny`, or `cancel`.
4. **Effect:**
   - `grant` → the gated segment may execute.
   - `deny` → the plan follows its declared denial/fallback path.
   - `cancel` → the plan is terminated or the Decision Point is re-raised
     with a new context.

---

## Timeout Semantics

- `timeout` is declared per Decision Point (not plan-global).
- If no decision arrives within `timeout`, the Decision Point transitions to
  **Expired**, equivalent to denial.
- Expiry timestamp is recorded for audit; late approvals after expiry are
  **ignored**.
- Expiry is not silent: the authority holder is notified, and the plan's
  recovery path (RFC-0006 §7) is triggered.

---

## Approval Outcomes ↔ Plan Lifecycle

The Decision Point outcome determines the plan's next state (RFC-0006,
Lifecycle States):

| Outcome | Plan effect |
|---------|-------------|
| `grant` | `PendingApproval` → `Executing` (gated segment runs) |
| `deny` | Rejected; plan → `Failed` or `PartiallyCompleted` per declared recovery |
| `expire` | Same as `deny` |
| `cancel` | Plan → `Cancelled` |

The Decision Point's `type` also determines whether the gated segment is
single-approval (one gate) or spans multiple segments (gate: segments can share
a single approval when the same authority and request type).

---

## Audit Requirements

Every Decision Point produces an immutable audit record (schema in
RFC-0007 `Audit Log`):

- `planId` + `revision`, `decisionPointId`.
- Request: `type`, `requestedAt`, context snapshot reference.
- Decision: authority identity, decision, `decidedAt`.
- Terminal reason: `grant` | `deny` | `expire` | `cancel` (with reason code).
- Any raising/denying/re-raising timestamps.

No Decision Point executes silently: every gate transition writes audit rows.

---

## Retry Behavior

- **Automatic retry** is **not** default — it occurs only when the plan
  declares a retry policy for the Decision Point (RFC-0006 Recovery).
- Retry re-raises a **new** Decision Point (new `decisionId`) with:
  - the same `typedDecision`, but updated `updatedAt` and context snapshot;
  - an audit trace of prior attempts.
- Expiry / denial open a **short lock**: an immediate identical retry is
  rejected unless the step requires it (avoid `deny → auto grant` loops).

---

## Cancellation Behavior

- **Plan cancellation:** If the plan is cancelled (RFC-0006, `Cancelled`
  state) while a Decision Point is `Pending`, the Decision Point enters
  `Cancelled`.
- Only the plan's authority or the plan itself can cancel; the approval
  authority cannot cancel a plan, only deny the gate.
- Cancellation is auditable, not abandoned: the pending request is closed,
  the segment is not executed, and the plan state is recorded.

---

## Resource Integration (RFC-0005 §5)

A Decision Point whose approval involves a Resource **must** declare the
Resource dependency (and the policy used) in its request, so the approval
authority sees exactly what protected resource access is being gated.

Example: a `send-email` capability with recipient domain `!@company.com`
(attached to a mailing Resource) raises a Decision Point whose typed request
references the `email` Resource and the governing policy.

---

## Conformance

A system conforms to the Decision Point Protocol iff:

1. Every plan's Decision Point follows the state machine (grants, denials,
   expiries, cancellations).
2. Every Decision Point carries a `typedDecision`, `authorityBinding`,
   timeout, and context snapshot.
3. Expiry is equivalent to denial; decisions after expiry are ignored.
4. Every transition writes an immutable audit record.
5. Automatic retry happens only via a declared retry policy.
6. Cancellation leaves no orphaned executions or unresolved promises.
7. Approval never executes actions in the gated segment before `grant`

---

## Non-Goals (Explicitly Out of Scope)

- The approval UI and its workflow (RFC-0007 §Governance defines the workflow
  shape; presentation is an application concern).
- Wire protocol for request/response transport (implementation detail).
- Identity/SSO systems (infrastructure).
- The Decision Point's position within an Execution Plan (RFC-0006).

---

## Future RFCs This Model Informs

- **RFC-0009: Reasoning Engine Interface** — how plans containing Decision
  Points are produced, and how authority reuse is expressed.
- **RFC-0010 (future): Audit & Telemetry Processing** — consumption of
  Decision Point audit rows.

---

## Appendix: Glossary (Additions to RFC-0005/0006/0007)

| Term | One-Line Definition |
|------|---------------------|
| **Decision Point** | A plan node that pauses execution until an approval authority grants consent (RFC-0006). |
| **Decision request** | The typed, context-rich submission to the authority at a Decision Point. |
| **Deny / Grant** | Distinct authoritative outcomes; both terminal for the gate at that attempt. |
| **Expiry** | Decision-point timeout with no decision = denial. |
| **Rescission** | Post-grant withdrawal before segment completion; re-raises the Decision Point. |
| **Audit record** | Immutable per-transition log (request, authority, decision, timestamp), keyed by planId + revision + decisionPointId. |

---

*End of RFC-0008 (Draft)*