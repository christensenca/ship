# Slow Endpoints Analysis

Generated: 2026-03-14T17:40:33.349Z

1. Endpoint: `/api/issues`
   Observed: P95=75ms, P99=80ms at concurrency 50
   Hypothesis: Heavy joins + belongs_to association expansion can increase query time as issue volume grows.

2. Endpoint: `/api/documents?type=wiki`
   Observed: P95=71ms, P99=75ms at concurrency 50
   Hypothesis: Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.

3. Endpoint: `/api/issues`
   Observed: P95=40ms, P99=43ms at concurrency 25
   Hypothesis: Heavy joins + belongs_to association expansion can increase query time as issue volume grows.

4. Endpoint: `/api/dashboard/my-week`
   Observed: P95=40ms, P99=42ms at concurrency 50
   Hypothesis: Multiple sequential queries (person, plan/retro, standups, allocations) compound latency versus single-list endpoints.

5. Endpoint: `/api/documents?type=wiki`
   Observed: P95=38ms, P99=40ms at concurrency 25
   Hypothesis: Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.
