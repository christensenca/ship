# Type Safety Audit Report

Generated: 2026-03-10T15:34:27.524Z

## Summary

| Metric | Baseline |
|---|---|
| Total any types | 260 |
| Total type assertions (as) | 696 |
| Total non-null assertions (!) | 343 |
| Total @ts-ignore / @ts-expect-error | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A |
| Top 5 violation-dense files | See section below |

## Trend Status

- Status: **Stable**
- Total violations: 7201
- Delta from previous: 35

## Package Breakdown

| Package | explicit_any | type_assertion_as | non_null_assertion | ts_comment_directive | untyped_parameter | missing_return_type | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| api | 227 | 322 | 310 | 0 | 289 | 1246 | 2394 |
| web | 33 | 372 | 33 | 1 | 1163 | 3203 | 4805 |
| shared | 0 | 2 | 0 | 0 | 0 | 0 | 2 |

## Top 5 Violation-Dense Files

1. `web/src/components/IssuesList.tsx` (189) - Dominant violation types: missing_return_type (138), untyped_parameter (47).
2. `web/src/pages/App.tsx` (180) - Dominant violation types: missing_return_type (149), untyped_parameter (30).
3. `api/src/routes/weeks.ts` (159) - Dominant violation types: missing_return_type (50), non_null_assertion (48).
4. `web/src/pages/ReviewsPage.tsx` (150) - Dominant violation types: missing_return_type (83), untyped_parameter (57).
5. `api/src/routes/issues.ts` (122) - Dominant violation types: missing_return_type (44), non_null_assertion (37).
