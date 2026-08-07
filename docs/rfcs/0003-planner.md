# RFC 0003 — The Planner Engine

## Status

Draft

## Proposed

Post-UI-Understanding (v0.3 planning horizon)

## Problem

Today Athena executes individual actions requested by a caller (the CLI or an
MCP client). Nothing decides *what to do next*: the user still reads the
screen, forms intent, and issues one action at a time. A trustworthy execution
platform cannot stop there — the value is a planner that takes an objective,
inspects the screen, and emits the next best action.

## Objectives

1. A Planner Engine sits above the Execution Engine and the Understanding
   Engine (three engines, not one).
2. The planner sees only the semantic model — never XML, never driver APIs.
3. Every planned action must be an executable `Action` that the Execution
   Protocol (RFC 0001) can run and verify.
4. Planning is observable: every plan records its inputs (screen model,
   objective) and rationale (why this action).

## Decision

(Pending — this RFC formalizes the intent; design proceeds in a later sprint.)

Shape of the engine:

- `PlannerEngine` consumes `SemanticModel` + an objective, produces
  `Plan { requestId, objective, steps: PlannedStep[] }` where each step is an
  `Action` plus an expected-verification note.
- The planner depends on core contracts only; it runs where the executor
  runs (iphone-agent), keeping Appium out of planning.
- Planning is iterative: plan → execute → verify → re-inspect (understanding)
  → plan again, until objective is verified or budget exhausted.
- Every step is gated by the `Capability` contract so the planner can reason
  about compensations (`rollback`) for multi-step goals.

## Consequences

### Positive
- Multi-step objectives become possible with verification at each step.
- The semantic model's confidence values give the planner a trust gradient.

### Negative / Risks
- Scope risk: the planner must not become a walled-off "brain" — it must
  remain a thin, inspectable layer over verified primitives.

### Follow-ups
- RFC for the three-engine architecture (Planner ↓ Execution ↓ Understanding).
- Capability-driven executor (RFC 0001 follow-up) before the planner can
  reason about compensations.

## Alternatives Considered
- **Extend the executor with a planning step** — rejected: conflates execution
  and planning; violates the three-engine split.
- **Plan in the MCP server** — rejected: planning must run close to the
  device, where the semantic model and executor live.