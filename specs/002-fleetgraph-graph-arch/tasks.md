# Tasks: FleetGraph Agent Graph Architecture

**Input**: Design documents from `/specs/002-fleetgraph-graph-arch/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api-contracts.md

**Tests**: Not explicitly requested in the feature specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migrations, shared types, and LLM runtime initialization

- [X] T001 [P] Create agent_runs migration in `api/src/db/migrations/039_agent_runs.sql` with fields: id, workspace_id, trigger_type, scope_type, scope_id, status, findings_count, actions_proposed, degradation_tier, error_message, started_at, completed_at; indexes on (workspace_id, started_at DESC) and (workspace_id, trigger_type, started_at DESC)
- [X] T002 [P] Create agent_actions migration in `api/src/db/migrations/040_agent_actions.sql` with fields: id, run_id, workspace_id, action_type, target_document_id, description, proposed_change (JSONB), finding_id, status, decision_by, decided_at, snooze_until, created_at; indexes on (workspace_id, status, created_at) and unique partial index on (workspace_id, target_document_id, action_type) WHERE status = 'pending'
- [X] T003 [P] Create agent_notifications migration in `api/src/db/migrations/041_agent_notifications.sql` with fields: id, workspace_id, finding_category, finding_key, notified_at; unique index on (workspace_id, finding_key)
- [X] T004 [P] Add shared FleetGraph types to `shared/src/types/fleetgraph.ts`: ChatMessage, ChatRequest, ChatResponse, ActionDecision, ActionDecideRequest, ActionDecideResponse, ActionListResponse, ActionShape, CheckBlockersRequest, CheckBlockersResponse, ExpireActionsRequest, ExpireActionsResponse, DegradationTier
- [X] T005 Add LLM client initialization to `api/src/fleet/runtime.ts`: import ChatOpenAI from @langchain/openai, configure with OPENAI_API_KEY and FLEETGRAPH_LLM_MODEL (default gpt-4o-mini), export getLLMClient()
- [X] T006 Install @langchain/openai dependency in api package via `pnpm add @langchain/openai --filter api`

**Checkpoint**: Migrations ready, shared types defined, LLM client available

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core graph nodes and LLM synthesis module that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 Create unified context node in `api/src/fleet/nodes/context-node.ts`: extract trigger type (scheduled/event/on_demand), view metadata, actor, workspace, time window from invocation; set contextSummary string; no LLM
- [X] T008 Create parallel fetch node in `api/src/fleet/nodes/fetch-node.ts`: use Promise.all to fetch issues, week, people, iterations via ship-api-client.ts; per-fetch try/catch that appends errors to state.errors; writes fetched resources to state.fetchedResources
- [X] T009 Create LLM prompt templates in `api/src/fleet/llm/prompts.ts`: system prompt (agent role, constraints, output format), user prompt template for proactive synthesis, user prompt template for chat with message history
- [X] T010 Create LLM synthesis module in `api/src/fleet/llm/synthesis.ts`: accept detector findings + fetched resources + optional chat messages; construct prompt via prompts.ts; call ChatOpenAI with structured output parsing; return synthesized findings, recommendations, and narrative summary
- [X] T011 Create reasoning node in `api/src/fleet/nodes/reasoning-node.ts`: run deterministic detectors (week-risk.ts) on fetched resources; pass detector output + resources to synthesis.ts for single LLM call; write detectedFindings, recommendedActions, contextSummary to state
- [X] T012 Create action node in `api/src/fleet/nodes/action-node.ts`: route based on findings — no findings → END (clean path); findings without mutations → notify path; findings with mutation recommendations → persist-action path
- [X] T013 Create fallback node in `api/src/fleet/nodes/fallback-node.ts`: mode-aware error handling — on_demand trigger returns partial results with caveats in state.fallback; scheduled/event trigger logs to agent_runs as failed, no notifications
- [X] T014 Update graph state annotation in `api/src/fleet/state.ts`: add chatMessages (ChatMessage[]), llmResponse fields, degradationTier (DegradationTier), detectedFindings, recommendedActions, fetchedResources, errors array
- [X] T015 Update graph builder in `api/src/fleet/graph.ts`: rewire to use new nodes (context-node → fetch-node → reasoning-node → action-node); add conditional edges from action-node for clean/notify/mutation paths; add error edges to fallback-node from context, fetch, reasoning nodes
- [X] T016 Add ship-api-client methods in `api/src/fleet/ship-api-client.ts`: listIterations(issueId), executeAction(actionId, mutation) for PATCH /api/issues/:id with automated_by attribution

**Checkpoint**: Foundation ready — full graph pipeline wirable, user story implementation can begin

---

## Phase 3: User Story 1 — Proactive Sprint Health Detection (Priority: P1)

**Goal**: Scheduled midweek scan detects sprint drift and surfaces findings to week owners

**Independent Test**: Seed workspace with active sprint containing stale issues and blockers, trigger POST /api/agent/proactive-findings, verify structured health report with correct findings and notification path routing

### Implementation for User Story 1

- [X] T017 [US1] Wire proactive-findings service through full graph pipeline in `api/src/fleet/services/proactive-findings.ts`: replace direct detector calls with graph.invoke() using trigger_type='scheduled', persist run to agent_runs table, return graph output
- [X] T018 [US1] Implement notification dedup logic in `api/src/fleet/services/proactive-findings.ts`: before surfacing findings, check agent_notifications for matching finding_key within 24h window; upsert on new notification; increment skipped count for suppressed findings
- [X] T019 [US1] Update OpenAPI schemas in `api/src/openapi/schemas/fleetgraph.ts`: add/update proactive-findings response schema to include degradationTier field; ensure schema matches updated response shape
- [X] T020 [US1] Update proactive-findings route handler in `api/src/routes/fleetgraph.ts`: wire to updated service, persist agent_run record with findings_count and actions_proposed, return generatedAt timestamp

**Checkpoint**: Proactive sprint health scan works end-to-end — MVP deliverable

---

## Phase 4: User Story 2 — On-Demand Chat Analysis (Priority: P1)

**Goal**: Users can ask FleetGraph questions via chat interface and get contextual, conversational responses

**Independent Test**: Simulate chat message from user viewing sprint page, verify agent fetches right data and returns contextually relevant markdown response

### Implementation for User Story 2

- [X] T021 [US2] Create chat service in `api/src/fleet/services/chat-service.ts`: accept ChatRequest (workspaceId, viewType, documentId, messages[]); invoke graph with trigger_type='on_demand' and chatMessages in state; return ChatResponse with message, findings, proposedActions, degradationTier, refetchedScope
- [X] T022 [US2] Add POST /api/agent/chat route in `api/src/routes/fleetgraph.ts`: Zod validation for ChatRequest (max 10 messages), rate limit 20 req/min, wire to chat-service, return ChatResponse
- [X] T023 [US2] Add chat OpenAPI schemas in `api/src/openapi/schemas/fleetgraph.ts`: ChatRequest schema (workspaceId, viewType, documentId, messages array with role+content), ChatResponse schema (message, findings, proposedActions, degradationTier, refetchedScope)
- [X] T024 [US2] Update contextual-guidance service in `api/src/fleet/services/contextual-guidance.ts`: wire through full graph pipeline with LLM synthesis instead of pure deterministic logic; keep response shape unchanged
- [X] T025 [US2] Add chat input UI to `web/src/components/fleet/FleetGraphAssistantPanel.tsx`: text input field, send button, message history display (user + assistant messages), loading state, markdown rendering for assistant responses
- [X] T026 [US2] Create useFleetGraphChat hook in `web/src/hooks/useFleetGraphGuidance.ts`: TanStack Query mutation for POST /api/agent/chat, manage local message history (max 10), handle loading/error states

**Checkpoint**: Chat works end-to-end — users can ask questions and get contextual responses

---

## Phase 5: User Story 3 — Event-Driven Blocker Escalation (Priority: P2)

**Goal**: Periodic blocker checks detect unresolved blockers and escalate to relevant people

**Independent Test**: Seed issues with failed iterations >24h old, trigger POST /api/agent/check-blockers, verify escalation findings generated and dedup prevents duplicates

### Implementation for User Story 3

- [X] T027 [US3] Add POST /api/agent/check-blockers route in `api/src/routes/fleetgraph.ts`: accept workspaceId, invoke graph with trigger_type='event' and scope_type='workspace'; query recent iterations via ship-api-client, run blocker detection, dedup via agent_notifications, return findings + escalated/skipped counts
- [X] T028 [US3] Add check-blockers service logic in `api/src/fleet/services/proactive-findings.ts` or new dedicated function: fetch all active weeks, for each week fetch issues + iterations, filter for issues with failed iterations >24h without subsequent pass, run through graph pipeline for blocker-specific findings
- [X] T029 [US3] Add check-blockers OpenAPI schema in `api/src/openapi/schemas/fleetgraph.ts`: CheckBlockersRequest (workspaceId), CheckBlockersResponse (findings[], escalated count, skipped count)

**Checkpoint**: Blocker escalation works — external cron can call check-blockers endpoint

---

## Phase 6: User Story 4 — Human-Gated Mutation Actions (Priority: P2)

**Goal**: Agent proposes mutations (move issue, reassign, change priority/state), users approve/dismiss/snooze inline

**Independent Test**: Trigger scan that produces mutation recommendations, verify actions appear in pending state, test approve (mutation applied with audit trail), dismiss (never re-proposed), snooze (reappears after expiry)

### Implementation for User Story 4

- [X] T030 [US4] Create action service in `api/src/fleet/services/action-service.ts`: CRUD for agent_actions — createPendingAction(runId, workspaceId, actionType, targetDocumentId, proposedChange, findingId), listPendingActions(workspaceId, status), decideAction(actionId, decision, snoozeHours?, comment?), executeApprovedAction(actionId) via ship-api-client PATCH with automated_by attribution
- [X] T031 [US4] Add POST /api/agent/actions/:id/decide route in `api/src/routes/fleetgraph.ts`: Zod validation for ActionDecideRequest (decision, snoozeHours?, comment?), wire to action-service.decideAction, on approve execute mutation and return executionResult
- [X] T032 [US4] Add GET /api/agent/actions route in `api/src/routes/fleetgraph.ts`: query params workspaceId (required) + status (optional, default 'pending'), wire to action-service.listPendingActions, return ActionListResponse
- [X] T033 [US4] Add POST /api/agent/expire-actions route in `api/src/routes/fleetgraph.ts`: accept workspaceId, expire all pending actions older than 48h, return expired count
- [X] T034 [US4] Add action management OpenAPI schemas in `api/src/openapi/schemas/fleetgraph.ts`: ActionDecideRequest, ActionDecideResponse, ActionListResponse, ExpireActionsRequest, ExpireActionsResponse schemas
- [X] T035 [US4] Create ActionCard component in `web/src/components/fleet/ActionCard.tsx`: display proposed change (field, old_value, new_value), target document title, description; Approve/Dismiss/Snooze buttons; snooze hours picker; loading state during execution
- [X] T036 [US4] Create useFleetGraphActions hook in `web/src/hooks/useFleetGraphActions.ts`: TanStack Query for GET /api/agent/actions (pending), mutations for POST /api/agent/actions/:id/decide (approve/dismiss/snooze), invalidate actions query on mutation success
- [X] T037 [US4] Add inline action cards to `web/src/components/fleet/FleetGraphWeekPanel.tsx`: render ActionCard components for pending actions related to the current week's issues
- [X] T038 [US4] Add action cards to `web/src/components/fleet/FleetGraphAssistantPanel.tsx`: when chat response includes proposedActions, render ActionCard components inline in the conversation

**Checkpoint**: Full HITL loop works — propose, approve/dismiss/snooze, execute with audit trail

---

## Phase 7: User Story 5 — Graceful Degradation Under Failure (Priority: P2)

**Goal**: Graph never crashes; chat returns partial results with caveats; proactive mode silently logs failures

**Independent Test**: Simulate failures at each node (fetch timeout, LLM error, DB write failure), verify graph routes to fallback with mode-appropriate behavior

### Implementation for User Story 5

- [X] T039 [US5] Add degradation tier tracking to graph state in `api/src/fleet/state.ts`: degradationTier starts as 'full', downgrades to 'partial' on non-critical errors, 'offline' on critical failures; track via FallbackEvent[] in state
- [X] T040 [US5] Implement per-node error boundaries in `api/src/fleet/nodes/fetch-node.ts`: individual try/catch per fetch call, append to state.errors, continue with partial data; set degradationTier to 'partial' if any fetch fails
- [X] T041 [US5] Implement LLM fallback in `api/src/fleet/nodes/reasoning-node.ts`: if LLM call fails, fall back to detector-only output with degradationTier='partial'; if detectors also fail, route to fallback node with degradationTier='offline'
- [X] T042 [US5] Wire fallback node responses in `api/src/fleet/nodes/fallback-node.ts`: for on_demand (chat) — construct partial response message listing what data was unavailable; for scheduled/event — log failure to agent_runs with error_message, suppress all notifications
- [X] T043 [US5] Persist degradation tier in agent_runs in `api/src/fleet/services/proactive-findings.ts` and `api/src/fleet/services/chat-service.ts`: record degradation_tier on run completion for observability

**Checkpoint**: Agent handles all failure modes gracefully — no crashes, no confusing partial alerts

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span multiple user stories

- [X] T044 [P] Remove legacy placeholder route `recommendations/:id/confirm` from `api/src/routes/fleetgraph.ts` (replaced by actions/:id/decide)
- [X] T045 [P] Remove legacy node files that are superseded by new unified nodes (if any remain as dead code after graph.ts rewire)
- [X] T046 Run `pnpm type-check` across all packages to verify no type errors from shared type changes
- [X] T047 Run `pnpm test` to verify existing tests pass with refactored services
- [X] T048 Run quickstart.md manual verification scenarios (proactive scan, chat, HITL approval)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T004 (shared types) and T005/T006 (LLM client) from Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) completion
- **US2 (Phase 4)**: Depends on Foundational (Phase 2) completion — can run in parallel with US1
- **US3 (Phase 5)**: Depends on Foundational (Phase 2) completion — can run in parallel with US1/US2
- **US4 (Phase 6)**: Depends on Foundational (Phase 2) completion — can run in parallel with US1/US2/US3
- **US5 (Phase 7)**: Depends on Foundational (Phase 2) completion — best done after US1/US2 to have real nodes to add error handling to
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Proactive Sprint Health)**: Independent after Phase 2. Core pipeline validation.
- **US2 (On-Demand Chat)**: Independent after Phase 2. Shares graph pipeline with US1 but has its own entry point and UI.
- **US3 (Blocker Escalation)**: Independent after Phase 2. Reuses dedup logic from US1.
- **US4 (Human-Gated Mutations)**: Independent after Phase 2. Consumes action output from reasoning node. Frontend depends on action service API.
- **US5 (Graceful Degradation)**: Technically independent but best implemented after US1/US2 since it adds error handling to existing nodes.

### Within Each User Story

- Services before routes
- Routes before OpenAPI schemas (or parallel if schemas are self-contained)
- Backend before frontend
- Core implementation before integration

### Parallel Opportunities

- T001, T002, T003 (all migrations) can run in parallel
- T004 (shared types) can run in parallel with T001-T003
- T007, T008 (context + fetch nodes) can run in parallel
- T009, T010 (prompts + synthesis) are sequential (synthesis depends on prompts)
- US1, US2, US3, US4 can all begin in parallel after Phase 2
- All frontend tasks within a story can run in parallel with each other (different files)

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all migrations in parallel:
Task T001: "Create agent_runs migration in api/src/db/migrations/039_agent_runs.sql"
Task T002: "Create agent_actions migration in api/src/db/migrations/040_agent_actions.sql"
Task T003: "Create agent_notifications migration in api/src/db/migrations/041_agent_notifications.sql"
Task T004: "Add shared FleetGraph types to shared/src/types/fleetgraph.ts"
```

## Parallel Example: User Story 4 Frontend

```bash
# Launch all frontend tasks in parallel (different files):
Task T035: "Create ActionCard component in web/src/components/fleet/ActionCard.tsx"
Task T036: "Create useFleetGraphActions hook in web/src/hooks/useFleetGraphActions.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (migrations, types, LLM client)
2. Complete Phase 2: Foundational (graph nodes, synthesis, graph wiring)
3. Complete Phase 3: US1 — Proactive Sprint Health (validates full pipeline)
4. Complete Phase 4: US2 — On-Demand Chat (validates user-facing interaction)
5. **STOP and VALIDATE**: Both P1 stories independently testable
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Graph pipeline ready
2. Add US1 → Test proactive scan → Deploy (core value prop)
3. Add US2 → Test chat → Deploy (user-facing interaction)
4. Add US3 → Test blocker escalation → Deploy (event-driven)
5. Add US4 → Test HITL mutations → Deploy (trust boundary)
6. Add US5 → Test degradation → Deploy (reliability)
7. Polish → Final validation → Ship

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Agent never accesses DB directly — all data via ship-api-client.ts REST calls
- LLM is additive — detectors remain source of truth, LLM synthesizes/narrates
