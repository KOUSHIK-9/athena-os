# Engineering Principles

These are the immutable rules of the Athena OS codebase. The CI architecture job (`pnpm test:architecture`) enforces the rules marked **[enforced]**.

## 1. The Dependency Pyramid

```
Apps  (CLI, Dashboard, tools)
  └── Servers  (MCP)
        └── Agents  (iphone-agent)
              └── Executor
                    └── Driver
                          └── Core
```

**[enforced]** Dependency graph is one-directional: `core < driver < executor < iphone-agent < sdk/mcp-server < cli`. No layer imports from a layer above it. Never point upward.

- `shared` is a pure utility package (logger, config, utils). Any layer may consume it, but it must never know about the domain or the automation stack.
- `core` is the bottom of the stack: pure domain types (Action, Result, Selector, UITree, ScreenState, Screenshot, DeviceInfo, Session, Events, Errors). It has no dependencies on the rest of the system.

## 2. The Driver Layer Owns the Implementation

**[enforced]** Only `packages/driver` may mention Appium, WebDriverAgent, or any other device-automation technology. No other package may reference those names.

- The public packages never expose implementation-specific types or config.
- `driver` exposes its own `Driver` interface and `DriverConfig`; Appium stays an internal detail behind that interface.
- If the automation technology changes, no package outside the driver layer should change.

## 3. The SDK Is Boring

The SDK is the public surface for consumers. It must:

- Expose only domain types (from `core`) and stable value factories.
- Never leak implementation details: no Appium, no driver config, no session internals.
- Stay stable; breaking changes require a major version bump and explicit review.

## 4. The CLI Is a Thin Client

Apps never import execution, driver, or agent packages. The CLI talks to the system only through the MCP server (currently a child-process stdio bridge).

- This keeps the backend swappable: a future Dashboard, voice layer, or VS Code extension uses the same MCP server.
- Enforced by the architecture test: no app imports `executor`, `driver`, or `iphone-agent` directly.

## 5. Contracts Live Only in Core

Types and zod schemas are defined once, in `packages/core`. No package re-declares `Action`, `Selector`, `Result`, etc. Duplication is a bug.

## 6. Commits Are Milestones

- Each commit is a focused change (core extraction, leak removal, thin-client refactor, feature).
- Refactor before features: never bolt features onto broken layering.
- Sign-off each milestone (`git log`) before starting the next.

## 7. Style

- TypeScript strict, ESM only (`.js` import suffixes), `"type": "module"`.
- `lint`, `typecheck`, `format:check` must pass before merge.
- Runtime validation at boundaries uses zod.

## 8. Publish Pipeline

- `build` emits `dist/**` as `.js` (`"type": "module"`); exports maps must reference real files.
- Node >= 20. Runtime features (doctor, screenshot, launch, GPT, memory) ride on this architecture as separate milestones.