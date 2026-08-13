# Athena Reasoning-Backend Benchmark

Generated: 2026-08-13T05:48:47.660Z
Mode: execution (simulator)
Scenarios: open-settings, reply-message, photo-cleanup, launch-camera, toggle-dark-mode, flight-search, weekend-trip

## Per-backend summary

| Backend | Model | Network | Cost | Extraction | Plan valid | Exec success | Clarify rate | Avg latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| apple | apple:system-language-model | no | $0 (on-device FoundationModels) | 100% | 86% | 71% | 0% | 64560ms |

## Scenario detail

### apple

| Scenario | Kind | Extract | Plan valid | Exec success | Steps | Latency |
| --- | --- | --- | --- | --- | --- | --- |
| open-settings | executed | ✓ | ✓ | ✓ | 1/1 | 45209ms |
| reply-message | executed | ✓ | ✓ | ✓ | 4/4 | 92941ms |
| photo-cleanup | executed | ✓ | ✓ | ✓ | 2/2 | 50633ms |
| launch-camera | executionFailed | ✓ | ✓ | ✗ | 0/2 | 81720ms |
| toggle-dark-mode | executed | ✓ | ✓ | ✓ | 1/1 | 34962ms |
| flight-search | executed | ✓ | ✓ | ✓ | 7/7 | 81922ms |
| weekend-trip | undefined | ✓ | ✗ | ✗ | 0/0 | 64536ms |

## Recommendation

Default backend: **apple** — Ranked by plan validity rate, then execution success rate, then preference for offline/zero-cost backends.
