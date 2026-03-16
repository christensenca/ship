# Type Safety Audit Report

Generated: 2026-03-14T15:39:11.786Z

## Summary


| Metric                                | Baseline          |
| ------------------------------------- | ----------------- |
| Total violations                      | 5603              |
| Production-only violations            | 3900              |
| Test-only violations                  | 1703              |
| Total any types                       | 250               |
| Total type assertions (as)            | 418               |
| Total non-null assertions (!)         | 170               |
| Total @ts-ignore / @ts-expect-error   | 1                 |
| Strict mode enabled?                  | Yes               |
| Strict mode error count (if disabled) | N/A               |
| Top 5 violation-dense files           | See section below |


## Trend Status

- Status: **Improving**
- Total violations: 5603
- Delta from previous intermediate run: -139

## Package Breakdown


| Package | explicit_any | type_assertion_as | non_null_assertion | ts_comment_directive | untyped_parameter | missing_return_type | total |
| ------- | ------------ | ----------------- | ------------------ | -------------------- | ----------------- | ------------------- | ----- |
| api     | 225          | 258               | 142                | 0                    | 296               | 1229                | 2150  |
| web     | 25           | 158               | 28                 | 1                    | 872               | 2367                | 3451  |
| shared  | 0            | 2                 | 0                  | 0                    | 0                 | 0                   | 2     |


## Top 5 Violation-Dense Files

1. `api/src/db/seed.ts` (79) - Dominant violation types: non_null_assertion (35), missing_return_type (24).
2. `web/src/pages/OrgChartPage.tsx` (74) - Dominant violation types: missing_return_type (51), untyped_parameter (22).
3. `api/src/collaboration/index.ts` (72) - Dominant violation types: missing_return_type (35), untyped_parameter (30).
4. `api/src/routes/issues.ts` (70) - Dominant violation types: missing_return_type (30), untyped_parameter (29).
5. `web/src/components/IssuesList.tsx` (68) - Dominant violation types: untyped_parameter (43), missing_return_type (21).

