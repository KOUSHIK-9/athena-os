# ADR 0004 — CLI Is a Thin Client Over the MCP Boundary

## Status

Accepted

## Context

The first prototype CLI imported `iPhoneExecutor`, `verifyWDA`, and `selectDevice`
directly from `iphone-agent` and even used the MCP server's in-process session
manager. That made the CLI a second execution point: it had to manage device
sessions, driver state, and errors by itself, and it could reach into the
implementation at will. Every future client (Dashboard, voice, VS Code) would
have been dragged into the same coupling.

## Decision

The CLI (`apps/cli`) is a thin client: it communicates with the system only via
the MCP server over a child-process stdio bridge.

- `apps/cli/src/mcpClient.ts` spawns the MCP server (`@athena-os/mcp-server/bin`)
  using the MCP `Client` + `StdioClientTransport`, and wraps tool calls.
- Commands (`doctor`, `connect`, `screenshot`, `tap`, `type`, `launch`, `home`,
  `tree`, `disconnect`) map one-to-one to MCP server tools.
- The CLI's package deps dropped `iphone-agent`, `executor`, `shared`; it depends
  only on `@athena-os/mcp-server` (for the bin path) and the MCP SDK.
- `doctor` is served as an MCP tool (re-using `verifyWDA` behind the boundary)
  rather than an in-process import.

## Consequences

### Positive

- The CLI cannot corrupt device state or duplicate session logic — it's just a
  JSON-RPC consumer.
- Proof the boundary holds: `git grep` for `@athena-os/iphone-agent` in `apps`
  returns nothing.
- Replacing or adding clients (Dashboard etc.) exercises the identical path.
- Result: `athena doctor` runs the MCP server as a child and prints environment
  status — verified live.

### Negative / Risks

- Every CLI invocation spawns a short-lived server process (startup latency ~ms;
  acceptable). A persistent daemon session is future work.
- CLI error UX depends on the server serializing errors as JSON tool results —
  the client must parse both `success` and `isError` shapes.

### Follow-ups

- Long-lived sessions / a daemonized MCP server if CLI round-trips grow.
- Type-safe client (shared zod-validated tool result types) to replace
  discretionary JSON casting in `mcpClient.ts`.

## Alternatives Considered

- **CLI imports the SDK and executor in-process** — rejected: makes the CLI a
  second implementation path and couples every feature to the SDK.
- **CLI calls the MCP server via HTTP instead of stdio** — deferred: stdio is
  the simplest embeddable transport today; HTTP is a planned transport swap with
  no CLI changes required thanks to ADR 0002.