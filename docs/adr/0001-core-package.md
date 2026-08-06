# ADR 0001 — Extract `packages/core` as the Shared Domain Language

## Status

Accepted

## Context

The MVP shipped with the domain model (Action, Result, Selector, UITree,
ScreenState, Screenshot, DeviceInfo, Session, Events, Errors) duplicated across
`executor`, `driver`, `shared`, and the agent. Every package defined its own
`Action`, `Selector`, etc., so a type change in one place silently diverged from
the others. There was no single source of truth for the "language" an executor
speaks.

We needed a bottom-of-the-stack package that (a) defines every domain contract
exactly once, (b) has zero workspace dependencies so it can never import upward,
and (c) carries zod schemas so boundaries can validate at runtime.

## Decision

Create `packages/core` as the canonical domain package.

- All domain types, zod schemas, and factories (createLaunchAppAction,
  createSuccessResult, ...) live in `packages/core`.
- All error classes (AthenaError hierarchy) live in `packages/core`; `shared`
  re-exports them for backward compatibility.
- `core` has no workspace dependencies (zod only).
- The architecture test (CI) enforces: no package imports `core`'s peer from
  above; no package re-defines a domain type.

## Consequences

### Positive

- One definition of Action/Selector/Result/UITree/Events/Errors — the domain is
  now a "language" every layer shares.
- Executors (iPhone today, future platforms tomorrow) implement the same contract.
- `core` can be consumed by non-TypeScript boundaries via its zod schemas.

### Negative / Risks

- Migration cost: packages that previously owned their own copies had to be
  rewired (executor, driver, shared, agent, SDK) — done in one refactor commit.
- Discipline required: it is tempting to put runtime logic in `core`; it must
  stay pure and dependency-free.

### Follow-ups

- `packages/events` (event bus) will build on `core`'s event types.
- `packages/ui-model` (semantic UI tree from raw accessibility XML) will extend
  `core`'s UITree types.

## Alternatives Considered

- **Keep duplicated types per package** — rejected: silent divergence, no single
  language for future executors.
- **Put domain types in `shared`** — rejected: `shared` is a utility junk drawer;
  the domain deserves a dedicated, dependency-free package.
- **Name it `packages/contracts`** — rejected in review: `core` better conveys
  that it is the foundation, not a boundary artifact.