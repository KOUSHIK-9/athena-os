# Athena Roadmap

The strategic view of Athena's evolution. This is not a TODO list — it is the
direction of the platform. Every phase is a baseline: it builds on the previous
one and is never redesigned.

> **Intent is the API.** *Execution is the implementation.*

Athena evolves in four layers:

```
Philosophy
    ↓
Language
    ↓
Implementation
    ↓
Product
```

---

## Phase 1 — Execution ✅

**Baseline:** `v0.3.0-alpha.1` (Milestone 2)

- Core Protocol, Error Hierarchy, Action Pipeline
- Execution Engine, Verification, Telemetry
- Capability System (10 capabilities, registry-driven)
- MCP Server + CLI
- ADRs 0001–0005, RFC-0001/0002/0004

*What it proved:* Athena can execute actions on a device safely and
observably.

## Phase 2 — Understanding ✅

- UI Semantic Model (RFC-0002)
- Semantic Resolver (resolve label → selector + confidence)
- `athena tree`, `athena find`, `find` MCP tool

*What it proved:* Athena can understand what is on a screen — semantically,
not geometrically.

## Phase 3 — Conceptual Language ✅

**Baseline Established** (Milestone 3)

- ATHENA_MANIFESTO v1.0 (released)
- ENGINEERING_PRINCIPLES (#1–#11; #12 proposal)
- RFC-0005 Intent Model (ontology)
- RFC-0006 Execution Plan Model (grammar)
- RFC-0007 Constraint and Governance Model
- RFC-0008 Decision Point Protocol
- RFC-0009 Contract Between Intent and Execution
- Cross-RFC consistency review: PASS

*What it proved:* Athena has a language — vocabulary, grammar, and rules —
independent of any model or device.

## Phase 4 — Cognition ✅

**Baseline Established:** `v0.4.0-alpha.1` (Milestone 4) — deterministic
reasoning engine complete.

- RFC-0011: Deterministic Reasoning Engine (**Implemented**) — full pipeline:
  `Intent → Goal Extractor → Constraint Checker → Capability Matcher →
  Plan Builder → Plan Validator → Simulation → Execution Graph Builder →
  Executable Plan` with **no LLM**.
- `packages/reasoning` reference implementation; 64 tests; 9 executable
  example scenarios; architecture check PASS.
- RFC-0012: Reasoning Backend Contract & Conformance (**implemented**) — all
  three stages landed: PR 1 contract + conformance harness (parity and
  behavioral fixtures), PR 2 backend integration (the engine's
  `ReasoningEngine` is backend-agnostic; `DeterministicReasoningBackend` is
  the certified reference), PR 3 the first model-backed backend
  (`LlmReasoningBackend` + the `ModelClient` port, certified offline with
  `StubModelClient` — no API, no keys). Both backends reproduce the 5
  parity fixtures exactly; the LLM backend additionally passes the 2
  behavioral canons. The validator stays the authority; the model is never
  trusted, only validated.
- **Apple on-device backend added** — `packages/reasoning-backends` ships an
  `AppleModelClient` that binds the on-device Apple FoundationModels bridge.
  It is the **preferred default**; the engine auto-falls back to the
  deterministic backend when Apple Intelligence is unavailable. This is the
  model-backed backend behind the same `ModelClient` port — no protocol change.

*This phase has proven:* models are replaceable — protocols are not. The
architecture is complete independently of any model; a real provider
(GPT/Claude/Gemini) implements the `ModelClient` port behind the same
contract.

## Phase 5 — Memory ✅ (Developer Preview v1.0)

**Baseline Established:** `v1.0.0` (Milestone 5) — the Memory product loop is
runtime-verified on an iPhone 17 Simulator.

- RFC-0013: The Memory Model (**Accepted**, implemented) — four canonical
  types (`fact`, `preference`, `experience`, `trigger`), append-only
  supersession, ownership, and the authority boundary. The validator stays
  memory-blind.
- RFC-0014: Memory Retrieval (**Accepted**, implemented) — the deterministic
  `DeterministicRetriever` (scope → kind → stability ordering), no heuristics.
- RFC-0015: Preferences (**Accepted**, implemented) — preferences retrieve as
  always-eligible context and project only to *soft* constraints at planning
  time; they never authorize execution.
- RFC-0016: Triggers (**Accepted**, implemented) — execution-side firing
  (`pending → fired → satisfied` / `re-armed → pending` / `cancelled`),
  experience write-back on verified success only, and no false-success memory.
- End-to-end: intent → Apple on-device reasoning → memory-aware plan →
  validated execution → verified result → experience written back, including
  trigger firing and preference retrieval as context.

*This phase has proven:* Memory informs reasoning but never authorizes it. The
loop closes on-device, locally, with the Validator as the sole authority.

## Phase 6 — Learning

**Post–Developer Preview (v2.0 roadmap).** Planned: adaptation from execution
outcomes — learning which plans verify reliably, refinement of recovery
strategies from telemetry. The `experience` Memory type already records the raw
input for this; Learning consumes it without changing the v1.0 contract.

## Phase 7 — Multi-Agent

**Post–Developer Preview (v2.0 roadmap).** Planned: multiple execution targets
and coordinating agents speaking the same language (RFC-0005..0009), one
reasoning contract.

## Phase 8 — Athena OS

The full vision: a protocol-driven cognitive execution platform across
digital systems — iPhone today, other surfaces tomorrow.

---

## Release lines

- **Athena Developer Preview `v1.0.0`** — the current finish line. Apple
  on-device reasoning + the Memory loop, runtime-verified on an iPhone 17
  Simulator. Everything in Phases 1–5 is in scope and complete.
- **Athena `v2.0`** — Learning, Multi-Agent, and broader surface support
  (Phases 6–8). These are *future releases*, not missing pieces of the
  Developer Preview.

## The guiding questions

Every feature must answer before any code is written:

1. **Which RFC does this implement?**
2. **Does it introduce a new concept, or is it an implementation of an
   existing concept?**
   - New concept → stop, update the architecture first.
   - Existing concept → write code.

## Current Phase

**Developer Preview `v1.0.0` — complete.**

Phases 1–5 (Execution, Understanding, Conceptual Language, Cognition, Memory)
are done and runtime-verified on an iPhone 17 Simulator. The remaining roadmap
(Phases 6–8: Learning, Multi-Agent, Athena OS) is the **v2.0** line and is
explicitly out of scope for the Developer Preview. Physical-iPhone validation is
a post-release track that does not block calling `v1.0.0` complete.
