# ADR 0005 — The Athena Execution Protocol (Action Pipeline)

## Status

Accepted

## Context

The executor ran each action ad hoc: an early-return switch, a success/error
`Result`, and error handling bolted on per action. There was no shared lifecycle,
no consistent evidence for success, no way for a future planner to know whether
an action was retried, verified, or cancelled. As Athens grew toward autonomous
planning, dashboards, and multi-executor targets (browser, Android, macOS), a
single execution protocol became the prerequisite.

## Decision

Every action flows through the same immutable pipeline:

```
Request → Validation → Execution → Verification → Telemetry → Result
```

Concretely, in `packages/core/src/protocol`:

- `ExecutionRequest` / `ExecutionContext` — a unique id, the action, timing, and
  session context.
- `ExecutionState` state machine — `pending → running → retrying →
  succeeded/failed/cancelled`, with `assertTransition` enforcing valid moves.
- `ExecutionMetadata` — requestId, actionType, state, startedAt/finishedAt,
  durationMs, attempts, device, sessionId, error code/message.
- `VerificationResult` — success is verified, never assumed (strategy, `verified`,
  details).
- `ActionResult` — the completed envelope; it `extends Result` so existing MCP/CLI
  contracts keep working with zero breaking API changes.
- `Executor#execute` runs the full pipeline and exits only through it.

Errors derive from a single `AthenaError` root with `DeviceError`, `ActionError`,
and `InternalError` base classes, so a future planner can classify an outcome as
recoverable (retry) vs. non-recoverable (change strategy / ask the user).

## Consequences

### Positive

- Every action leaves evidence: a Result, a Verification, and Telemetry. No
  silent success, no silent failure (observability principle).
- Retries, verification, and state handling are uniform across every action type,
  not bolted on per action.
- The protocol is executor-agnostic: an iPhone today, a browser later — the
  pipeline and types don't change.
- `ActionResult extends Result` kept the external API stable.

### Negative / Risks

- Slight per-action bookkeeping overhead (metadata object, state transitions) —
  negligible at this scale.
- Telemetry is currently log-only; a dashboard/event store is future work.

### Follow-ups

- Add `waitingForApproval` as a first-class state for human-in-the-loop actions.
- Split `ActionError` into `RecoverableActionError` / `NonRecoverableActionError`
  for the planner.
- Add `executor`/`driver` fields to telemetry for multi-target routing.

## Alternatives Considered

- **Add intelligence first (GPT/planner)** — rejected. Unreliable execution made
  a planner pointless; the pipeline is the foundation the AI layer will depend on.
- **Per-action bespoke handling** — rejected: every action deviates, and there is
  no evidence trail to debug or plan from.