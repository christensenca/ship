# Type Safety Audit Report

Generated: 2026-03-11T19:11:53.671Z

## Summary

| Metric | Baseline |
|---|---|
| Total violations | 6462 |
| Production-only violations | 4801 |
| Test-only violations | 1661 |
| Total any types | 260 |
| Total type assertions (as) | 690 |
| Total non-null assertions (!) | 339 |
| Total @ts-ignore / @ts-expect-error | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A |
| Top 5 violation-dense files | See section below |

## Trend Status

- Status: **Improving**
- Total violations: 6462
- Delta from previous: -173

## Package Breakdown

| Package | explicit_any | type_assertion_as | non_null_assertion | ts_comment_directive | untyped_parameter | missing_return_type | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| api | 227 | 322 | 310 | 0 | 289 | 1246 | 2394 |
| web | 33 | 366 | 29 | 1 | 938 | 2699 | 4066 |
| shared | 0 | 2 | 0 | 0 | 0 | 0 | 2 |

## Top 5 Violation-Dense Files

1. `api/src/routes/weeks.ts` (159) - Dominant violation types: missing_return_type (50), non_null_assertion (48).
2. `api/src/routes/issues.ts` (122) - Dominant violation types: missing_return_type (44), non_null_assertion (37).
3. `web/src/components/Editor.tsx` (114) - Dominant violation types: missing_return_type (90), untyped_parameter (19).
4. `web/src/pages/App.tsx` (101) - Dominant violation types: missing_return_type (73), untyped_parameter (28).
5. `web/src/components/IssuesList.tsx` (95) - Dominant violation types: missing_return_type (46), untyped_parameter (45).
