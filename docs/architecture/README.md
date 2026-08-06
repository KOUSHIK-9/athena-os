# Athena OS Architecture

```mermaid
graph TB
    subgraph Clients["Clients"]
        CLI["apps/cli<br/><i>thin client</i>"]
        FUTURE["Future: Dashboard, Voice, VS Code"]
    end

    subgraph Servers["Servers"]
        MCP["servers/mcp-server<br/>JSON-RPC over stdio"]
    end

    subgraph Agents["Agents"]
        IPA["agents/iphone-agent<br/>session mgmt, WDA, device discovery"]
    end

    subgraph Execution["Execution"]
        EX["packages/executor<br/>Executor interface"]
        DRV["packages/driver<br/>Driver + Appium impl + DriverConfig"]
    end

    subgraph Domain["Domain"]
        CORE["packages/core<br/>Action, Result, Selector, UITree,<br/>ScreenState, Screenshot, DeviceInfo,<br/>Session, Events, Errors"]
    end

    subgraph Utilities["Utilities"]
        SHARED["packages/shared<br/>logger, config, utils"]
        SDK["packages/sdk<br/>public SDK (domain + factories)"]
    end

    CLI -->|spawn + stdio| MCP
    FUTURE -.->|future| MCP
    MCP --> IPA
    IPA --> EX
    EX --> DRV
    DRV --> CORE
    IPA --> CORE
    MCP --> CORE
    CLI --> SHARED
    MCP --> SHARED
    IPA --> SHARED
    EX --> SHARED
    DRV --> SHARED
    SDK --> CORE
    SDK --> SHARED

    style CLI fill:#2d2d2d,stroke:#888,color:#fff
    style MCP fill:#1f3a5f,stroke:#4a90d9,color:#fff
    style IPA fill:#1f3a5f,stroke:#4a90d9,color:#fff
    style EX fill:#3a5f1f,stroke:#7fb84a,color:#fff
    style DRV fill:#3a5f1f,stroke:#7fb84a,color:#fff
    style CORE fill:#5f1f3a,stroke:#d94a8a,color:#fff
    style SHARED fill:#555,stroke:#999,color:#fff
    style SDK fill:#555,stroke:#999,color:#fff
```

## Dependency rules (enforced by `pnpm test:architecture`)

- Edges flow downward only. No package may import a package above its layer.
- Only `packages/driver` may mention Appium/WebDriverAgent.
- `packages/core` has no workspace dependencies; it defines every domain contract.
- The CLI never imports executor/driver/agent — only the MCP client and `shared`.
