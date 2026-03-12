# Slow Endpoints Analysis

Generated: 2026-03-12T00:58:45.215Z

1. Endpoint: `/api/issues`
   Observed: P95=102ms, P99=106ms at concurrency 50
   Hypothesis: Heavy joins + belongs_to association expansion can increase query time as issue volume grows.

2. Endpoint: `/api/documents?type=wiki`
   Observed: P95=89ms, P99=93ms at concurrency 50
   Hypothesis: Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.

3. Endpoint: `/api/dashboard/my-week`
   Observed: P95=58ms, P99=62ms at concurrency 50
   Hypothesis: Multiple sequential queries (person, plan/retro, standups, allocations) compound latency versus single-list endpoints.

4. Endpoint: `/api/issues`
   Observed: P95=52ms, P99=55ms at concurrency 25
   Hypothesis: Heavy joins + belongs_to association expansion can increase query time as issue volume grows.

5. Endpoint: `/api/documents?type=wiki`
   Observed: P95=47ms, P99=50ms at concurrency 25
   Hypothesis: Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.
