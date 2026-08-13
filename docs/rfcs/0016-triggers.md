# RFC-0016: Triggers

- Status: **Accepted**
- Reference Implementation: **implemented** — `trigger` MemoryEntry kind is modeled
  in `packages/memory` and excluded from always-eligible retrieval (returned only
  when explicitly `requested`), per §2. Execution-side firing is implemented in
  `servers/mcp-server/src/run/triggers.ts`: `runDueTriggers` evaluates due
  `pending` triggers, fires each (read-only condition check), synthesizes an
  Intent through the normal RFC-0009 pipeline, and advances the trigger's state
  from the actual outcome (`pending → fired → satisfied`, or `fired → re-armed →
  pending` for recurring). Successful executions are also written back as
  `experience` MemoryEntries (`recordExperience`).
- Authors: Athena Core Team
- Created: 2026-08-13
- Depends on: RFC-0005 (Intent Model), RFC-0008 (Decision Point Protocol),
  RFC-0009 (The Contract), RFC-0011 (Deterministic Reasoning Engine),
  RFC-0013 (The Memory Model), RFC-0014 (Memory Retrieval), RFC-0015 (Preferences)

---

## Abstract

`trigger` is one of the four Memory types defined by RFC-0013: the persistent
record of a **future condition** Athena is asked to act on (e.g. "every Monday",
"flight tomorrow", "package delivered"). RFC-0013 defines the trigger *states*
but delegates evaluation mechanics here. This RFC owns the trigger model,
lifecycle, recurrence, scheduling/evaluation, cancellation, interaction with
Decision Points (RFC-0008), retrieval interaction (RFC-0014), and the authority
boundary. A trigger is a **condition, never an action**: when it fires it
synthesizes an Intent that flows through the normal RFC-0009 pipeline.

## 1. Trigger Model

A `trigger` Memory entry (RFC-0013 §3) records an RFC-0005 §6 Trigger:

- `subject` — canonical dotted identifier of the condition (e.g.
  `schedule.standup`, `travel.flightArrival`).
- `condition` — the predicate evaluated against observed state (RFC-0005 §4):
  device, calendar, environment, time.
- `action` — the intended action captured as an Intent template (RFC-0005 §1)
  synthesized when the condition holds.
- `recurrence` — `once` (default) or a recurrence rule (§3).
- `state` — one of the lifecycle states (§2).

The trigger memory type is the **persistent record**; its protocol initiation,
idempotency, and orchestration semantics are owned by RFC-0005 §6, elaborated
here for evaluation.

## 2. Lifecycle

Adopts RFC-0013 §5's state set exactly:

```
pending ──(fires)──▶ fired ──(satisfied)──▶ (done)
                         │
                         ├──(recurring)──▶ re-armed ──▶ pending
                         └──(cancelled)──▶ (done)
```

- `pending` → `fired`: the scheduler determines the `condition` holds (§4).
- `fired` → `satisfied`: the synthesized Intent was reasoned and executed to
  completion.
- `fired` → `re-armed`: a recurring trigger returns to `pending` for its next
  occurrence (§3).
- `fired`/`pending` → `cancelled`: the user cancels (always allowed, §5).

## 3. Recurrence

- `recurrence: once` → after `satisfied`, the trigger is `done` and never fires
  again (matches RFC-0013 §5).
- A recurrence rule (e.g. "every Monday") → when the trigger is `fired`, it takes
  the recurring branch (RFC-0013 §5): `fired → re-armed → pending`, scheduling
  the next occurrence. A recurring trigger does **not** transition to
  `satisfied`/`done` on its own; it cycles until `cancelled`.
- Re-arming computes the **next** occurrence from the recurrence rule; a trigger
  never double-fires for the same occurrence.

## 4. Scheduling & Evaluation

A scheduler (engine-internal, not part of retrieval) periodically evaluates
each `pending` trigger:

- **Read-only against state:** the scheduler reads observed state (RFC-0005 §4)
  and the trigger `condition`; it performs no I/O, no execution, no writes.
- **Idempotent firing:** a `pending` trigger fires at most once per occurrence.
  Firing transitions `pending → fired` and synthesizes an Intent from the
  trigger's `action` template.
- **Synthetic Intent:** the synthesized Intent enters the RFC-0009 contract like
  any other — goal extraction, constraint checking, capability matching, plan
  building, validation, simulation, graph building. No stage is skipped.

## 5. Cancellation

- The user may cancel a `pending` or `fired` trigger at any time (RFC-0013 §4:
  triggers are deletable by the user, or by the system once fired-and-satisfied).
- Cancellation moves the trigger to `done`; a cancelled trigger never fires
  again and its scheduled occurrence is dropped.

## 6. Interaction with Decision Points

Trigger firing does **not** auto-approve anything. The synthesized Intent may
raise Decision Points during execution per RFC-0008:

- If a Decision Point is required and not resolved, the triggered Intent is not
  `satisfied`; the trigger remains `fired` until the point is resolved and
  execution completes.
- A trigger's `satisfied` state is therefore tied to the **actual execution
  outcome**, not merely to firing. This preserves RFC-0011 §1.5 authority: the
  validator (and any required approval) governs the triggered plan exactly as for
  a human-authored Intent.

## 7. Retrieval Interaction

Triggers are retrieved like any other Memory entry under RFC-0014, with one
scoping rule from RFC-0014 §1:

- A **one-off** action request never receives `trigger` entries.
- A request **produced by trigger firing** (a synthetic Intent) may receive
  `trigger` entries.

Note the distinction: trigger *firing* is scheduler-driven (§4) and is separate
from retrieval-as-context. Retrieval may surface a `trigger` entry as reasoning
context, but retrieval never fires a trigger — firing is evaluation, not read.

## 8. Authority Boundary

Triggers obey RFC-0013 §6 / RFC-0011 §1.5 without modification:

- A trigger **never executes**; it only synthesizes an Intent that goes through
  the full contract.
- The Validator remains **memory-blind** and is the sole authority over what
  executes; a triggered plan is validated exactly like any other.
- A trigger cannot bypass validation, Decision Points (§6), simulation, or the
  RFC-0009 contract.
- Preferences (RFC-0015) may bias the triggered plan at planning time, but never
  override an explicit Intent constraint.

## 9. Conformance

An implementation conforms when:

1. A one-off trigger ("flight tomorrow") fires only when its `condition` holds,
   synthesizes an Intent, and on successful execution transitions
   `pending → fired → satisfied → done`.
2. A recurring trigger ("every Monday") takes the recurring branch when `fired`:
   `fired → re-armed → pending`, and fires again at the next computed occurrence,
   never twice for one occurrence; it only leaves the cycle via `cancelled`.
3. Cancelling a `pending` trigger prevents it from ever firing.
4. A triggered Intent that raises a Decision Point (RFC-0008) leaves the trigger
   `fired` (not `satisfied`) until the point is resolved and execution
   completes.
5. Evaluation is read-only: the scheduler performs no writes or executions while
   evaluating `condition`.

## 10. Non-Goals

- Learning from trigger outcomes — later RFC.
- Multi-agent trigger coordination — later RFC.
- Physical-device scheduling specifics (OS reminders, push) — implementation.
- UI for trigger creation/management — product layer.
- Preference dimension semantics — RFC-0015.

## Cross-References

- RFC-0005 §6 — the Trigger protocol object; RFC-0016 owns its evaluation.
- RFC-0013 §3 / §5 — the trigger Memory type and its lifecycle states.
- RFC-0014 §1 — kind scoping: one-off requests exclude `trigger` entries.
- RFC-0008 — Decision Points raised by triggered Intents (§6).
- RFC-0009 — the contract the synthesized Intent flows through.
- RFC-0011 §1.5 — validator authority, memory-blind, preserved for triggers.
- RFC-0015 — preferences may bias the triggered plan at planning time.
