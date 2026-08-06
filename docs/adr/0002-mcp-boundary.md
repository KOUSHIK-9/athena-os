# ADR 0002 — MCP Server Is the Sole API Boundary for Clients

## Status

Accepted

## Context

Athena needs to be consumed by many frontends (CLI today; Dashboard, voice,
VS Code extension, SDK users tomorrow). If each frontend imported the executor or
agent directly, every client would need to know session management, driver
lifecycle, and error handling — and a client bug could corrupt shared state.

We wanted a single, well-defined, observable API boundary that (a) exposes the
device session and action execution as discrete tools, (b) can be spoken by any
frontend over a standard protocol, and (c) keeps execution logic in exactly one
place.

## Decision

The MCP server (`servers/mcp-server`) is the only way for clients to reach device
execution.

- It exposes tools: connect, launchApp, tap, type, swipe, screenshot, getTree,
  pressHome, terminateApp, wait, back, disconnect, doctor.
- Communication uses MCP JSON-RPC; today over stdio (child process), with
  HTTP/WebSocket as planned transports.
- The server owns the session manager and routes tool calls to the agent/executor.
- Clients never import `iphone-agent`, `executor`, or `driver`.

## Consequences

### Positive

- Every frontend speaks one protocol; adding a Dashboard or voice client means
  implementing an MCP client, not duplicating device logic.
- Execution stays centralized: session lifecycle, retries, and health checks are
  implemented once in the server.
- Stdio framing keeps stdout clean for JSON-RPC (server logs go to stderr via
  `ATHENA_LOG_STREAM`), making child-process embedding reliable.

### Negative / Risks

- Adds a process hop (spawn + JSON-RPC) — negligible for human-driven CLI use.
- The server must keep its tool surface stable; tool additions are additive, but
  breaking changes affect every client.
- Error/session state crossing the boundary must be serializable (JSON).

### Follow-ups

- Streamable transports (HTTP, WebSocket) for non-CLI clients.
- Server tool descriptions as the canonical "public API" documentation.

## Alternatives Considered

- **Clients import the SDK directly (in-process)** — rejected: couples every
  frontend to session/executor internals; an SDK bug or crash in a client would
  corrupt device state.
- **REST/HTTP server only** — rejected: MCP gives structured tool discovery and
  is the emerging standard for agent-facing APIs; stdio is trivially embeddable.