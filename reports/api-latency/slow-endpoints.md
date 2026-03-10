# Slow Endpoints Analysis

Generated: 2026-03-10T17:00:13.771Z

1. Endpoint: `/api/documents?type=wiki`
   Observed: P95=102ms, P99=106ms at concurrency 50
   Hypothesis: Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.

2. Endpoint: `/api/issues`
   Observed: P95=88ms, P99=98ms at concurrency 50
   Hypothesis: Heavy joins + belongs_to association expansion can increase query time as issue volume grows.

3. Endpoint: `/api/documents?type=wiki`
   Observed: P95=53ms, P99=55ms at concurrency 25
   Hypothesis: Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.

4. Endpoint: `/api/issues`
   Observed: P95=48ms, P99=56ms at concurrency 25
   Hypothesis: Heavy joins + belongs_to association expansion can increase query time as issue volume grows.

5. Endpoint: `/api/projects`
   Observed: P95=42ms, P99=48ms at concurrency 50
   Hypothesis: Derived status and nested count subqueries add per-row computation under larger project/sprint datasets.
