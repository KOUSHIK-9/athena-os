# Milestone 2 — Execution Platform

- Version: `v0.3.0-alpha.1`
- Commit: `5a9e4cb` (`feat(m2): capability-based execution and semantic resolution`)
- Date: 2026-08-07
- Status: **Baseline Established**

## Summary

Milestone 2 established the execution platform of Athena. When it tagged
`v0.3.0-alpha.1`, Athena became a system that comprehends a device's UI and
interacts with it through a stable capability system — with every action
validated, verified, observed, and resolvable against a semantic model.

At this checkpoint Athena has completed its **execution platform** — not its
AI, not its reasoning. That is the milestone's lasting identity.

Identity line (from the Manifesto, still Draft):

> **Intent is the API.** *Execution is the implementation.*

## Goals

1. A typed execution protocol: every action is a first-class object with a
   validatable shape, traceable through the system.
2. Strict layering: Core holds the contracts, the driver owns Appium, the CLI
   only talks to the MCP boundary.
3. Device independence: no public package references a specific automation
   technology.
4. Semantic UI understanding: turn an accessibility tree into a model the rest
   of the system can reason about.
5. Capability-based interaction: every device interaction is a `Capability`
   with validate / execute / verify / telemetry, tested independently.
6. Semantic resolution: resolve a human-readable label to a driver selector +
   confidence.
7. Every successful action observable: Result + Verification + Telemetry. No
   silent success, no silent failure.

## Deliverables

- **Foundation (prior, frozen in M1):** Core Protocol, Error Hierarchy, Action
  Pipeline, Execution Engine, Verification, Telemetry, MCP Boundary, CLI.
- **Capability System (M2C):** `agents/iphone-agent/src/capabilities/` with
  `launch`, `terminate`, `tap`, `type`, `swipe`, `home`, `back`, `wait`,
  `screenshot`, `getTree`. Registry (`capabilityFor`, `allCapabilities`),
  rewritten executor dispatching through the registry, per-capability tests
  (30 tests, 5 files).
- **Understanding Engine (M2B):** `packages/understanding` builds a semantic
  model (roles, labels, confidence) from the accessibility tree; `athena tree`
  exposes it. RFC-0002.
- **Semantic Resolver (M2D):** `resolveElements` / `resolveElement` /
  `findByLabel` / `selectorForElement` / `selectFromModel` with
  `{role, enabledOnly, visibleOnly, minConfidence}` filters; `find` MCP tool
  and `athena find` CLI command. RFC-0004.
- **Mock driver:** `agents/iphone-agent/src/testing/mock.ts` — Proxy-based fake
  driver for deterministic tests without a physical device.

## Decisions

- ADR-0001 `core` holds all shared domain contracts.
- ADR-0002 MCP is the boundary; CLI commits off to a child-process stdio bridge.
- ADR-0003 driver abstraction; Appium is an internal detail only.
- ADR-0004 CLI is a thin client.
- RFC-0001 Execution Protocol (Accepted).
- RFC-0002 UI Semantic Model (Accepted).
- RFC-0003 Planner (**Draft** — superseded by the planned RFC-0005 Reasoning
  Engine naming).
- RFC-0004 Capability Paradigm (**Accepted**) — interactions are capabilities,
  not ad-hoc commands.

## Lessons Learned

- Semantic resolution / execution belong to different concerns: the executor
  routes, the resolver decides which element to act on.
- Deterministic testing of device interactions requires a mock driver; a
  Proxy-based fake kept the real driver interface honest without XML.
- Verification of a tree means more than one element (`elementCount > 1`) —
  a single-node "tree" is a degenerate screen.
- "Sprint" naming has been retired in favor of "Milestone" in docs.

## Remaining Debt

- RFC-0003 (Planner) superseded by RFC-0005 (Reasoning Engine); not yet
  rewritten.
- Mock driver coverage exists for interactions but not exhaustively for every
  capability path.
- README/manifest onboarding ordering still settling.

## What a Baseline Means Here

This milestone is a **baseline**, not a redesign target. From
`ENGINEERING_PRINCIPLES` rule 10:

> Stable milestones are baselines, not redesign targets. New capabilities
> build on the baseline; they do not replace its contracts. No baseline
> architecture/protocol changes while it remains a baseline. Superseding a
> baseline is a deliberate, versioned decision.

## What Comes Next

- **Design session (GPT-free, no repo):** answer "What is an Intent?" from
  first principles, whiteboard style. Define the conceptual language of
  Milestone 3: Intent, Goal, Constraint, Execution Plan, Decision Point,
  Approval, Recovery.
- RFC-0005 (Reasoning Engine) and RFC-0006 (Execution Plan) after the design
  session.
- Milestone 3 implementation (deterministic, no GPT): chain capabilities into
  higher-order plans, end-to-end device verification.
- Introduce models (GPT/Claude/Gemini/future) only as one reasoning engine
  implementation — never a prerequisite of the architecture. Technology is
  replaceable; protocols are not.