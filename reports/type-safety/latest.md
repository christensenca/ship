# Type Safety Audit Report

Generated: 2026-03-11T19:17:32.121Z

## Summary

| Metric | Baseline |
|---|---|
| Total violations | 6388 |
| Production-only violations | 4727 |
| Test-only violations | 1661 |
| Total any types | 259 |
| Total type assertions (as) | 690 |
| Total non-null assertions (!) | 333 |
| Total @ts-ignore / @ts-expect-error | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A |
| Top 5 violation-dense files | See section below |

## Trend Status

- Status: **Stable**
- Total violations: 6388
- Delta from previous: -18

## Package Breakdown

| Package | explicit_any | type_assertion_as | non_null_assertion | ts_comment_directive | untyped_parameter | missing_return_type | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| api | 226 | 322 | 304 | 0 | 289 | 1235 | 2376 |
| web | 33 | 366 | 29 | 1 | 929 | 2652 | 4010 |
| shared | 0 | 2 | 0 | 0 | 0 | 0 | 2 |

## Top 5 Violation-Dense Files

1. `api/src/routes/weeks.ts` (159) - Dominant violation types: missing_return_type (50), non_null_assertion (48).
2. `api/src/routes/issues.ts` (122) - Dominant violation types: missing_return_type (44), non_null_assertion (37).
3. `web/src/pages/App.tsx` (101) - Dominant violation types: missing_return_type (73), untyped_parameter (28).
4. `web/src/components/IssuesList.tsx` (95) - Dominant violation types: missing_return_type (46), untyped_parameter (45).
5. `web/src/pages/UnifiedDocumentPage.tsx` (92) - Dominant violation types: missing_return_type (39), type_assertion_as (36).
