# PROJECT_CONTEXT.md

## What is Athena?

Athena is a protocol-driven execution platform that transforms human intent
into trustworthy, verifiable actions across digital systems.

The identity is architectural, not technological: iPhone, Appium, GPT, and MCP
are implementation details. Athena gives agents a safe, deterministic way to
operate a (non-jailbroken) iPhone through the accessibility layer today, and is
built so the same execution platform can later power vision, planning, and
memory-based features across any digital system.

**Core separation:** domain expertise (what an action means, a screen snapshot,
a safe plan) is separated from whatever technology actually drives the device.
Today that is Appium/WebDriverAgent; it lives entirely inside the driver layer
and can be replaced without touching the public API.

## What problems does Athena solve?

- **Device automation with safety and determinism:** every action is validated,
  verified, and observable — no silent success, no silent failure.
- **Semantic understanding:** the system reasons about *what* a screen contains
  (roles, labels, confidence), not raw coordinates or driver internals.
- **Durable architecture:** reasoning (GPT/Claude/Gemini/future models) is one
  implementation of an engine, never a prerequisite. Technology is replaceable;
  protocols are not.
- **Extensibility:** new capabilities build on stable baselines; they do not
  replace them.

## Repo Layout

```
apps/cli               Thin CLI. Spawns the MCP server over stdio; never imports
servers/mcp-server     JSON-RPC over stdio. Hosts an in-process session manager.
agents/iphone-agent    Device discovery, WDA verification, session/executor.
packages/executor      Executor interface + re-exports of core domain.
packages/driver        Driver interface + Appium implementation + DriverConfig.
packages/sdk          Public SDK: domain types + factories. No implementation, no Appium.
packages/shared        Utilities: logger (pino), config, errors, helpers.
packages/core          Domain contracts only (zod schemas + types).
```

## Architecture Pyramid (one-directional)

```
Apps → Servers → Agents → Executor → Driver → Core
```

Never import upward. `shared` is a utility layer usable anywhere. `core` holds
every domain contract (Action, Result, Selector, UITree, ScreenState, Screenshot,
DeviceInfo, Session, Events, Errors); no other package may define them.

## Runtime data flow

1. A client (CLI today) calls an MCP tool over stdio.
2. The MCP server routes the request to the session manager / executor.
3. The executor emits a domain `Action`.
4. The `Driver` translates the action into Appium calls.
5. Results (rich `Result`s, screenshot bytes, UI trees) flow back over JSON-RPC.

## Development workflow

- `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm format:check` — full checks.
- `pnpm test:architecture` — enforces the pyramid and the Appium boundary.
- Each milestone is a separate commit: extract core → remove leak → thin CLI →
  architecture tests → docs.
- We review each milestone before moving to the next.

## Design Principles

- **Intent is the API. Execution is the implementation.** (Manifesto, Draft.)
  The system exists to transform human intent into trustworthy digital
  execution — one verified action at a time.
- **Technology is replaceable, protocols are not.** Models, drivers, and device
  backends are swappable; the contracts survive them.
- **Capabilities grant ability, never authority.** Execution runs inside
  guards; approval is mandatory where a decision point demands it.
- **Stable milestones are baselines, not redesign targets.** New capabilities
  build on a baseline; they never replace its contracts. Superseding a baseline
  is a deliberate, versioned decision.
- **Reasoning is independent of execution.** The reasoning engine decides from
  capabilities; the execution engine runs, retries, and records.
- **Every action is observable.** Result + Verification + Telemetry on every
  action. No silent success, no silent failure.
- Document hierarchy: README (what) → Manifesto (why) → Engineering Principles
  (how) → RFCs/ADRs (why decisions were made) → Code (how implemented).

For the immutable engineering rules, see `ENGINEERING_PRINCIPLES.md`. For the
identity, see `ATHENA_MANIFESTO.md` (Draft). The historical record of each
milestone (goals, deliverables, decisions, lessons, debt, what comes next) lives
in `docs/milestones/`.