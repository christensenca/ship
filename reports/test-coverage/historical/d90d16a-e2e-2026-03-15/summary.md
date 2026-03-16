# Historical E2E Run: `d90d16a`

- Commit: `d90d16aca07eaeff485afe9746492dc2471717d7`
- Run date: `2026-03-15`
- Worktree: `/Users/cadechristensen/Source/ship/.claude/worktrees/e2e-d90d16`
- Log: [playwright.log](/Users/cadechristensen/Source/ship/reports/test-coverage/historical/d90d16a-e2e-2026-03-15/playwright.log)
- Playwright artifacts: [test-results](/Users/cadechristensen/Source/ship/reports/test-coverage/historical/d90d16a-e2e-2026-03-15/test-results)

## Outcome

- `865 passed`
- `7 flaky`
- Runtime: `29.6m`

## Flaky Tests

- `e2e/bulk-selection.spec.ts`: `undo restores deleted issues from trash`
- `e2e/feedback-consolidation.spec.ts`: `source column/badge shows "External" for external issues`
- `e2e/inline-comments.spec.ts`: `canceling a comment removes the highlight`
- `e2e/my-week-stale-data.spec.ts`: `plan edits are visible on /my-week after navigating back`
- `e2e/my-week-stale-data.spec.ts`: `retro edits are visible on /my-week after navigating back`
- `e2e/project-weeks.spec.ts`: `project link in Properties sidebar navigates back to project`
- `e2e/weekly-accountability.spec.ts`: `Allocation grid shows person with assigned issues and plan/retro status`

## Notes

- This run showed repeated WebSocket `429` handshake failures for both `/events` and `/collaboration/*`, confirming that rate-limit pressure predates the current branch.
- `e2e/mentions.spec.ts` emitted `429` websocket errors during execution but did not end in the final flaky list for this historical run.

