# Test Coverage & Quality Report

Generated: 2026-03-15T01:04:31.555Z

## Audit Deliverable


| Metric                            | Baseline                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| Total tests                       | 1516                                                                     |
| Pass / Fail / Flaky               | 1492 / 7 / 1                                                             |
| Suite runtime                     | 1665.5s                                                                  |
| Critical flows with zero coverage | None                                                                     |
| Code coverage %                   | web: 29.89% lines / 23.02% branches / api: 41.6% lines / 35.51% branches |


## Executed Suites


| Suite | Tests | Passed | Failed | Skipped | Runtime      |
| ----- | ----- | ------ | ------ | ------- | ------------ |
| api   | 459   | 459    | 0      | 0       | 14649ms      |
| web   | 159   | 159    | 0      | 0       | 3582ms       |
| e2e   | 898   | 874    | 7      | 17      | 1647270.12ms |


## Failed Tests

- `e2e/bulk-selection.spec.ts`: chromium > bulk-selection.spec.ts > Bulk Actions - Delete (Trash) > undo restores deleted issues from trash
- `e2e/feedback-consolidation.spec.ts`: chromium > feedback-consolidation.spec.ts > Issues List: Source Display > source column/badge shows "External" for external issues
- `e2e/inline-comments.spec.ts`: chromium > inline-comments.spec.ts > Inline Comments > canceling a comment removes the highlight
- `e2e/mentions.spec.ts`: chromium > mentions.spec.ts > Mentions > should sync mentions between collaborators
- `e2e/my-week-stale-data.spec.ts`: chromium > my-week-stale-data.spec.ts > My Week - stale data after editing plan/retro > retro edits are visible on /my-week after navigating back
- `e2e/project-weeks.spec.ts`: chromium > project-weeks.spec.ts > Project Weeks Tab > project link in Properties sidebar navigates back to project
- `e2e/weekly-accountability.spec.ts`: chromium > weekly-accountability.spec.ts > Project Allocation Grid API > Allocation grid shows person with assigned issues and plan/retro status

## Flaky Tests

- `e2e/performance.spec.ts`: chromium > performance.spec.ts > Performance - Many Images > many images do not crash the editor (1/3)

## Code Coverage


| Package | Lines  | Branches | Functions | Statements |
| ------- | ------ | -------- | --------- | ---------- |
| api     | 41.6%  | 35.51%   | 44.49%    | 41.48%     |
| web     | 29.89% | 23.02%   | 26.58%    | 28.79%     |


## Critical Flow Coverage


| Flow                   | Depth    | Evidence Count | Risk if Untested                                               |
| ---------------------- | -------- | -------------- | -------------------------------------------------------------- |
| Auth                   | unit+e2e | 6              | Users cannot sign in, sign out, or maintain secure sessions    |
| Document CRUD          | unit+e2e | 6              | Core document creation and editing workflows break             |
| Real-time sync         | unit+e2e | 5              | Concurrent edits lose data or diverge between users            |
| Sprint management      | unit+e2e | 9              | Week planning, reviews, and sprint assignment workflows break  |
| Programs               | unit+e2e | 3              | Program CRUD and week views break                              |
| Team allocation        | unit+e2e | 6              | Assignments, reviews, or staffing views drift from actual data |
| Invites and onboarding | unit+e2e | 4              | Workspace invite and acceptance flows break for new users      |
| Feedback intake        | e2e only | 1              | Public feedback submissions fail or triage state is wrong      |
| Dashboard / my-week    | unit+e2e | 4              | Users see stale or incomplete planning status                  |
| Comments               | e2e only | 1              | Inline discussion and comment permissions regress silently     |


### Critical Flows Missing Unit Coverage

- **Feedback intake**: e2e/feedback-consolidation.spec.ts
- **Comments**: e2e/inline-comments.spec.ts

## Test Quality Notes

- `web/src/components/sidebars/QualityAssistant.test.tsx`: Only 2 smoke-level assertion(s) detected
- `e2e/check-aria.spec.ts`: Only 1 smoke-level assertion(s) detected

## Coverage Gaps

- Routes without any detected test evidence: 5
- Routes without a direct same-name test file: 12
- Components without a direct same-name test file: 20
- Hooks without a direct same-name test file: 24

### Routes Without Any Detected Test Evidence

- `api/src/routes/activity.ts`
- `api/src/routes/admin-credentials.ts`
- `api/src/routes/api-tokens.ts`
- `api/src/routes/backlinks.ts`
- `api/src/routes/iterations.ts`

### Routes Without Direct Same-Name Test Files

- `api/src/routes/admin-credentials.ts`
- `api/src/routes/admin.ts`
- `api/src/routes/ai.ts`
- `api/src/routes/associations.ts`
- `api/src/routes/caia-auth.ts`
- `api/src/routes/claude.ts`
- `api/src/routes/comments.ts`
- `api/src/routes/feedback.ts`
- `api/src/routes/invites.ts`
- `api/src/routes/setup.ts`
- `api/src/routes/team.ts`
- `api/src/routes/weekly-plans.ts`

## Inventory

- API unit test files: 30
- Web unit test files: 19
- E2E spec files: 73

## Trend

- Status: **Improving**
- Test delta: +42
- Failure delta: -10

