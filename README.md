# Athena OS

> An intelligent operating system layer for iOS, built with Appium, MCP, and local AI.

## Vision

Athena OS transforms your iPhone into an autonomous agent capable of understanding intent, executing complex workflows, and learning from interaction—all while keeping your data private and local.

## Architecture

Athena is built around a single, immutable flow:

```
User
  │
  ▼
Planner           (decides what to do - not yet wired)
  │
  ▼
Action Pipeline   (Request → Validation → Execution → Verification → Telemetry → Result)
  │
  ▼
Execution Engine  (executor, strategies, per-action verification)
  │
  ▼
Driver            (the one layer allowed to know about Appium/WebDriverAgent)
  │
  ▼
Device
```

The protocol that carries an action end-to-end is the Athena Protocol:

```
Action
  │
  ▼
Validation
  │
  ▼
Execution
  │
  ▼
Verification
  │
  ▼
Telemetry
  │
  ▼
Result
```

That protocol does not care whether the executor controls an iPhone, a browser, a Mac, or an Android device. Every action leaves evidence: a Result, a Verification, and Telemetry.

### Repository layout

```
athena-os/
├── apps/           # User-facing applications (CLI)
├── servers/        # Backend services (MCP server)
├── agents/         # Execution agents (iphone-agent)
├── packages/       # Shared libraries (core, driver, executor, shared, sdk)
├── tests/          # Integration and E2E tests
└── docs/           # Architecture, ADRs, guides
```

## Getting Started

### Prerequisites

- macOS with Xcode (required for device automation via WebDriverAgent)
- iOS Device (physical, not simulator) with Developer Mode enabled
- Node.js 20+ (via nvm/fnm)
- pnpm 9+
- Appium 2+ (server, started separately)
- WebDriverAgent (built via Xcode)

### Quick start

```bash
# Install workspace deps
pnpm install

# Build all packages
pnpm build

# Check the environment (Xcode, devices, WebDriverAgent)
pnpm --filter @athena-os/cli dev -- doctor        # or: node apps/cli/dist/index.js doctor

# List devices
node apps/cli/dist/index.js devices

# Connect to the single available device and take a verified screenshot
node apps/cli/dist/index.js connect
node apps/cli/dist/index.js screenshot
```

## Development

```bash
# Run all tests
pnpm test

# Lint and format
pnpm lint
pnpm format

# Type check
pnpm typecheck

# Build all packages
pnpm build

# Architecture contract check
pnpm test:architecture
```

## Releases

Releases are tagged milestones, not just versions:

| Tag              | Milestone                                  |
|------------------|--------------------------------------------|
| `v0.0.0`         | Repository bootstrap                       |
| `v0.0.1`         | Core architecture extraction               |
| `v0.0.2`         | MCP integration (CLI → MCP child process)   |
| `v0.1.0-alpha.1` | Device discovery (doctor / devices)         |
| `v0.1.0-alpha.2` | Executor stabilization (retries, session)   |
| `v0.2.0-alpha.1` | Action Pipeline (Athena Protocol)           |
| **`v0.2.0-alpha.2`** | **Screenshot lifecycle (metadata + save + verify)** |
| **`v0.3.0-alpha.1`** | **Execution Platform baseline (Milestone 2)** |
| **`v0.4.0-alpha.1`** | **Deterministic Cognition baseline (Milestone 4)** |

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Development Environment & Contributor Guide](docs/guides/development-environment.md)
- [Engineering Principles](ENGINEERING_PRINCIPLES.md)
- [Architecture Overview](docs/architecture/README.md)
- [Architecture Decision Records](docs/adr/)

## Community

- GitHub: [github.com/Athena-OS](https://github.com/Athena-OS)

## License

MIT License - see [LICENSE](LICENSE) for details.