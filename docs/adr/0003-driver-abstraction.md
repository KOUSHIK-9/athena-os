# ADR 0003 — Driver Abstraction Isolates Automation Technology

## Status

Accepted

## Context

The first MVP drove the phone via Appium/WebDriverAgent. But the technology that
executes actions is the most volatile part of the stack: Apple may change the
accessibility layer, Appium may be replaced by native tooling (Apple Automation),
or Athena may target Android/Playwright. If "how we touch the device" leaked into
shared config, the SDK, or clients, every one of those changes would become a
breaking change across the whole repo.

## Decision

The `Driver` interface in `packages/driver` is the seam for automation technology.

- `driver` defines the `Driver` interface (createSession, tap, type, swipe,
  screenshot, getUITree, launchApp, terminateApp, pressHome, back, wait) plus
  `DriverConfig` (host, port, timeout, retries, wda settings).
- `AppiumDriver implements Driver`; all Appium knowledge stays inside this
  package.
- `DriverConfig` replaced the leaked `AppiumConfig` that previously lived in
  `packages/shared` — Appium-specific config no longer exists outside `driver`.
- The architecture test (CI) rejects any mention of "appium" in core, executor,
  shared, sdk, mcp-server, or cli.

## Consequences

### Positive

- Appium can be swapped for Apple Automation, Android drivers, or mocks without
  touching the planner, SDK, or CLI.
- Driver-specific settings are owned by the driver layer; the SDK surface stays
  "boring" (no Appium types visible to consumers).
- Future: `MockDriver` enables deterministic tests without a physical device.

### Negative / Risks

- The `Driver` interface must be designed carefully — it is now a public
  contract; changing it is a breaking change across layers.
- Some driver capabilities (e.g. screenshots as Buffer vs base64) force
  decisions early; we standardized on Buffer at the driver and base64 at
  boundary serialization.

### Follow-ups

- `MockDriver` for integration tests (sprint after device features land).
- Monitor that `driver` stays stable: prefer additive capabilities over interface
  churn.

## Alternatives Considered

- **Abstract the driver in `executor`** — rejected: executor is about action
  semantics; the seam belongs at the lowest runtime layer touching hardware.
- **Keep Appium config in `shared`** — rejected by design review: leaks
  implementation details into the utility layer and public SDK surface.