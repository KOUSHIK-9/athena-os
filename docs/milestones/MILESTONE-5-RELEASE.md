# Developer Preview — Release Notes (v0.5.0-preview)

Status: **Runtime-verified** on a booted iPhone 17 Simulator. First complete
Athena product loop: intent → Apple on-device reasoning → memory-aware plan →
validated execution → verified result → experience written back.

Tracking milestone: `docs/milestones/MILESTONE-5.md`.

## What's in the preview

- **Apple on-device reasoning** — goals/plans produced by the on-device
  FoundationModels bridge (`packages/reasoning-backends`, `apple/`).
- **Memory model + retrieval** (RFC-0013 / RFC-0014) — `packages/memory`:
  append-only store with supersession, `DeterministicRetriever` (scope → kind →
  stability ordering), `RetrievalResult` context type.
- **Preferences** (RFC-0015) — `preference` MemoryEntries retrieved as
  always-eligible context; surfaced in `ReasoningResult.retrievedMemory`.
- **Trigger firing** (RFC-0016) — `servers/mcp-server/src/run/triggers.ts`:
  execution-side lifecycle `pending → fired → satisfied` / `re-armed → pending`
  / `cancelled`, reusing the `trigger` MemoryEntry (no second model).
- **Experience write-back** — verified-successful runs recorded as `experience`
  MemoryEntries; failures never become false successful memory.
- **Memory-aware Apple path** — retrieved memory injected into the on-device
  model's extraction context (`ModelExtractionContext.memory` + goal prompt).

## How to run

```bash
# Deterministic / hermetic gates (no device needed)
pnpm test:rfcs
pnpm --filter @athena-os/reasoning --filter @athena-os/reasoning-backends \
      --filter @athena-os/memory --filter @athena-os/mcp-server typecheck
pnpm --filter @athena-os/mcp-server test

# Live Apple-memory loop on a booted iPhone 17 Simulator
# (requires Apple Intelligence + a booted simulator; skips cleanly otherwise)
pnpm --filter @athena-os/mcp-server test:memory:live
```

The live scenario (`servers/mcp-server/src/run/memory.appleScenarios.test.ts`)
asserts the full chain: preference written → retrieved into the Apple model
context → on-device plan → Appium-driven execution (`verified: true`) →
`experience` written back.

## Known constraints (by design for this preview)

- Memory is **session-scoped via the injected `MemoryStore`**; no cross-process
  persistence layer yet (that is a future milestone).
- Triggers fire through the run lifecycle but are not yet driven by a background
  scheduler (RFC-0016 §4 scheduler is a follow-up).
- The deterministic `DeterministicRetriever` is the only retriever; semantic /
  embedding-based retrieval is explicitly out of scope for the preview.

## Out of scope (deferred milestones)

Physical iPhone hardware track, Learning from outcomes, Multi-Agent coordination,
advanced retrieval algorithms, and any revision of already-Accepted RFCs.
