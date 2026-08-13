# Athena Reasoning-Backend Benchmark

Generated: 2026-08-13T05:38:26.155Z
Mode: execution (simulator)
Scenarios: open-settings, reply-message, photo-cleanup, launch-camera, toggle-dark-mode, flight-search, weekend-trip

## Per-backend summary

| Backend | Model | Network | Cost | Extraction | Plan valid | Exec success | Clarify rate | Avg latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deterministic | deterministic-keyword | no | $0 (local heuristic) | 43% | 43% | 14% | 57% | 14137ms |

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

## Recommendation

Default backend: **deterministic** — Ranked by plan validity rate, then execution success rate, then preference for offline/zero-cost backends.
