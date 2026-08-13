# Milestone 5 — Memory Product Loop (Developer Preview)

- Version: `v1.0.0` (Developer Preview)
- Branch: `master`
- Date: 2026-08-13
- Depends on: RFC-0011 (Deterministic Reasoning Engine), RFC-0012 (Reasoning
  Backend Contract), RFC-0013 (Memory Model), RFC-0014 (Memory Retrieval),
  RFC-0015 (Preferences), RFC-0016 (Triggers)
- Status: **Developer Preview — 100% complete (released as `v1.0.0`)**

## Summary

Milestone 5 closes the loop Athena was missing: it now **remembers**. Intent
still flows through Apple on-device intelligence → Goals → Constraints →
Execution Plan → Validator → Simulator → Verified UI action, and the outcome
feeds back into persistent memory.

```
Human Intent
    ↓
Apple on-device intelligence
    ↓
Memory retrieval (RFC-0013/0014)
    ↓
Goals → Constraints → Execution Plan → Validator → Execution Graph
    ↓
Simulator / Device → Verified result
    ↓
Memory write-back (experience / trigger state)
```

The Memory handoff deliberately keeps the `reason(intent, registry)` contract
unchanged (RFC-0013 §The Contract). Memory is delivered out-of-band through a
`MemoryReader` property on the backend, set by the engine — no downstream stage
was touched.

## What shipped

1. **Deterministic Memory stack** (`packages/memory`): append-only
   `InMemoryStore` with supersession, `DeterministicRetriever` (RFC-0014 total
   ordering: scope → kind → stability), and the `RetrievalResult` context type.
2. **Reasoning handoff** (`packages/reasoning`): `ReasoningBackend.memory?` +
   `retrievedMemory` surfaced through `ReasoningBackendResult` →
   `ReasoningResult`. Engine sets the reader before `reason`.
3. **Apple/LLM integration** (`packages/reasoning-backends`): retrieved memory is
   injected into the on-device model's extraction context
   (`ModelExtractionContext.memory` + goal-prompt rendering), so the FoundationModels
   bridge reasons with remembered context.
4. **Trigger firing** (`servers/mcp-server/src/run/triggers.ts`): RFC-0016
   execution-side lifecycle — `pending → fired → satisfied` / `re-armed →
   pending` / `cancelled` — reusing the `trigger` MemoryEntry (no second model).
   `runDueTriggers` fires due triggers and advances state from the actual
   pipeline outcome.
5. **Experience write-back**: a verified-successful execution is recorded as an
   `experience` MemoryEntry. Failures never become false successful memory
   (guarded at the call site and in `recordExperience`).
6. **Live Apple scenario** (`memory.appleScenarios.test.ts`): full-loop scenario
   on the iPhone 17 Simulator, gated behind `ATHENA_REAL_DEVICE=1 &&
   ATHENA_APPLE_MODEL=1` (skips cleanly in CI). **Runtime-verified**: executed
   live against a booted iPhone 17 (`EBB6FAF3-65D9-495D-9882-11392B9A9643`) —
   preference written → retrieved into the Apple model context → on-device plan →
   Appium-driven execution (`verified: true`) → `experience` written back.

## Gates (all green)

- `pnpm test:rfcs` — RFC consistency check passes.
- `pnpm --filter @athena-os/reasoning --filter @athena-os/reasoning-backends
  --filter @athena-os/memory --filter @athena-os/mcp-server typecheck` — clean.
- Unit + integration suites: reasoning 70, memory 10, backends 56, run-layer 83
  (incl. trigger lifecycle, memory-loop, Apple-context, and gated live scenario).
- `eslint` clean on affected packages.
- **Live Apple-memory scenario executed on a booted iPhone 17 Simulator and
  passed**: the full write → retrieve → Apple on-device reasoning → simulator
  execution → verification → experience write-back loop is runtime-verified
  (not merely structural/hermetic).

## Explicitly out of scope (future milestones)

Per the Developer Preview finish line, the following are **not** part of this
milestone: physical iPhone hardware track, Learning from outcomes, Multi-Agent
coordination, advanced retrieval algorithms (embeddings/semantic search), and any
revision of already-Accepted RFCs. Those remain deferred milestones.

## Release hardening

- Release notes: `MILESTONE-5-RELEASE.md`.
- Live Apple-memory loop is wired as `pnpm --filter @athena-os/mcp-server
  test:memory:live` (gated; requires a booted iPhone 17 Simulator + Apple
  Intelligence).
- Architecture gate (`pnpm test:architecture`) passes: dependency pyramid and
  Appium boundary enforced.
- Versioning uses changesets (`pnpm changeset`).

## Release (`v1.0.0`)

This milestone is the **Athena Developer Preview v1.0.0** finish line — 100% of
the current product. It was reached under ATHENA FINAL-100 MODE: RFCs
0013–0016 finalized and Accepted, a Memory conformance suite added
(`packages/memory/src/conformance.test.ts`), the full workspace gate is green
(build / test / lint / format / architecture / RFC consistency), a memory
benchmark added, the CLI gained test coverage, and the docs (README, ROADMAP,
this milestone) were updated to the v1.0 / v2.0 split.

- Tag: `v1.0.0`.
- Not published to npm (publish is a separate, opt-in step).
- Physical-iPhone validation remains a **post-release** track and does not block
  the v1.0.0 completion.

## What 100% does and does not mean

- ✅ Means: a complete, shippable Developer Preview — Apple on-device reasoning,
  the Memory loop (preferences, experiences, triggers), end-to-end execution on
  the iPhone 17 Simulator, and the full gate suite green.
- ⏸ Does **not** mean: Learning (Phase 6), Multi-Agent (Phase 7), or the full
  Athena OS vision (Phase 8) are done. Those are the **v2.0** roadmap, not
  missing pieces of the current product.
