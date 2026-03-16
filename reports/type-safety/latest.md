# Type Safety Audit Report

Generated: 2026-03-16T01:23:57.453Z

## Summary

| Metric | Baseline |
|---|---|
| Total violations | 5274 |
| Production-only violations | 3839 |
| Test-only violations | 1435 |
| Total any types | 250 |
| Total type assertions (as) | 422 |
| Total non-null assertions (!) | 170 |
| Total @ts-ignore / @ts-expect-error | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A |
| Top 5 violation-dense files | See section below |

## Trend Status

- Status: **Stable**
- Total violations: 5274
- Delta from previous: -8

## Package Breakdown

| Package | explicit_any | type_assertion_as | non_null_assertion | ts_comment_directive | untyped_parameter | missing_return_type | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| api | 225 | 260 | 142 | 0 | 300 | 974 | 1901 |
| web | 25 | 160 | 28 | 1 | 855 | 2302 | 3371 |
| shared | 0 | 2 | 0 | 0 | 0 | 0 | 2 |

## Top 5 Violation-Dense Files

1. `api/src/db/seed.ts` (79) - Dominant violation types: non_null_assertion (35), missing_return_type (24).
2. `api/src/collaboration/index.ts` (72) - Dominant violation types: missing_return_type (35), untyped_parameter (30).
3. `api/src/routes/issues.ts` (71) - Dominant violation types: missing_return_type (30), untyped_parameter (29).
4. `web/src/components/IssuesList.tsx` (68) - Dominant violation types: untyped_parameter (43), missing_return_type (21).
5. `web/src/components/PlanQualityBanner.tsx` (65) - Dominant violation types: missing_return_type (48), untyped_parameter (17).
