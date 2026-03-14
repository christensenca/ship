# API Latency Audit Report

Generated: 2026-03-14T17:40:33.349Z
Label: current
Git SHA: 0cd10ef
API URL: http://127.0.0.1:3000
Warmup: 15s @ c=10
Measured: 30s @ c=10,25,50

## Audit Deliverable Table (P95/P99 focus at c=25)

| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| /api/documents?type=wiki | 30 | 38 | 40 |
| /api/issues | 32 | 40 | 43 |
| /api/projects | 9 | 16 | 18 |
| /api/programs | 6 | 9 | 11 |
| /api/dashboard/my-week | 13 | 23 | 25 |

## Trend

- Overall status: **Improving**
- Average P95 delta (ms): -11.2

## Root Cause Scope

- Addressed in this pass: payload width, JSON serialization, auth/session overhead, and request-path duplication.
- Deferred to separate SQL pass: query plan efficiency, indexes, and join/filter cost.

## Detailed Results

### Concurrency 10

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |
|---|---:|---:|---:|---:|---:|
| /api/documents?type=wiki | 12 | 19 | 21 | 771.9 | 0 |
| /api/issues | 13 | 19 | 21 | 747.24 | 0 |
| /api/projects | 4 | 8 | 10 | 2257.04 | 0 |
| /api/programs | 2 | 4 | 5 | 3866.8 | 0 |
| /api/dashboard/my-week | 5 | 13 | 15 | 1735.77 | 0 |

### Concurrency 25

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |
|---|---:|---:|---:|---:|---:|
| /api/documents?type=wiki | 30 | 38 | 40 | 802.77 | 0 |
| /api/issues | 32 | 40 | 43 | 760.1 | 0 |
| /api/projects | 9 | 16 | 18 | 2382.7 | 0 |
| /api/programs | 6 | 9 | 11 | 3954.57 | 0 |
| /api/dashboard/my-week | 13 | 23 | 25 | 1752.87 | 0 |

### Concurrency 50

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |
|---|---:|---:|---:|---:|---:|
| /api/documents?type=wiki | 61 | 71 | 75 | 802.64 | 0 |
| /api/issues | 64 | 75 | 80 | 761.64 | 0 |
| /api/projects | 19 | 27 | 31 | 2436.34 | 0 |
| /api/programs | 12 | 17 | 18 | 3888.4 | 0 |
| /api/dashboard/my-week | 27 | 40 | 42 | 1725.34 | 0 |

## Slowest Endpoints

1. `/api/issues` (P95=75ms @ c=50) - Heavy joins + belongs_to association expansion can increase query time as issue volume grows.
2. `/api/documents?type=wiki` (P95=71ms @ c=50) - Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.
3. `/api/issues` (P95=40ms @ c=25) - Heavy joins + belongs_to association expansion can increase query time as issue volume grows.
4. `/api/dashboard/my-week` (P95=40ms @ c=50) - Multiple sequential queries (person, plan/retro, standups, allocations) compound latency versus single-list endpoints.
5. `/api/documents?type=wiki` (P95=38ms @ c=25) - Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.

## Route Timing Breakdown

### /api/documents?type=wiki

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.61 | 0.17 | 6.24 | 15 |
| auth_session | 1.18 | 0.25 | 7.78 | 15 |
| db_main | 1.54 | 1.18 | 5.22 | 15 |
| serialize | 0.7 | 0.7 | 0.74 | 15 |
| total | 4.14 | 2.39 | 18.79 | 15 |

### /api/issues

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.17 | 0.14 | 0.53 | 15 |
| auth_session | 0.2 | 0.2 | 0.22 | 15 |
| db_main | 1.35 | 1.29 | 1.71 | 15 |
| db_related | 1.07 | 1.04 | 1.33 | 15 |
| mapping | 0.01 | 0.01 | 0.02 | 15 |
| serialize | 0.45 | 0.44 | 0.5 | 15 |
| total | 3.37 | 3.25 | 4.17 | 15 |

### /api/projects

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.19 | 0.14 | 0.69 | 15 |
| auth_session | 0.27 | 0.19 | 1.3 | 15 |
| db_main | 1.22 | 1.03 | 2.46 | 15 |
| mapping | 0 | 0 | 0.03 | 15 |
| serialize | 0.06 | 0.06 | 0.07 | 15 |
| total | 1.79 | 1.47 | 3.59 | 15 |

### /api/programs

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.13 | 0.13 | 0.14 | 15 |
| auth_session | 0.17 | 0.17 | 0.21 | 15 |
| db_main | 0.54 | 0.53 | 0.61 | 15 |
| mapping | 0 | 0 | 0.01 | 15 |
| serialize | 0.02 | 0.02 | 0.02 | 15 |
| total | 0.88 | 0.88 | 0.94 | 15 |

### /api/dashboard/my-week

| Phase | Avg (ms) | P50 (ms) | P95 (ms) | Samples |
|---|---:|---:|---:|---:|
| auth_membership | 0.15 | 0.15 | 0.2 | 15 |
| auth_session | 0.22 | 0.22 | 0.28 | 15 |
| db_main | 0.72 | 0.7 | 0.96 | 15 |
| mapping | 0.22 | 0.21 | 0.32 | 15 |
| serialize | 0.01 | 0.01 | 0.02 | 15 |
| total | 1.37 | 1.35 | 1.67 | 15 |
