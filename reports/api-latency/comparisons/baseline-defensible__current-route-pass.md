# API Latency Comparison

Baseline: baseline-defensible (2026-03-11T23:59:00.279Z)
Current: current-route-pass (2026-03-12T00:58:45.215Z)
Gate: P95 @ c=25, improvement >= 20%

## c=25 Before/After

| Endpoint | Baseline P95 | Current P95 | Delta (ms) | Delta (%) |
|---|---:|---:|---:|---:|
| /api/documents?type=wiki | 57 | 47 | -10 | -17.5% |
| /api/issues | 54 | 52 | -2 | -3.7% |
| /api/projects | 32 | 23 | -9 | -28.1% |
| /api/programs | 24 | 17 | -7 | -29.2% |
| /api/dashboard/my-week | 39 | 35 | -4 | -10.3% |

## Gate Status

- `/api/documents?type=wiki`: -17.5% (misses 20% target)
- `/api/issues`: -3.7% (misses 20% target)

## Scope Notes

- This comparison reflects non-SQL request-path changes only.
- Remaining query-planner and index work is intentionally deferred to the separate SQL optimization pass.
