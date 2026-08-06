# Architecture Decision Records

An Architecture Decision Record (ADR) is a one-page document capturing a significant
architectural decision: the context, the decision, and the consequences. Read these
before touching a package boundary. New ADRs are numbered sequentially.

## How to add an ADR

1. Copy `0000-template.md` to `NNNN-title.md` (next free number).
2. Fill in Context / Decision / Consequences / Alternatives.
3. `Status: Accepted` when merged; `Superseded by NNNN` when replaced.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-core-package.md) | Extract `packages/core` as the shared domain language | Accepted |
| [0002](0002-mcp-boundary.md) | MCP server is the sole API boundary for clients | Accepted |
| [0003](0003-driver-abstraction.md) | Driver abstraction isolates automation technology | Accepted |
| [0004](0004-cli-boundary.md) | CLI is a thin client over the MCP boundary | Accepted |
| [0005](0005-execution-protocol.md) | The Athena Execution Protocol (Action Pipeline) | Accepted |
