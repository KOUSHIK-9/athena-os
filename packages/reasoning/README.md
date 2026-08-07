# @athena-os/reasoning

Implements:
RFC-0011 — Deterministic Reasoning Engine

Purpose:
Transforms Intent into a validated Execution Plan without using an LLM.

## Pipeline

```
Intent
   │
   ▼
Goal Extractor
   │
   ▼
Constraint Checker
   │
   ▼
Capability Matcher
   │
   ▼
Plan Builder
   │
   ▼
Plan Validator
   │
   ▼
Execution Plan
```

Each stage is an independent module in `src/`, owned by this package only.
The engine (`engine.ts`) composes the stages; every stage is replaceable
(an LLM-backed RFC-0012 implementation may swap in later, behind the same
interfaces defined here).
