# Type Safety Audit Report

Generated: 2026-03-11T20:13:04.634Z

## Summary

| Metric | Baseline |
|---|---|
| Total violations | 5879 |
| Production-only violations | 4218 |
| Test-only violations | 1661 |
| Total any types | 251 |
| Total type assertions (as) | 690 |
| Total non-null assertions (!) | 247 |
| Total @ts-ignore / @ts-expect-error | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A |
| Top 5 violation-dense files | See section below |

## Trend Status

- Status: **Improving**
- Total violations: 5879
- Delta from previous: -60

## Package Breakdown

| Package | explicit_any | type_assertion_as | non_null_assertion | ts_comment_directive | untyped_parameter | missing_return_type | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| api | 226 | 322 | 219 | 0 | 289 | 1190 | 2246 |
| web | 25 | 366 | 28 | 1 | 874 | 2337 | 3631 |
| shared | 0 | 2 | 0 | 0 | 0 | 0 | 2 |

## Top 5 Violation-Dense Files

1. `api/src/routes/weeks.ts` (83) - Dominant violation types: type_assertion_as (26), untyped_parameter (24).
2. `api/src/db/seed.ts` (79) - Dominant violation types: non_null_assertion (35), missing_return_type (24).
3. `api/src/routes/projects.ts` (74) - Dominant violation types: missing_return_type (22), non_null_assertion (20).
4. `web/src/pages/OrgChartPage.tsx` (74) - Dominant violation types: missing_return_type (51), untyped_parameter (22).
5. `web/src/hooks/useDocumentsQuery.ts` (70) - Dominant violation types: missing_return_type (34), untyped_parameter (26).
