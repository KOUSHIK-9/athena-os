# Contributing to Athena OS

Thank you for your interest in contributing! This document outlines the process and standards for contributing to Athena OS.

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Issues

- Search existing issues first
- Use the issue templates
- Provide reproduction steps, device info, and logs

### Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run tests and linting: `pnpm test && pnpm lint`
5. Commit with conventional commits: `git commit -m "feat: add amazing feature"`
6. Push and open a Pull Request

### Pull Request Process

- PRs require at least one review
- All CI checks must pass
- Update documentation for user-facing changes
- Squash commits on merge

## Development Standards

### Code Style

- TypeScript strict mode
- ESLint + Prettier (configured in repo)
- Conventional commits
- No `any` types without justification

### Testing

- Unit tests for pure functions
- Integration tests for MCP/tools
- E2E tests for critical user flows
- Minimum 80% coverage for new code

### Documentation

- Update README for new features
- Document public APIs with TSDoc
- Add RFC for architectural changes
- Keep CHANGELOG.md updated

## Project Structure

```
athena-os/
├── apps/           # Applications (dashboard, cli, etc.)
├── packages/       # Shared packages (core, mcp, vision, etc.)
├── servers/        # Backend services
├── agents/         # AI agents
├── tests/          # Test suites
└── docs/           # Documentation
```

Each package has its own `package.json`, `tsconfig.json`, and tests.

## Release Process

1. Version bump via changesets
2. Changelog generated automatically
3. GitHub release created
4. npm packages published (if applicable)

## Questions?

Open a discussion or reach out to maintainers.