# RFC 0004 — The Capability Paradigm

## Status

Accepted

## Introduced

v0.3.0-alpha.1 (Interaction + Semantic Resolution)

## Problem

RFC 0001 gave every action a lifecycle (validate → execute → verify →
telemetry). As the action surface grew past the first two actions, two smells
appeared in the executor:

1. **One switch statement for everything.** The `iPhoneExecutor` grew a
   per-action chain: `assertValidAction` + `execute` + `verify` + retry bookkeeping
   inline for each action type. Each new action added branches to an
   increasingly tangled `execute()`.
2. **Verification drifted from execution.** Screenshot verification needed
   filename parsing; launch verification needed session state; tree
   verification needed semantic analysis. Retaining all of it in the executor
   force-coupled unrelated concerns.

## Objectives

1. An **action-is-a-capability** model: each user-visible interaction is a
   self-contained unit with validation, execution, verification, optional
   telemetry, and optional rollback.
2. The executor becomes a thin router: validate → find capability → run with
   retries — without knowing what a capability does internally.
3. A **unit test per capability** with a mocked driver, independent of real
   hardware, so interaction correctness is exercised continuously.

## Decision

### `Capability` interface (`agents/iphone-agent/src/capabilities/types.ts`)

```ts
interface Capability {
  readonly id: string;                              // 'Launch', 'Tap', 'Tree', ...
  readonly kinds: ReadonlyArray<ActionKind>;       // which Action['type'] it serves
  validate(action: Action): void;                  // capability-bound guard
  execute(ctx: CapabilityRunContext): Promise<CapabilityResultPayload>;
  verify(ctx, result): Promise<VerificationResult>;
  telemetry?(ctx, result): void | Promise<void>;
  rollback?(ctx, result): void | Promise<void>;
}
```

`CapabilityRunContext` carries `{ requestId, action, driver, session, config }`.
`CapabilityResultPayload` is the raw payload (`{ metadata?, screenshot? }`);
verification is separate so execution and verification stay independently
testable.

### Registry and dispatch

`capabilityFor(actionType)` maps `Action['type']` → `Capability`. The executor
does:

```
capability.validate(action)              // fast-fail ValidationError
capability.execute(ctx)                  // driver call
capability.verify(ctx, result)           // file-verified / tree-has-nodes / ...
```

Retry, timing, metadata (`ExecutionMetadata`), and telemetry stay in the
executor — capabilities are stateless and side-effect-light.

### Action → Capability catalog

| Action | Capability | Verification strategy |
|--------|-----------|-----------------------|
| `launchApp` | `Launch` | `launch-acknowledged` / `session-active` |
| `terminateApp` | `Terminate` | `session-healthy` |
| `tap` | `Tap` | `session-healthy` |
| `type` | `Type` | `session-healthy` |
| `swipe` | `Scroll` | `session-healthy` |
| `pressHome` | `Home` | `session-healthy` |
| `back` | `Back` | `session-healthy` |
| `wait` | `Wait` | `session-healthy` |
| `screenshot` | `Screenshot` | `file-verified` (PNG round-trip) |
| `getTree` | `Tree` | `tree-has-nodes` (semantic model) |

## Consequences

### Positive
- Adding an action adds a file (capability + test), not a branch.
- Verification is per-capability, so screenshots verify bytes, trees verify
  nodes, launches verify sessions.
- The executor no longer special-cases any action; retry/state/bookkeeping is
  uniform.
- One mocked-driver test suite blocks regressions without a device.

### Negative / Risks
- Registry indirection is slightly more ceremony than a direct switch; paid
  for by testability.
- Verification strategy names are adhoc; consider an explicit enum when the
  number grows.

### Follow-ups
- RFC 0003 Planner consumes `Action` + `VerificationResult` and selects via
  `selectFromModel` (RFC 0002 + 2D resolver).
- `rollback` exercised for partial transactions (e.g. type-then-verify then
  restore).

## Alternatives Considered
- **Keep the switch-based executor** — rejected: every new action enlarged one
  brittle function and its tests.
- **Strategy objects per layer (executor/driver/etc.)** — rejected for now:
  single Capability unit is simpler and sufficient at this scale.