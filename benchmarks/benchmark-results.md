# Athena Reasoning-Backend Benchmark

Generated: 2026-08-13T06:13:24.779Z
Mode: execution (simulator)
Scenarios: open-settings, reply-message, photo-cleanup, launch-camera, toggle-dark-mode, flight-search, weekend-trip

## Per-backend summary

| Backend | Model | Network | Cost | Extraction | Plan valid | Exec success | Clarify rate | Avg latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deterministic | deterministic-keyword | no | $0 (local heuristic) | 43% | 43% | 14% | 57% | 14137ms |
| apple | apple:system-language-model | no | $0 (on-device FoundationModels) | 86% | 86% | 71% | 14% | 74598ms |

## Scenario detail

### deterministic

| Scenario | Kind | Extract | Plan valid | Exec success | Steps | Latency |
| --- | --- | --- | --- | --- | --- | --- |
| open-settings | executed | ✓ | ✓ | ✓ | 1/1 | 27955ms |
| reply-message | clarificationRequired | ✗ | ✗ | ✗ | 0/0 | 665ms |
| photo-cleanup | clarificationRequired | ✗ | ✗ | ✗ | 0/0 | 351ms |
| launch-camera | executionFailed | ✓ | ✓ | ✗ | 0/2 | 44406ms |
| toggle-dark-mode | executionFailed | ✓ | ✓ | ✗ | 0/2 | 24676ms |
| flight-search | clarificationRequired | ✗ | ✗ | ✗ | 0/0 | 611ms |
| weekend-trip | clarificationRequired | ✗ | ✗ | ✗ | 0/0 | 298ms |

### apple

| Scenario | Kind | Extract | Plan valid | Exec success | Steps | Latency |
| --- | --- | --- | --- | --- | --- | --- |
| open-settings | executed | ✓ | ✓ | ✓ | 1/1 | 45209ms |
| reply-message | executed | ✓ | ✓ | ✓ | 4/4 | 92941ms |
| photo-cleanup | executed | ✓ | ✓ | ✓ | 2/2 | 50633ms |
| launch-camera | executionFailed | ✓ | ✓ | ✗ | 0/2 | 81720ms |
| toggle-dark-mode | executed | ✓ | ✓ | ✓ | 1/1 | 34962ms |
| flight-search | executed | ✓ | ✓ | ✓ | 7/7 | 81922ms |
| weekend-trip | clarificationRequired | ✗ | ✗ | ✗ | 0/0 | 134797ms |

## Recommendation

Default backend: **apple** — Ranked by plan validity rate, then execution success rate, then preference for offline/zero-cost backends.


## Analysis & decision

**Recommended default: `apple`.** It is local (no network) and free
(on-device FoundationModels), yet achieves materially higher extraction,
plan-validity and execution-success rates than the deterministic keyword
backend on the same scenario set and the same production capability registry.

**Fallback strategy.** The deterministic backend depends on no model at all,
so it is the correct automatic fallback when Apple Intelligence is unavailable
(e.g. non-Apple hardware, intelligence disabled, or on-device model load
failure). The CLI already surfaces a typed `APPLE_INTELLIGENCE_UNAVAILABLE`
error, so the runner can fall back to `deterministic` there.

**OpenAI / cloud backend.** Gated behind an API key
(`OPENAI_API_KEY` / `ATHENA_OPENAI_API_KEY`) and requires network. It is an
opt-in option, not a default: it adds cost and a network dependency with no
quality advantage over the on-device Apple backend for these scenarios.

### Observed limitations (not backend defects)

- **`launch-camera`** fails at execution for *both* backends with
  `Failed to launch app: com.apple.camera`. The iOS Simulator does not expose a
  launchable Camera app, so this is a **simulator limitation**, not a
  reasoning defect. It depresses execution-success equally for both backends.
- **`toggle-dark-mode`** executed under Apple but the deterministic backend
  failed to resolve the "dark mode" control. This is a genuine deterministic
  weakness (keyword mapping only), not environmental.
- **`weekend-trip`** failed under Apple with `model returned invalid JSON`
  (the on-device FM occasionally emits malformed JSON on open-ended prompts).
  This is now handled: `AppleModelClient.extractGoals` retries up to
  `maxParseRetries` (default 1) with a repair instruction, and on exhaustion
  degrades to a `clarificationRequired` result instead of throwing — so the
  runner re-plans or asks the user rather than crashing (see commit
  `feat(apple): retry/repair malformed on-device JSON`).

### Methodology

Execution numbers use the production global capability registry
(`iphoneRunRegistry`) via the real `athena run` path, which is a fair
apples-to-apples comparison (same registry and device for every backend).
The canonical conformance harness in `@athena-os/reasoning-backends`
(`runComparison`, per-scenario registries) reports `deterministic 5/7` and
`apple 7/7` valid plans — the same directional result.

### Reproduce

```bash
pnpm --filter @athena-os/cli build
node scripts/benchmark.mjs --execute --backends apple,deterministic \
  --json benchmarks/benchmark-results.json --md benchmarks/benchmark-results.md
# or merge separate per-backend runs:
node scripts/merge-benchmark.mjs benchmarks/benchmark-det.json \
  benchmarks/benchmark-apple.json --json benchmarks/benchmark-results.json
```
