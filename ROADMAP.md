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

## Phase 4 — Cognition 🚧 **Current**

**Milestone 4:** prove the language can *think*.

- RFC-0011: Deterministic Reasoning Engine — transform
  `Intent → Goal Extractor → Constraint Checker → Capability Matcher →
  Plan Builder → Plan Validator → Execution Plan` with **no LLM**.
- RFC-0012: LLM Reasoning Backend — a second implementation of RFC-0009
  (GPT/Claude/future models). The validator stays the authority; the LLM is
  never trusted, only validated.
- Both backends implement RFC-0009; the Execution Plan remains the stable
  contract.

*This phase will prove:* the architecture is sufficient independently of any
model.

## Phase 5 — Memory

Planned: persistent user memory, learned preferences, intent history,
recurring-intent templates (Trigger + template Intents). Governed by RFC-0007.

## Phase 6 — Learning

Planned: adaptation from execution outcomes — learning which plans verify
reliably, refinement of recovery strategies from telemetry.

## Phase 7 — Multi-Agent

Planned: multiple execution targets and coordinating agents speaking the same
language (RFC-0005..0009), one reasoning contract.

## Phase 8 — Athena OS

The full vision: a protocol-driven cognitive execution platform across
digital systems — iPhone today, other surfaces tomorrow.

---

## The guiding questions

Every feature must answer before any code is written:

1. **Which RFC does this implement?**
2. **Does it introduce a new concept, or is it an implementation of an
   existing concept?**
   - New concept → stop, update the architecture first.
   - Existing concept → write code.

## Current Phase

**Phase 4 — Cognition**

**Current Objective:** Prove that Athena's conceptual language can produce
valid Execution Plans without relying on an LLM.
