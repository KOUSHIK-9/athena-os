# Athena OS

> An intelligent operating system layer for iOS, built with Appium, MCP, and local AI.

## Vision

Athena OS transforms your iPhone into an autonomous agent capable of understanding intent, executing complex workflows, and learning from interaction—all while keeping your data private and local.

## Architecture

```
athena-os/
├── apps/           # User-facing applications
├── packages/       # Shared libraries and utilities
├── servers/        # Backend services (MCP, API, etc.)
├── agents/         # AI agent implementations
├── tests/          # Integration and E2E tests
└── docs/           # Architecture, RFCs, guides
```

## Getting Started

### Prerequisites

- macOS 14+ (Sonoma or later)
- Xcode 15+ with Command Line Tools
- Node.js 20+ (via nvm/fnm)
- pnpm 9+
- iOS Device (physical, not simulator) with Developer Mode enabled
- Appium 2+
- WebDriverAgent (built via Xcode)

### Installation

```bash
# Clone and install
git clone https://github.com/Athena-OS/athena-os.git
cd athena-os
pnpm install

# Build WebDriverAgent (one-time)
cd packages/webdriveragent
xcodebuild -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner -destination 'id=<YOUR_DEVICE_UDID>' test

# Start development
pnpm dev
```

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `apps/` | Dashboard, CLI, companion apps |
| `packages/` | Core SDK, MCP server, vision models, utilities |
| `servers/` | Local API, relay, orchestration |
| `agents/` | Planner, executor, verifier, memory |
| `tests/` | E2E, integration, contract tests |
| `docs/` | Architecture, RFCs, API reference |

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
```

## Documentation

- [Architecture Overview](docs/architecture/README.md)
- [RFCs](docs/rfcs/)
- [API Reference](docs/api/)
- [Roadmap](ROADMAP.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Community

- GitHub: [github.com/Athena-OS](https://github.com/Athena-OS)
- Discussions: [GitHub Discussions](https://github.com/Athena-OS/athena-os/discussions)
- Issues: [GitHub Issues](https://github.com/Athena-OS/athena-os/issues)