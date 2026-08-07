# RFC 0001 — The Athena Execution Protocol

## Status

Accepted

## Introduced

v0.2.0-alpha.1 (Action Pipeline)

## Problem

Athena executes user-visible actions ("launch an app", "take a screenshot",
"tap this element") against a real device. Naive execution assumes an action
succeeded because the driver call returned. That assumption is false: a
screenshot can be corrupt, a launch can be acknowledged but the session can
die, a tap can silently land on nothing.

## Objectives

1. Every executed action has a well-defined lifecycle with verifiable end state.
2. Failures are classified so the platform can decide whether to retry safely.
3. Every action is observable: request id, timings, attempts, verification.
4. The protocol is driver-agnostic (core owns the contracts, not the driver).

## Decision

The Athena Execution Protocol (the Action Pipeline):

- A single `Action` discriminated union in `packages/core/src/action.ts`
  (`launchApp`, `tap`, `type`, `screenshot`, `getTree`, `swipe`, `wait`,
  `pressHome`, `terminateApp`, `back`).
- A strict state machine — `pending → running → retrying → succeeded/failed`,
  with `cancelled` permitted from `pending`/`retrying` — enforced by
  `assertTransition` in `packages/core/src/protocol/state.ts`.
- `ExecutionMetadata` records requestId, startedAt/finishedAt, durationMs,
  attempts, error code/message, session and device identity.
- `VerificationResult` — every action must be verified, never assumed.
- `ActionResult` — typed result carrying `success`, the action, optional
  screenshot, metadata, verification, execution metadata and error details.
- The iphone-agent executor drives this pipeline: validation → execute with
  retry (linear backoff, retryable-error classification) → verify → telemetry.
- A single `AthenaError` root error hierarchy across packages.

## Consequences

### Positive
- Failure modes are enumerated and testable; the state machine has unit tests.
- Retries respect verification and classification, not optimism.
- Every result carries enough breadcrumbs to debug a session offline.

### Negative / Risks
- More ceremony than a "fire and forget" call; acceptable for correctness.

### Follow-ups
- `Capability` interface (RFC 0004 candidate) to standardize intent → verify →
  telemetry with optional compensating `rollback`.
- Planner engine (RFC 0003) consuming `Action` + `VerificationResult`.

## Alternatives Considered
- **Execute and trust the return value** — rejected: corrupt screenshots and
  silent tap failures made verification mandatory.
- **Verify only critical actions** — rejected: verification is cheap and
  uniform once in the pipeline.