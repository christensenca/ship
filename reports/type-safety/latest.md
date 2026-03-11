# Type Safety Audit Report

Generated: 2026-03-11T19:42:45.538Z

## Summary

| Metric | Baseline |
|---|---|
| Total violations | 6258 |
| Production-only violations | 4597 |
| Test-only violations | 1661 |
| Total any types | 259 |
| Total type assertions (as) | 690 |
| Total non-null assertions (!) | 248 |
| Total @ts-ignore / @ts-expect-error | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A |
| Top 5 violation-dense files | See section below |

## Trend Status

- Status: **Stable**
- Total violations: 6258
- Delta from previous: -35

## Package Breakdown

| Package | explicit_any | type_assertion_as | non_null_assertion | ts_comment_directive | untyped_parameter | missing_return_type | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| api | 226 | 322 | 219 | 0 | 289 | 1190 | 2246 |
| web | 33 | 366 | 29 | 1 | 929 | 2652 | 4010 |
| shared | 0 | 2 | 0 | 0 | 0 | 0 | 2 |

## Top 5 Violation-Dense Files

1. `web/src/pages/App.tsx` (101) - Dominant violation types: missing_return_type (73), untyped_parameter (28).
2. `web/src/components/IssuesList.tsx` (95) - Dominant violation types: missing_return_type (46), untyped_parameter (45).
3. `web/src/pages/UnifiedDocumentPage.tsx` (92) - Dominant violation types: missing_return_type (39), type_assertion_as (36).
4. `web/src/components/editor/SlashCommands.tsx` (86) - Dominant violation types: missing_return_type (46), untyped_parameter (30).
5. `api/src/routes/weeks.ts` (83) - Dominant violation types: type_assertion_as (26), untyped_parameter (24).
