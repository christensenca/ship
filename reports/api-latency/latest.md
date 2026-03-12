# API Latency Audit Report

Generated: 2026-03-12T00:58:45.215Z
Label: current-route-pass
Git SHA: c3b8b9e
API URL: http://127.0.0.1:3002
Warmup: 15s @ c=10
Measured: 30s @ c=10,25,50

## Audit Deliverable Table (P95/P99 focus at c=25)

| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| /api/documents?type=wiki | 38 | 47 | 50 |
| /api/issues | 42 | 52 | 55 |
| /api/projects | 16 | 23 | 26 |
| /api/programs | 11 | 17 | 19 |
| /api/dashboard/my-week | 19 | 35 | 38 |

## Trend

- Overall status: **Improving**
- Average P95 delta (ms): -10.74

## Root Cause Scope

- Addressed in this pass: payload width, JSON serialization, auth/session overhead, and request-path duplication.
- Deferred to separate SQL pass: query plan efficiency, indexes, and join/filter cost.

## Detailed Results

### Concurrency 10

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |
|---|---:|---:|---:|---:|---:|
| /api/documents?type=wiki | 14 | 22 | 24 | 660.67 | 0 |
| /api/issues | 16 | 28 | 37 | 566.5 | 0 |
| /api/projects | 6 | 11 | 13 | 1433.74 | 0 |
| /api/programs | 4 | 7 | 9 | 2090.4 | 0 |
| /api/dashboard/my-week | 7 | 19 | 22 | 1181.77 | 0 |

### Concurrency 25

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |
|---|---:|---:|---:|---:|---:|
| /api/documents?type=wiki | 38 | 47 | 50 | 645.71 | 0 |
| /api/issues | 42 | 52 | 55 | 575.14 | 0 |
| /api/projects | 16 | 23 | 26 | 1485.14 | 0 |
| /api/programs | 11 | 17 | 19 | 2119.9 | 0 |
| /api/dashboard/my-week | 19 | 35 | 38 | 1179.14 | 0 |

### Concurrency 50

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |
|---|---:|---:|---:|---:|---:|
| /api/documents?type=wiki | 78 | 89 | 93 | 630.3 | 0 |
| /api/issues | 90 | 102 | 106 | 551.47 | 0 |
| /api/projects | 33 | 46 | 51 | 1427.77 | 0 |
| /api/programs | 22 | 31 | 35 | 2109.27 | 0 |
| /api/dashboard/my-week | 39 | 58 | 62 | 1192.14 | 0 |

## Slowest Endpoints

1. `/api/issues` (P95=102ms @ c=50) - Heavy joins + belongs_to association expansion can increase query time as issue volume grows.
2. `/api/documents?type=wiki` (P95=89ms @ c=50) - Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.
3. `/api/dashboard/my-week` (P95=58ms @ c=50) - Multiple sequential queries (person, plan/retro, standups, allocations) compound latency versus single-list endpoints.
4. `/api/issues` (P95=52ms @ c=25) - Heavy joins + belongs_to association expansion can increase query time as issue volume grows.
5. `/api/documents?type=wiki` (P95=47ms @ c=25) - Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.

## Route Timing Breakdown

### /api/documents?type=wiki

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.77 | 0.27 | 6.62 | 15 |
| auth_session | 1.12 | 0.55 | 8.89 | 15 |
| db_main | 2.58 | 1.81 | 9.51 | 15 |
| total | 5.79 | 3.99 | 26.36 | 15 |

### /api/issues

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.3 | 0.26 | 0.99 | 15 |
| auth_session | 0.46 | 0.35 | 1.3 | 15 |
| db_main | 1.77 | 1.68 | 2.66 | 15 |
| db_related | 1.53 | 1.42 | 2.76 | 15 |
| mapping | 0.04 | 0.03 | 0.11 | 15 |
| total | 4.94 | 4.72 | 7.33 | 15 |

### /api/projects

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.22 | 0.21 | 0.27 | 15 |
| auth_session | 0.33 | 0.29 | 0.72 | 15 |
| db_main | 1.99 | 1.88 | 3.08 | 15 |
| mapping | 0 | 0 | 0.06 | 15 |
| total | 2.7 | 2.52 | 4 | 15 |

### /api/programs

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.19 | 0.18 | 0.26 | 15 |
| auth_session | 0.26 | 0.23 | 0.55 | 15 |
| db_main | 0.99 | 0.93 | 1.35 | 15 |
| mapping | 0 | 0 | 0 | 15 |
| total | 1.52 | 1.41 | 2.12 | 15 |

### /api/dashboard/my-week

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.19 | 0.18 | 0.26 | 15 |
| auth_session | 0.29 | 0.25 | 0.67 | 15 |
| db_main | 0.93 | 0.88 | 1.36 | 15 |
| mapping | 0.3 | 0.29 | 0.44 | 15 |
| total | 1.82 | 1.66 | 2.94 | 15 |
