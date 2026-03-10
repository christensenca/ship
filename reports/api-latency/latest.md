# API Latency Audit Report

Generated: 2026-03-10T17:00:13.771Z
API URL: http://localhost:3000
Warmup: 15s @ c=10
Measured: 30s @ c=10,25,50

## Audit Deliverable Table (P95/P99 focus at c=25)

| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| /api/documents?type=wiki | 43 | 53 | 55 |
| /api/issues | 37 | 48 | 56 |
| /api/projects | 15 | 23 | 27 |
| /api/programs | 10 | 14 | 16 |
| /api/dashboard/my-week | 14 | 23 | 26 |

## Trend

- Overall status: **Regressing**
- Average P95 delta (ms): 34.8

## Detailed Results

### Concurrency 10

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |
|---|---:|---:|---:|---:|---:|
| /api/documents?type=wiki | 17 | 26 | 29 | 547.17 | 0 |
| /api/issues | 15 | 23 | 31 | 634.34 | 0 |
| /api/projects | 5 | 10 | 14 | 1572.4 | 0 |
| /api/programs | 4 | 6 | 8 | 2317.34 | 0 |
| /api/dashboard/my-week | 6 | 13 | 15 | 1539.1 | 0 |

### Concurrency 25

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |
|---|---:|---:|---:|---:|---:|
| /api/documents?type=wiki | 43 | 53 | 55 | 567 | 0 |
| /api/issues | 37 | 48 | 56 | 657.57 | 0 |
| /api/projects | 15 | 23 | 27 | 1527.67 | 0 |
| /api/programs | 10 | 14 | 16 | 2284.14 | 0 |
| /api/dashboard/my-week | 14 | 23 | 26 | 1604.27 | 0 |

### Concurrency 50

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |
|---|---:|---:|---:|---:|---:|
| /api/documents?type=wiki | 87 | 102 | 106 | 564.17 | 0 |
| /api/issues | 73 | 88 | 98 | 667.6 | 0 |
| /api/projects | 31 | 42 | 48 | 1535.6 | 0 |
| /api/programs | 21 | 25 | 27 | 2307.74 | 0 |
| /api/dashboard/my-week | 29 | 41 | 44 | 1591.84 | 0 |

## Slowest Endpoints

1. `/api/documents?type=wiki` (P95=102ms @ c=50) - Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.
2. `/api/issues` (P95=88ms @ c=50) - Heavy joins + belongs_to association expansion can increase query time as issue volume grows.
3. `/api/documents?type=wiki` (P95=53ms @ c=25) - Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.
4. `/api/issues` (P95=48ms @ c=25) - Heavy joins + belongs_to association expansion can increase query time as issue volume grows.
5. `/api/projects` (P95=42ms @ c=50) - Derived status and nested count subqueries add per-row computation under larger project/sprint datasets.
