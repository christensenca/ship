# API Latency Comparison

Baseline: baseline (2026-03-10T17:00:13.771Z)
Current: current (2026-03-10T17:00:13.771Z)
Gate: P95 @ c=25, improvement >= 20%

## c=25 Before/After

| Endpoint | Baseline P95 | Current P95 | Delta (ms) | Delta (%) |
|---|---:|---:|---:|---:|
| /api/documents?type=wiki | 53 | 53 | 0 | 0% |
| /api/issues | 48 | 48 | 0 | 0% |
| /api/projects | 23 | 23 | 0 | 0% |
| /api/programs | 14 | 14 | 0 | 0% |
| /api/dashboard/my-week | 23 | 23 | 0 | 0% |

## Gate Status

- `/api/documents?type=wiki`: 0% (misses 20% target)
- `/api/issues`: 0% (misses 20% target)

## Scope Notes

- This comparison reflects non-SQL request-path changes only.
- Remaining query-planner and index work is intentionally deferred to the separate SQL optimization pass.
