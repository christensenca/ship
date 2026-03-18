# Tasks: FleetGraph Agent

**Input**: Design documents from `/specs/001-fleetgraph-agent/`
**Prerequisites**: [plan.md](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/plan.md), [spec.md](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/spec.md), [research.md](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/research.md), [data-model.md](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/data-model.md), [contracts/agent-contract.yaml](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/contracts/agent-contract.yaml)

**Tests**: Include API and UI verification where practical because the spec requires concrete verification for every behavior change.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel when dependencies are satisfied
- **[Story]**: Maps the task to a specific user story (`[US1]`, `[US2]`, `[US3]`)
- Every task includes the exact file path it changes

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the FleetGraph dependency surface and shared type entry points.

- [X] T001 Add LangGraph and LangSmith dependencies in `/Users/cadechristensen/Source/ship/api/package.json`
- [X] T002 [P] Define shared FleetGraph request and response types in `/Users/cadechristensen/Source/ship/shared/src/types/fleetgraph.ts`
- [X] T003 [P] Export FleetGraph shared types from `/Users/cadechristensen/Source/ship/shared/src/types/index.ts`
- [X] T004 Export FleetGraph shared types from `/Users/cadechristensen/Source/ship/shared/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the runtime and API foundation that every user story depends on.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [X] T005 Create REST-only Ship API client helpers in `/Users/cadechristensen/Source/ship/api/src/fleet/ship-api-client.ts`
- [X] T006 [P] Define FleetGraph invocation state and approval gate types in `/Users/cadechristensen/Source/ship/api/src/fleet/state.ts`
- [X] T007 [P] Build the base LangGraph workflow with context, fetch, reasoning, action, HITL, and fallback nodes in `/Users/cadechristensen/Source/ship/api/src/fleet/graph.ts`
- [X] T008 [P] Add LangSmith tracing and FleetGraph runtime configuration in `/Users/cadechristensen/Source/ship/api/src/fleet/runtime.ts`
- [X] T009 [P] Register FleetGraph request and response schemas in `/Users/cadechristensen/Source/ship/api/src/openapi/schemas/fleetgraph.ts`
- [X] T010 Create FleetGraph route handlers and request validation shell in `/Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.ts`
- [X] T011 Wire FleetGraph routes into the API app in `/Users/cadechristensen/Source/ship/api/src/app.ts`
- [X] T012 Import FleetGraph schemas into the OpenAPI schema index in `/Users/cadechristensen/Source/ship/api/src/openapi/schemas/index.ts`
- [X] T013 [P] Add reusable FleetGraph test fixtures and API mocks in `/Users/cadechristensen/Source/ship/api/src/test/fleetgraph-fixtures.ts`

**Checkpoint**: Foundation ready. User story phases can proceed independently after this point.

---

## Phase 3: User Story 1 - Surface Sprint Risk Early (Priority: P1) 🎯 MVP

**Goal**: Give PMs and week owners actionable week-risk findings with recommendation confirmation flows.

**Independent Test**: Seed an active week with blocked, stale, and slipping issues, open the week view, and confirm the UI shows prioritized findings plus approval-gated recommendations without mutating data before confirmation.

### Tests for User Story 1

- [X] T014 [P] [US1] Add proactive findings API coverage in `/Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.proactive-findings.test.ts`
- [X] T015 [P] [US1] Add week risk panel UI coverage in `/Users/cadechristensen/Source/ship/web/src/components/fleet/FleetGraphWeekPanel.test.tsx`

### Implementation for User Story 1

- [X] T016 [P] [US1] Implement week-scope context and fetch nodes in `/Users/cadechristensen/Source/ship/api/src/fleet/nodes/week-context.ts`
- [X] T017 [P] [US1] Implement blocker, stale-work, and slip detectors in `/Users/cadechristensen/Source/ship/api/src/fleet/detectors/week-risk.ts`
- [X] T018 [US1] Implement proactive findings orchestration and recommendation shaping in `/Users/cadechristensen/Source/ship/api/src/fleet/services/proactive-findings.ts`
- [X] T019 [US1] Implement `/api/agent/proactive-findings` and recommendation confirmation logic in `/Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.ts`
- [X] T020 [P] [US1] Add week findings and recommendation mutation hooks in `/Users/cadechristensen/Source/ship/web/src/hooks/useFleetGraphWeekQuery.ts`
- [X] T021 [P] [US1] Build the week risk summary panel UI in `/Users/cadechristensen/Source/ship/web/src/components/fleet/FleetGraphWeekPanel.tsx`
- [X] T022 [US1] Integrate the FleetGraph week panel into `/Users/cadechristensen/Source/ship/web/src/pages/UnifiedDocumentPage.tsx`

**Checkpoint**: User Story 1 is independently functional and can be demoed as the MVP.

---

## Phase 4: User Story 2 - Guide Daily Work in Context (Priority: P2)

**Goal**: Let engineers request contextual guidance and standup drafts from issue, week, and person workflows.

**Independent Test**: With one engineer assigned multiple active issues, open an issue or person view, request guidance, and confirm the response ranks work correctly and can generate a human-reviewable standup draft.

### Tests for User Story 2

- [X] T023 [P] [US2] Add contextual guidance and draft API coverage in `/Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.guidance.test.ts`
- [X] T024 [P] [US2] Add assistant panel UI coverage in `/Users/cadechristensen/Source/ship/web/src/components/fleet/FleetGraphAssistantPanel.test.tsx`

### Implementation for User Story 2

- [X] T025 [P] [US2] Implement issue, week, and person guidance context nodes in `/Users/cadechristensen/Source/ship/api/src/fleet/nodes/guidance-context.ts`
- [X] T026 [P] [US2] Implement next-work ranking and standup draft generation in `/Users/cadechristensen/Source/ship/api/src/fleet/services/contextual-guidance.ts`
- [X] T027 [US2] Implement `/api/agent/contextual-guidance` and `/api/agent/drafts` handlers in `/Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.ts`
- [X] T028 [P] [US2] Add contextual guidance and draft-generation hooks in `/Users/cadechristensen/Source/ship/web/src/hooks/useFleetGraphGuidance.ts`
- [X] T029 [P] [US2] Build the assistant panel for contextual guidance and draft actions in `/Users/cadechristensen/Source/ship/web/src/components/fleet/FleetGraphAssistantPanel.tsx`
- [X] T030 [US2] Integrate assistant actions into `/Users/cadechristensen/Source/ship/web/src/pages/UnifiedDocumentPage.tsx`
- [X] T031 [US2] Surface FleetGraph-generated standup draft entry points in `/Users/cadechristensen/Source/ship/web/src/components/StandupFeed.tsx`

**Checkpoint**: User Story 2 works independently without requiring portfolio features.

---

## Phase 5: User Story 3 - Summarize Portfolio Drift (Priority: P3)

**Goal**: Give directors and program leads a cross-program drift summary using the same signal model as the week views.

**Independent Test**: Seed multiple programs with different activity and blocker patterns, request a portfolio summary, and confirm the output ranks on-track, at-risk, and stalled programs correctly in the leadership UI.

### Tests for User Story 3

- [X] T032 [P] [US3] Add portfolio summary API coverage in `/Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.portfolio-summary.test.ts`
- [X] T033 [P] [US3] Add portfolio summary UI coverage in `/Users/cadechristensen/Source/ship/web/src/components/fleet/FleetGraphPortfolioSummary.test.tsx`

### Implementation for User Story 3

- [X] T034 [P] [US3] Implement portfolio scope context and aggregation nodes in `/Users/cadechristensen/Source/ship/api/src/fleet/nodes/portfolio-context.ts`
- [X] T035 [P] [US3] Implement cross-program drift summarization in `/Users/cadechristensen/Source/ship/api/src/fleet/services/portfolio-summary.ts`
- [X] T036 [US3] Implement `/api/agent/portfolio-summary` handling in `/Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.ts`
- [X] T037 [P] [US3] Add portfolio summary query hooks in `/Users/cadechristensen/Source/ship/web/src/hooks/useFleetGraphPortfolioQuery.ts`
- [X] T038 [P] [US3] Build the portfolio summary component in `/Users/cadechristensen/Source/ship/web/src/components/fleet/FleetGraphPortfolioSummary.tsx`
- [X] T039 [US3] Integrate portfolio drift summaries into `/Users/cadechristensen/Source/ship/web/src/pages/Programs.tsx`

**Checkpoint**: All three user stories are now independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish observability, hardening, and verification that affect multiple stories.

- [X] T040 [P] Add FleetGraph observability helpers for logs, metrics, and fallback tracing in `/Users/cadechristensen/Source/ship/api/src/fleet/observability.ts`
- [X] T041 [P] Harden FleetGraph route rate limiting and user-safe error responses in `/Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.ts`
- [X] T042 [P] Document manual verification evidence and scenario coverage in `/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/quickstart.md`
- [X] T043 Run final contract and implementation alignment updates in `/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/contracts/agent-contract.yaml`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** has no dependencies and should start first.
- **Phase 2: Foundational** depends on Phase 1 and blocks all user stories.
- **Phase 3: US1** depends on Phase 2 and is the recommended MVP slice.
- **Phase 4: US2** depends on Phase 2 and can run independently of US1 once the foundation exists.
- **Phase 5: US3** depends on Phase 2 and can run independently of US1 and US2 once the foundation exists.
- **Phase 6: Polish** depends on whichever user stories are in scope for release.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories after Foundational.
- **US2 (P2)**: No dependency on other user stories after Foundational; reuses shared FleetGraph runtime only.
- **US3 (P3)**: No dependency on other user stories after Foundational; reuses shared FleetGraph runtime only.

### Within Each User Story

- Tests should be written before or alongside implementation tasks for the same story.
- Context and detector/modeling tasks come before service orchestration.
- Service orchestration comes before route or UI integration.
- UI hooks come before page integration.

## Parallel Opportunities

- **Setup**: `T002` and `T003` can run in parallel after `T001`.
- **Foundational**: `T006`, `T007`, `T008`, `T009`, and `T013` can run in parallel after `T005`.
- **US1**: `T014` and `T015` can run in parallel; `T016` and `T017` can run in parallel; `T020` and `T021` can run in parallel once `T019` is defined.
- **US2**: `T023` and `T024` can run in parallel; `T025` and `T026` can run in parallel; `T028` and `T029` can run in parallel once `T027` is defined.
- **US3**: `T032` and `T033` can run in parallel; `T034` and `T035` can run in parallel; `T037` and `T038` can run in parallel once `T036` is defined.
- **Polish**: `T040`, `T042`, and `T043` can run in parallel; `T041` should land after route behavior stabilizes.

## Parallel Example: User Story 1

```bash
Task: "T014 [US1] Add proactive findings API coverage in /Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.proactive-findings.test.ts"
Task: "T015 [US1] Add week risk panel UI coverage in /Users/cadechristensen/Source/ship/web/src/components/fleet/FleetGraphWeekPanel.test.tsx"

Task: "T016 [US1] Implement week-scope context and fetch nodes in /Users/cadechristensen/Source/ship/api/src/fleet/nodes/week-context.ts"
Task: "T017 [US1] Implement blocker, stale-work, and slip detectors in /Users/cadechristensen/Source/ship/api/src/fleet/detectors/week-risk.ts"
```

## Parallel Example: User Story 2

```bash
Task: "T023 [US2] Add contextual guidance and draft API coverage in /Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.guidance.test.ts"
Task: "T024 [US2] Add assistant panel UI coverage in /Users/cadechristensen/Source/ship/web/src/components/fleet/FleetGraphAssistantPanel.test.tsx"

Task: "T025 [US2] Implement issue, week, and person guidance context nodes in /Users/cadechristensen/Source/ship/api/src/fleet/nodes/guidance-context.ts"
Task: "T026 [US2] Implement next-work ranking and standup draft generation in /Users/cadechristensen/Source/ship/api/src/fleet/services/contextual-guidance.ts"
```

## Parallel Example: User Story 3

```bash
Task: "T032 [US3] Add portfolio summary API coverage in /Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.portfolio-summary.test.ts"
Task: "T033 [US3] Add portfolio summary UI coverage in /Users/cadechristensen/Source/ship/web/src/components/fleet/FleetGraphPortfolioSummary.test.tsx"

Task: "T034 [US3] Implement portfolio scope context and aggregation nodes in /Users/cadechristensen/Source/ship/api/src/fleet/nodes/portfolio-context.ts"
Task: "T035 [US3] Implement cross-program drift summarization in /Users/cadechristensen/Source/ship/api/src/fleet/services/portfolio-summary.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Deliver Phase 3 for week-risk findings and recommendation confirmation.
3. Validate the independent US1 test before expanding scope.

### Incremental Delivery

1. Ship the shared FleetGraph runtime and route foundation.
2. Deliver US1 as the first user-visible release.
3. Add US2 for contextual guidance and standup drafting.
4. Add US3 for leadership portfolio summaries.
5. Finish with observability, hardening, and final verification.

### Parallel Team Strategy

1. One developer can own foundational API/runtime tasks while another prepares shared types and tests.
2. After Phase 2, separate developers can own US1, US2, and US3 in parallel.
3. Keep shared route and schema changes coordinated to avoid conflicts in `/Users/cadechristensen/Source/ship/api/src/routes/fleetgraph.ts`.

## Notes

- Every task follows the required checklist format.
- MVP scope is **User Story 1** after Setup and Foundational work.
- Stories stay independently testable by sharing only the foundational FleetGraph runtime.
