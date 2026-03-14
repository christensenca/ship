# DB Query Efficiency Comparison

Baseline: 2026-03-12T-baseline-preopt (2026-03-12T15:25:30.786Z)
Current: current (2026-03-14T19:50:37.594Z)
Target: 50% improvement on the slowest affected query
Status: Not met

## Flow Summary

![User flow DB time chart](../charts/2026-03-12t-baseline-preopt-current--flow-db-time.svg)

| Flow | Baseline Queries | Current Queries | Query Delta (%) | Baseline DB Time (ms) | Current DB Time (ms) | DB Time Delta (%) | Baseline Slowest (ms) | Current Slowest (ms) | Slowest Delta (%) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Load main page | 9 | 6 | -33.3% | 39.21 | 24.06 | -38.6% | 9.18 | 10.58 | +15.3% |
| View a document | 24 | 24 | 0% | 26.47 | 19.47 | -26.4% | 4.32 | 3.78 | -12.5% |
| List issues | 4 | 4 | 0% | 18.68 | 3.52 | -81.2% | 15.93 | 1.75 | -89% |
| Load sprint board | 17 | 17 | 0% | 9.11 | 7.77 | -14.7% | 1.69 | 1.63 | -3.6% |
| Search content | 5 | 5 | 0% | 1.87 | 1.78 | -4.8% | 0.57 | 0.63 | +10.5% |

## Request Summary

![Request DB time chart](../charts/2026-03-12t-baseline-preopt-current--request-db-time.svg)

| Flow | Request | Path | Baseline DB Time (ms) | Current DB Time (ms) | DB Time Delta (%) | Baseline Slowest (ms) | Current Slowest (ms) | Slowest Delta (%) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Load main page | dashboard data | /api/dashboard/my-week | 39.21 | 24.06 | -38.6% | 9.18 | 10.58 | +15.3% |
| View a document | document | /api/documents/db4c952d-0abb-4271-912c-6c67ec62b6ed | 4.7 | 3.91 | -16.8% | 1.79 | 1.61 | -10.1% |
| View a document | document context | /api/documents/db4c952d-0abb-4271-912c-6c67ec62b6ed/context | 6.98 | 5.66 | -18.9% | 1.92 | 1.37 | -28.6% |
| View a document | document comments | /api/documents/db4c952d-0abb-4271-912c-6c67ec62b6ed/comments | 2.81 | 1.24 | -55.9% | 1.8 | 0.57 | -68.3% |
| View a document | team members | /api/team/people | 2.95 | 1.41 | -52.2% | 1.42 | 0.59 | -58.5% |
| View a document | programs | /api/programs | 3.83 | 2.47 | -35.5% | 2.79 | 1.91 | -31.5% |
| View a document | projects | /api/projects | 5.2 | 4.78 | -8.1% | 4.32 | 3.78 | -12.5% |
| List issues | issues | /api/issues | 18.68 | 3.52 | -81.2% | 15.93 | 1.75 | -89% |
| Load sprint board | team grid | /api/team/grid | 3.99 | 2.94 | -26.3% | 1.04 | 0.99 | -4.8% |
| Load sprint board | team projects | /api/team/projects | 1.52 | 1.26 | -17.1% | 0.53 | 0.52 | -1.9% |
| Load sprint board | team assignments | /api/team/assignments | 3.6 | 3.57 | -0.8% | 1.69 | 1.63 | -3.6% |
| Search content | mentions | /api/search/mentions?q=Standup | 1.87 | 1.78 | -4.8% | 0.57 | 0.63 | +10.5% |

## Before / After EXPLAIN ANALYZE

### programs

What was inefficient: correlated subplans were executed per outer row in the baseline query for this endpoint.
Why the rewrite helps: the current query precomputes counts/status once and joins the aggregated results back by id, so the planner can execute the work set-wise instead of row-by-row.

Baseline slow query: `SELECT d.id, d.title, d.properties, d.archived_at, d.created_at, d.updated_at, COALESCE((d.properties->>'owner_id')::uuid, d.created_by) as owner_id, u.name as owner_name, u.ema...`
Observed: 2.79ms, EXPLAIN total: 0.71ms

Current slow query: `WITH program_issue_counts AS ( SELECT da.related_id AS program_id, COUNT(*)::int AS issue_count FROM document_associations da JOIN documents i ON i.id = da.document_id WHERE da....`
Observed: 1.91ms, EXPLAIN total: 0.46ms

Baseline plan:
```
Sort (0.5ms, 8 rows)
  Hash Join (0.49ms, 8 rows)
    Seq Scan (0ms, 24 rows)
    Hash (0.04ms, 8 rows)
      Index Scan (0.04ms, 8 rows)
    Aggregate (0.03ms, 1 rows)
      Nested Loop (0.03ms, 20 rows)
        Bitmap Heap Scan (0.01ms, 26 rows)
          Bitmap Index Scan (0ms, 26 rows)
        Memoize (0ms, 1 rows)
          Index Scan (0ms, 1 rows)
    Aggregate (0.03ms, 1 rows)
      Nested Loop (0.02ms, 3 rows)
        Bitmap Heap Scan (0.01ms, 26 rows)
          Bitmap Index Scan (0ms, 26 rows)
        Memoize (0ms, 0 rows)
          Index Scan (0ms, 0 rows)
```

Current plan:
```
Sort (0.23ms, 8 rows)
  Hash Join (0.23ms, 8 rows)
    Hash Join (0.15ms, 8 rows)
      Hash Join (0.02ms, 8 rows)
        Bitmap Heap Scan (0ms, 8 rows)
          Bitmap Index Scan (0ms, 13 rows)
        Hash (0.01ms, 35 rows)
          Seq Scan (0ms, 35 rows)
      Hash (0.13ms, 13 rows)
        Subquery Scan (0.13ms, 13 rows)
          Aggregate (0.13ms, 13 rows)
            Hash Join (0.11ms, 264 rows)
              Seq Scan (0.04ms, 362 rows)
              Hash (0.04ms, 264 rows)
                Bitmap Heap Scan (0.03ms, 264 rows)
                  Bitmap Index Scan (0ms, 264 rows)
    Hash (0.08ms, 13 rows)
      Subquery Scan (0.07ms, 13 rows)
        Aggregate (0.07ms, 13 rows)
          Sort (0.07ms, 59 rows)
            Hash Join (0.06ms, 59 rows)
              Seq Scan (0.03ms, 362 rows)
              Hash (0.01ms, 59 rows)
                Bitmap Heap Scan (0.01ms, 59 rows)
                  Bitmap Index Scan (0ms, 59 rows)
```

### projects

What was inefficient: correlated subplans were executed per outer row in the baseline query for this endpoint.
Why the rewrite helps: the current query precomputes counts/status once and joins the aggregated results back by id, so the planner can execute the work set-wise instead of row-by-row.

Baseline slow query: `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id, d.archived_at, d.created_at, d.updated_at, d.converted_from_id, (d.properties->>'owner_id')::uuid as owner_...`
Observed: 4.32ms, EXPLAIN total: 1.27ms

Current slow query: `WITH project_sprint_counts AS ( SELECT da.related_id AS project_id, COUNT(*)::int AS sprint_count FROM document_associations da JOIN documents s ON s.id = da.document_id WHERE d...`
Observed: 3.78ms, EXPLAIN total: 1.42ms

Baseline plan:
```
Sort (0.94ms, 24 rows)
  Hash Join (0.93ms, 24 rows)
    Nested Loop (0.1ms, 24 rows)
      Index Scan (0.05ms, 24 rows)
      Index Scan (0ms, 1 rows)
    Hash (0.02ms, 24 rows)
      Seq Scan (0ms, 24 rows)
    Aggregate (0.01ms, 1 rows)
      Nested Loop (0.01ms, 1 rows)
        Bitmap Heap Scan (0ms, 8 rows)
          Bitmap Index Scan (0ms, 8 rows)
        Memoize (0ms, 0 rows)
          Index Scan (0ms, 0 rows)
    Aggregate (0.01ms, 1 rows)
      Nested Loop (0.01ms, 7 rows)
        Bitmap Heap Scan (0ms, 8 rows)
          Bitmap Index Scan (0ms, 8 rows)
        Memoize (0ms, 1 rows)
          Index Scan (0ms, 1 rows)
    Aggregate (0.01ms, 1 rows)
      Nested Loop (0.01ms, 1 rows)
        Bitmap Heap Scan (0.01ms, 1 rows)
          Bitmap Index Scan (0ms, 24 rows)
        Seq Scan (0ms, 1 rows)
```

Current plan:
```
Sort (0.69ms, 24 rows)
  Hash Join (0.68ms, 24 rows)
    Hash Join (0.54ms, 24 rows)
      Hash Join (0.32ms, 24 rows)
        Hash Join (0.14ms, 24 rows)
          Hash Join (0.11ms, 24 rows)
            Seq Scan (0.05ms, 362 rows)
            Hash (0.02ms, 24 rows)
              Bitmap Heap Scan (0.02ms, 24 rows)
                Bitmap Index Scan (0.01ms, 39 rows)
          Hash (0.01ms, 35 rows)
            Seq Scan (0.01ms, 35 rows)
        Hash (0.17ms, 39 rows)
          Subquery Scan (0.16ms, 39 rows)
            Aggregate (0.16ms, 39 rows)
              Sort (0.14ms, 59 rows)
                Hash Join (0.1ms, 59 rows)
                  Bitmap Heap Scan (0.04ms, 323 rows)
                    Bitmap Index Scan (0.01ms, 323 rows)
                  Hash (0.03ms, 59 rows)
                    Bitmap Heap Scan (0.02ms, 59 rows)
                      Bitmap Index Scan (0.01ms, 59 rows)
      Hash (0.22ms, 39 rows)
        Subquery Scan (0.21ms, 39 rows)
          Aggregate (0.21ms, 39 rows)
            Hash Join (0.17ms, 264 rows)
              Bitmap Heap Scan (0.04ms, 323 rows)
                Bitmap Index Scan (0.01ms, 323 rows)
              Hash (0.07ms, 264 rows)
                Bitmap Heap Scan (0.04ms, 264 rows)
                  Bitmap Index Scan (0.01ms, 264 rows)
    Hash (0.12ms, 24 rows)
      Subquery Scan (0.11ms, 24 rows)
        Aggregate (0.11ms, 24 rows)
          Sort (0.1ms, 24 rows)
            Nested Loop (0.07ms, 24 rows)
              Seq Scan (0ms, 1 rows)
              Bitmap Heap Scan (0.06ms, 24 rows)
                BitmapAnd (0.04ms, 0 rows)
                  Bitmap Index Scan (0.01ms, 59 rows)
                  Bitmap Index Scan (0.02ms, 120 rows)
```

