# PROJECT_CONTEXT.md

## What is Athena OS?

Athena OS is an AI execution platform for iOS: it gives agents a safe, deterministic
way to operate a (non-jailbroken) iPhone through the accessibility layer, and it is
built so that the same automation surface can later power vision, planning,
and memory-based features.

**Goal:** Domain expertise (what an action means, a screen snapshot, a safe plan)
is separated from whatever technology actually drives the phone. Today that is
Appium/WebDriverAgent; it lives entirely inside the driver layer and can be
replaced without touching the public API.

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

## Status

- Sprint 0 foundation green: monorepo, 8 packages, all checks pass.
- Sprint 1 architecture cleanup: `core` extracted, Appium leak removed, CLI
  committed to MCP child process, architecture tests enforced in CI.
- Architecture Decision Records added under `docs/adr/` (core package,
  MCP boundary, driver abstraction, CLI boundary).
- Milestone 2B (UI Understanding) green: `packages/understanding` builds a
  semantic model (roles, labels, confidence) from the accessibility tree and
  renders it; `athena tree` exposes it; RFC-0002.
- Milestone 2C (Interaction) green: interactions (`launch`, `terminate`, `tap`,
  `type`, `swipe`, `home`, `back`, `wait`, `screenshot`, `getTree`) are
  first-class `Capability`s (`agents/iphone-agent/src/capabilities/`) with
  validate/execute/verify/telemetry, one independent test per capability, and
  the executor dispatches through the capability registry.
- Milestone 2D (Semantic Resolution) green: `selectFromModel` / `resolveElement`
  / `findByLabel` resolve a UI element from a human-readable label into a
  driver selector + confidence; exposed as the `athena find` CLI command and
  the `find` MCP tool.

## Next

- Milestone 3 (Task Execution, deterministic, no GPT): chain capabilities into
  higher-order plans; end-to-end device verification.
- Replace remaining "Sprint" naming with Milestone naming as docs refresh.