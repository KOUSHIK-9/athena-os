# Development Environment

How to become an Athena developer: prerequisites, repository structure, the
workflow, and how to verify your work. Read [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
for the culture and contribution process — this document covers the
mechanics.

---

## 1. Philosophy

Athena is a **cognitive execution platform with a protocol-defined reasoning
architecture** — not "an AI agent that happens to call an LLM". Three
principles shape everything you will touch:

1. **Intent is the API. Execution is the implementation.** (`README.md`)
2. **Every shared concept has exactly one canonical definition, owned by
   exactly one package.** (Engineering Principle #5)
3. **Models are replaceable. Protocols are not.** Reasoning backends swap
   behind a contract; validation, simulation, and execution never do.

Read these before anything else:

- `ATHENA_MANIFESTO.md` — why Athena exists
- `ENGINEERING_PRINCIPLES.md` — the rules of the house
- `ROADMAP.md` — where Athena is going (current phase: Cognition)

---

## 2. Prerequisites

The development machine is macOS (Apple Silicon; developed on macOS 26.x).
Everything below is what a fresh machine needs.

| Tool | Requirement | Notes |
|------|-------------|-------|
| macOS | 14+ (dev machine: 26.x, Apple Silicon) | Intel untested |
| Xcode Command Line Tools | `xcode-select --install` | Required for build toolchain |
| Node.js | `>=20` (dev machine: 26.x) | `package.json` engines |
| pnpm | `9.6.0` | Pinned via `packageManager` in root `package.json`; use `corepack` |
| Git | any modern version | |
| Xcode + iPhone (device work only) | Developer Mode, signing | Only for `agents/iphone-agent` on real devices |
| Appium 2 (device work only) | `appium` CLI | Only for the driver stack |
| External SSD (optional) | — | See §11 for the macOS permission caveat |

Version pins live in the workspace `catalog` (`pnpm-workspace.yaml`):
TypeScript ^5.5, Vitest ^2, ESLint ^9, Prettier ^3.3, Turbo ^2, tsx ^4.16,
zod ^3.23, effect ^3.6, pino ^9, MCP SDK ^1, Appium ^2.

---

## 3. Repository Structure

```
athena-os/
├── packages/     # Libraries, layered by the dependency pyramid (§5)
│   ├── core/     # Layer 0 — protocol contracts (zod schemas)
│   ├── driver/   # Layer 1 — driver abstraction + Appium implementation
│   ├── understanding/  # Layer 1 — UI semantic model & element resolution
│   ├── reasoning/      # Layer 1 — reasoning engine + backend contract
│   ├── reasoning-backends/  # Layer 1 — reasoning backends + conformance
│   ├── executor/ # Layer 2 — action execution interfaces
│   ├── sdk/      # Layer 4 — public SDK surface
│   └── shared/   # Utility — logger, errors, config (importable anywhere)
├── apps/
│   └── cli/      # Layer 5 — the `athena` CLI
├── servers/
│   └── mcp-server/  # Layer 4 — MCP tool surface
├── agents/
│   └── iphone-agent/  # Layer 3 — device execution agent
├── docs/
│   ├── rfcs/          # RFC-0001 … RFC-0012 (the protocol language)
│   ├── adr/           # ADR-0000 … ADR-0005 (decision records)
│   ├── milestones/    # MILESTONE-2 … MILESTONE-4 (release baselines)
│   ├── reference-implementations/  # per-RFC implementation notes
│   ├── architecture/  # cross-cutting architecture notes
│   ├── api/           # API docs (draft)
│   └── guides/        # how-to guides (this file)
├── scripts/
│   └── architecture-check.mjs  # enforces the dependency pyramid
└── tests/            # reserved for cross-package suites
```

It is a **pnpm workspace** (`packages/*`, `apps/*`, `servers/*`, `agents/*`)
orchestrated by **Turbo** (`turbo.json`), which caches build/test/lint/typecheck
tasks by content hash.

---

## 4. Package Responsibilities

Why each package exists — not just what it contains.

| Package | Responsibility |
|---------|----------------|
| `@athena-os/core` | **Owns Athena's protocol language.** Every shared concept — Intent, Goal, Constraint, ExecutionPlan, Capability, Action, Result — has exactly one canonical definition here (zod schemas in `contract.ts`). If a concept is shared, it lives in `core`. |
| `@athena-os/driver` | **Owns device access.** The `Driver` abstraction and its Appium implementation. Appium mentions are confined to this package (and the agent that wraps it) by the architecture check. |
| `@athena-os/understanding` | **Owns what is on the screen.** Builds the semantic UI model from the driver's UI tree and resolves labels → selectors semantically (RFC-0002). |
| `@athena-os/reasoning` | **Owns the reasoning contract and engine.** The RFC-0011 pipeline stages, `ReasoningEngine` (backend-agnostic), and the RFC-0012 `ReasoningBackend` contract. It never knows about specific model providers. |
| `@athena-os/reasoning-backends` | **Implements interchangeable reasoning backends** that satisfy the `ReasoningBackend` contract — the deterministic reference and the model-backed LLM backend — plus the conformance suite that certifies them (RFC-0012). |
| `@athena-os/executor` | **Owns action execution.** Executes verified plans against a device, with verification and telemetry (RFC-0004). |
| `@athena-os/sdk` | **The public SDK surface.** Stable exports over the executor; the consumer-facing API. |
| `@athena-os/shared` | **Shared utilities** — logger, errors, configuration, helpers. A utility package any layer may import. |
| `agents/iphone-agent` | **The device agent.** Runs on/in front of the driver stack and executes Athena's protocol on an iPhone. |
| `servers/mcp-server` | **The MCP tool surface.** Exposes Athena capabilities (`tree`, `find`, …) over the Model Context Protocol. |
| `apps/cli` | **The `athena` CLI.** Human-facing entry point (`athena tree`, `athena find`, …). |

Layer rule of thumb: `core` defines the words; `reasoning` decides what to
do; `executor`/`driver`/`agent` do it; `sdk`/`mcp-server`/`cli` expose it.

---

## 5. Dependency Rules

The dependency pyramid (enforced by `scripts/architecture-check.mjs`, run
via `pnpm test:architecture`):

```
core (0)
  ↓
driver (1)   understanding (1)   reasoning (1)   reasoning-backends (1)
  ↓
executor (2)
  ↓
iphone-agent (3)
  ↓
sdk (4)   mcp-server (4)
  ↓
cli (5)
```

- **No package may import a package above its layer.** The check scans every
  `src/` file and fails the build on any upward import.
- **Appium may only appear in `driver`** (the agent wraps the driver; every
  other package is forbidden from mentioning it).
- **`shared` is importable by any layer.**
- **One concept, one canonical definition.** If you need a type that already
  exists, import it from its owner — never re-define it locally.

If your change would cross a layer boundary, stop and update the architecture
first (see the two guiding questions in `CONTRIBUTING.md`).

---

## 6. Local Setup

```bash
# 1. Install pnpm 9.6.0 (pinned in package.json)
corepack enable
corepack use pnpm@9.6.0

# 2. Clone and install
git clone <repo-url> athena-os
cd athena-os
pnpm install

# 3. Verify the toolchain
node --version   # >= 20
pnpm --version   # 9.6.0
```

Optional: keep the repo on an external SSD — see §11, "macOS blocks the
external volume" for the permission you must grant first.

---

## 7. Running Athena

```bash
pnpm build        # compiles every package (tests depend on it)
pnpm dev          # watch mode for all packages
pnpm test         # full test suite (turbo; depends on build)
pnpm lint         # eslint across all packages
pnpm typecheck    # tsc --noEmit across all packages
pnpm test:architecture   # dependency pyramid + Appium boundary
```

Per-package: `pnpm --filter=<package> <task>`, e.g.
`pnpm --filter=@athena-os/reasoning-backends test`.

The end-user surfaces are `apps/cli`, `servers/mcp-server`, and
`agents/iphone-agent` (device work requires Appium + a signed WebDriverAgent;
see the READMEs and §2).

---

## 8. Development Workflow

Athena's workflow is protocol-first. It is deliberately strict.

```
Idea
  │
  ▼
Which RFC does this implement?
  │
  ├── None → this is a new concept → stop: write an RFC first
  │
  ▼
Existing concept?
  │
  ├── New concept → architecture review (RFC + ADR) before any code
  │
  ▼
Implementation  (smallest PR that proves the point)
  │
  ▼
Conformance    (the RFC's tests: examples, fixtures, exact equality)
  │
  ▼
Verification   (build + lint + typecheck + test + architecture check)
  │
  ▼
Commit         (conventional, one commit one reason)
```

The two questions that gate every change:

> 1. **Which RFC does this implement?**
> 2. **Does this introduce a new concept, or is it an implementation of an
>    existing concept?** — New concept → update the architecture first.
>    Existing concept → write code.

Commit discipline:

- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- **One commit, one reason to exist.** No drive-by reformats, no unrelated
  fixes smuggled in — that keeps `git blame`, review, and bisect clean.
- Scope tags match packages: `feat(reasoning): …`,
  `feat(reasoning-backends): …`.
- A PR states which RFC it implements and whether it changes the protocol or
  implements it.

---

## 9. Testing & Verification

- **Unit tests** live next to sources: `*.test.ts`, run by Vitest.
- **Executable examples** live in `packages/reasoning/examples/` and are run
  by the suite (they are the RFC-0011 scenario contract).
- **Conformance** (`packages/reasoning-backends`) is deep-equality against
  canonical fixtures: parity fixtures (frozen deterministic output) and
  behavioral fixtures (authored oracles). A backend either reproduces the
  fixture exactly or it does not conform.
- **Hermeticity:** the conformance suite runs without any API key or network
  (the model-backed backend tests use the in-repo `StubModelClient`).
- The complete gate before any commit:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:architecture
```

New files must pass Prettier (`pnpm format:check`). Note: the repository has
a known, pre-existing Prettier drift across older files; keep *your* files
formatted and do not reformat unrelated code in your PR (see §11).

---

## 10. Release Workflow

Milestones are how Athena ships baselines.

```
RFC → Implementation PRs → Tests → Architecture Review → Milestone doc → Tag
```

- A milestone is a written baseline in `docs/milestones/MILESTONE-N.md`:
  what was proven, what it depends on, and the version tag.
- Tags follow `vX.Y.Z-alpha.N` (e.g. `v0.3.0-alpha.1` — Milestone 2,
  `v0.4.0-alpha.1` — Milestone 4).
- Milestones update `ROADMAP.md` (phase status) and the releases table in
  `README.md`.
- Nothing is released by version-bump ceremony: a milestone is earned by
  the gates passing and the docs being true.

Current state: Phase 4 (Cognition) — RFC-0011 and RFC-0012 implemented;
backends (deterministic + model-backed) certified by conformance. The
model-backed backend runs on the in-repo `StubModelClient`; real provider
adapters (OpenAI first) implement the same `ModelClient` port.

---

## 11. Troubleshooting

### macOS blocks the external volume (`Operation not permitted` on everything)

Symptom: the repo was readable, then **every** read/write on
`/Volumes/<name>` returns `EPERM`, while Finder still reads the volume
fine. The volume is mounted (`ls /Volumes` shows it) and healthy.

Cause: macOS TCC (Transparency, Consent, and Control) revoked the terminal
app's access to removable volumes — often after a sleep/remount cycle,
especially on ExFAT mounts handled by the `fskit` user-space framework.

Fix (System Settings → Privacy & Security → Files and Folders):

1. Grant **Terminal** (or your host app — opencode inherits from its host)
   access to **Removable/External Volumes**.
2. If it looks granted, toggle it off/on, then **quit the terminal app
   completely** (`Cmd+Q`, not close-tab) and relaunch.
3. Escalation if needed: grant the host app **Full Disk Access**.

Diagnosis, if you hit this again:

```bash
ls /Volumes                # volume present?
ls "/Volumes/<name>"       # EPERM here = TCC, not a disk problem
# Compare with Finder's context:
osascript -e 'tell application "Finder" to count items of (entire contents of disk "<name>")'
```

### "X is not a constructor" / stale exports across packages

Cross-package runtime imports resolve through the dependency's built
`dist/` (package `exports`), not its `src/`. After changing a package,
run `pnpm build` before testing a package that imports it.

### `pnpm format:check` fails on files you did not touch

Known, pre-existing Prettier drift across older files (formatted under an
older Prettier). Do not fix them in your PR — a dedicated normalization
commit will. Run `pnpm format:check` only on your touched files:
`npx prettier --check <your-files>`.

### Node/pnpm version errors

`package.json` pins `engines.node >=20` and `packageManager pnpm@9.6.0`.
`corepack enable` + `corepack use pnpm@9.6.0` aligns your shell.

### Architecture check failures

`pnpm test:architecture` failing means an upward import or an Appium
mention outside `driver`. `git diff` to find the offending import; the
script prints the exact file and line.
