# API Latency Comparison

Baseline: baseline-defensible (2026-03-11T23:59:00.279Z)
Current: current (2026-03-14T17:40:33.349Z)
Gate: P95 @ c=25, improvement >= 20%

## c=25 Before/After

| Endpoint | Baseline P95 | Current P95 | Delta (ms) | Delta (%) |
|---|---:|---:|---:|---:|
| /api/documents?type=wiki | 57 | 38 | -19 | -33.3% |
| /api/issues | 54 | 40 | -14 | -25.9% |
| /api/projects | 32 | 16 | -16 | -50% |
| /api/programs | 24 | 9 | -15 | -62.5% |
| /api/dashboard/my-week | 39 | 23 | -16 | -41% |

## Gate Status

- `/api/documents?type=wiki`: -33.3% (meets 20% target)
- `/api/issues`: -25.9% (meets 20% target)

## Scope Notes

- This comparison reflects non-SQL request-path changes only.
- Remaining query-planner and index work is intentionally deferred to the separate SQL optimization pass.
