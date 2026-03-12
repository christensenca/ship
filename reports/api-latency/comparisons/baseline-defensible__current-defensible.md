# API Latency Comparison

Baseline: baseline-defensible (2026-03-11T23:59:00.279Z)
Current: current-defensible (2026-03-12T00:08:24.068Z)
Gate: P95 @ c=25, improvement >= 20%

## c=25 Before/After

| Endpoint | Baseline P95 | Current P95 | Delta (ms) | Delta (%) |
|---|---:|---:|---:|---:|
| /api/documents?type=wiki | 57 | 57 | 0 | 0% |
| /api/issues | 54 | 66 | 12 | +22.2% |
| /api/projects | 32 | 28 | -4 | -12.5% |
| /api/programs | 24 | 23 | -1 | -4.2% |
| /api/dashboard/my-week | 39 | 44 | 5 | +12.8% |

## Gate Status

- `/api/documents?type=wiki`: 0% (misses 20% target)
- `/api/issues`: +22.2% (misses 20% target)

## Scope Notes

- This comparison reflects non-SQL request-path changes only.
- Remaining query-planner and index work is intentionally deferred to the separate SQL optimization pass.
