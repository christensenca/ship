# FleetGraph Agent Quickstart

## Goal

Validate the FleetGraph planning assumptions before implementation begins.

## Prerequisites

- Local PostgreSQL is running
- Project dependencies are installed
- The API and web app can run locally through existing workspace commands

## 1. Review the feature package

- Read [spec.md](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/spec.md)
- Read [plan.md](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/plan.md)
- Read [research.md](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/research.md)
- Read [data-model.md](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/data-model.md)
- Read [agent-contract.yaml](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/contracts/agent-contract.yaml)

## 2. Confirm architectural guardrails

- Verify the plan uses Ship REST APIs only for runtime reads and writes
- Verify persisted outputs are described as document-backed content
- Verify no autonomous mutation path bypasses a human approval gate
- Verify any new API route in the contract is expected to be registered with OpenAPI

## 3. Prepare representative scenarios

- Create or seed an active week with:
  - one blocked issue
  - one stale in-progress issue
  - one missing plan approval
  - one overloaded assignee
- Prepare one engineer with multiple active assignments
- Prepare at least two programs with contrasting health for portfolio review

## 4. Validate the planned agent flows

- Review the graph design and confirm it includes:
  - context nodes
  - fetch nodes
  - reasoning nodes
  - conditional edges
  - action nodes
  - human-in-the-loop gates
  - error and fallback nodes
- Confirm every mutation-capable action flows through an approval step
- Confirm fallback behavior exists for missing context, API failures, and low-confidence reasoning

## 5. Implementation readiness checklist

- `plan.md` has no unresolved clarification markers
- `research.md` documents the dependency and orchestration decisions
- `data-model.md` maps persisted outputs to the unified document model
- `contracts/` defines the expected FleetGraph API surface
- Agent context has been refreshed after the plan is finalized

## 6. Verification Evidence

Implementation completed against all 43 tasks in tasks.md. Below is the verification coverage:

### API Endpoint Coverage

| Endpoint | Route | Zod Validation | Auth | Rate Limited | Test File |
|----------|-------|----------------|------|--------------|-----------|
| Contextual Guidance | `POST /api/agent/contextual-guidance` | Yes | Yes | Yes | `fleetgraph.guidance.test.ts` |
| Proactive Findings | `POST /api/agent/proactive-findings` | Yes | Yes | Yes | `fleetgraph.proactive-findings.test.ts` |
| Drafts | `POST /api/agent/drafts` | Yes | Yes | Yes | `fleetgraph.guidance.test.ts` |
| Recommendation Confirm | `POST /api/agent/recommendations/:id/confirm` | Yes | Yes | Yes | `fleetgraph.proactive-findings.test.ts` |
| Portfolio Summary | `POST /api/agent/portfolio-summary` | Yes | Yes | Yes | `fleetgraph.portfolio-summary.test.ts` |
| Status | `GET /api/agent/status` | N/A | Yes | Yes | `fleetgraph.proactive-findings.test.ts` |

### Test Results (21 tests, 3 files)

- `fleetgraph.proactive-findings.test.ts` — 10 tests (400 validation, 200 responses, status endpoint)
- `fleetgraph.guidance.test.ts` — 8 tests (guidance + drafts with multiple view types)
- `fleetgraph.portfolio-summary.test.ts` — 3 tests (validation, summary, programIds filter)

### UI Component Coverage

| Component | Location | Test File |
|-----------|----------|-----------|
| FleetGraphWeekPanel | `web/src/components/fleet/FleetGraphWeekPanel.tsx` | `FleetGraphWeekPanel.test.tsx` |
| FleetGraphAssistantPanel | `web/src/components/fleet/FleetGraphAssistantPanel.tsx` | `FleetGraphAssistantPanel.test.tsx` |
| FleetGraphPortfolioSummary | `web/src/components/fleet/FleetGraphPortfolioSummary.tsx` | `FleetGraphPortfolioSummary.test.tsx` |

### Scenario Verification Mapping

| Scenario | User Story | Detectors/Services | UI Surface |
|----------|-----------|-------------------|------------|
| Blocked issue in active week | US1 | `detectBlockers()` in `week-risk.ts` | FleetGraphWeekPanel |
| Stale in-progress work | US1 | `detectStaleWork()` in `week-risk.ts` | FleetGraphWeekPanel |
| Missing plan approval | US1 | `detectMissingPlanApproval()` in `week-risk.ts` | FleetGraphWeekPanel |
| Slipping scope (>50% unstarted) | US1 | `detectSlippingScope()` in `week-risk.ts` | FleetGraphWeekPanel |
| Recommendation approval gate | US1 | Confirm endpoint in `fleetgraph.ts` | FleetGraphWeekPanel |
| Issue-view guidance | US2 | `generateContextualGuidance()` | FleetGraphAssistantPanel |
| Week-view guidance | US2 | `generateContextualGuidance()` | FleetGraphAssistantPanel |
| Person-view guidance | US2 | `generateContextualGuidance()` | FleetGraphAssistantPanel |
| Standup draft generation | US2 | `generateDraft()` | StandupFeed "Draft with AI" |
| Weekly plan draft | US2 | `generateDraft()` | FleetGraphAssistantPanel |
| Cross-program drift summary | US3 | `generatePortfolioSummary()` | FleetGraphPortfolioSummary |
| Program health classification | US3 | `assessProgramHealth()` | FleetGraphPortfolioSummary |

### Architectural Guardrails Verified

- All data access goes through `ShipAPIClient` REST calls (no direct DB queries)
- All mutation recommendations flow through HITL approval gate
- All routes registered with OpenAPI via `@asteasolutions/zod-to-openapi`
- Rate limiting at 20 req/min per user on all FleetGraph endpoints
- Fallback handling for API failures, missing context, and service errors
- LangGraph state annotation with proper reducer functions for accumulated findings
