# Implementation Plan: FleetGraph Agent Graph Architecture

**Branch**: `002-fleetgraph-graph-arch` | **Date**: 2026-03-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-fleetgraph-graph-arch/spec.md`

## Summary

Build the full FleetGraph agent graph: wire LLM reasoning (hybrid detectors + single LLM synthesis call) into the existing LangGraph pipeline, add persistence tables for run logs / actions / notification dedup, extend the AssistantPanel with chat input, add inline HITL approval controls, and create new API endpoints for chat and action management. External cron (Railway) triggers scheduled and event-driven scans via existing API endpoints — no in-process scheduler, no direct DB access from the agent.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20, pnpm workspaces monorepo)
**Primary Dependencies**: @langchain/langgraph ^1.2.2, @langchain/openai (LLM calls), Express 4, React 18 + Vite, TanStack Query
**Storage**: PostgreSQL (direct SQL, `pg` driver, numbered migrations)
**Testing**: Vitest (unit + integration), Playwright (E2E)
**Target Platform**: Railway (API + Web services)
**Project Type**: Web application (monorepo: api/ + web/ + shared/)
**Performance Goals**: Chat responses <5s (SC-002), parallel fetch ≥40% faster than sequential (SC-006)
**Constraints**: No direct DB access from agent (API-only via `ship-api-client.ts`), external cron for scheduling, panel-only notifications
**Scale/Scope**: Single workspace, ~50 active issues per sprint, ~5 active sprints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Everything Is a Document | **EXCEPTION** | New `agent_runs`, `agent_actions`, `agent_notifications` tables are operational/audit state, not content. They track graph execution metadata, not user-authored documents. Justified because these records have specific query patterns (dedup within 24h window, find pending actions by user, audit trail) that don't fit the document model. |
| II. Shared Editor and Four-Panel Layout | **PASS** | No new editors or layouts. Chat input extends existing AssistantPanel. HITL controls are inline in existing panels. |
| III. Boring Technology First | **PASS** | LangGraph already in deps. @langchain/openai is the standard LLM integration for LangChain. External cron is boring infrastructure. No new frameworks. |
| IV. Contracted APIs with OpenAPI | **PASS** | All new endpoints (chat, action management) will be registered with OpenAPI schemas alongside route implementation. |
| V. Explicit Schema Evolution | **PASS** | New tables via numbered migrations (039+). No modifications to schema.sql. |
| VI. Untitled Means Untitled | **N/A** | No new document types created. |
| VII. Behavior Changes Require Verification | **PASS** | Each user story has acceptance scenarios with seeded test data. Unit tests for detectors + LLM synthesis, integration tests for API endpoints, E2E for chat flow. |

## Project Structure

### Documentation (this feature)

```text
specs/002-fleetgraph-graph-arch/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-contracts.md # New/modified API endpoint contracts
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
api/src/
├── fleet/
│   ├── graph.ts                    # [MODIFY] Add conditional edges, parallel fetch fan-out
│   ├── state.ts                    # [MODIFY] Add chat message history, LLM response fields
│   ├── runtime.ts                  # [MODIFY] Add LLM client initialization (OpenAI)
│   ├── ship-api-client.ts          # [MODIFY] Add iteration listing, action execution methods
│   ├── observability.ts            # [EXISTING] No changes needed
│   ├── nodes/
│   │   ├── context-node.ts         # [NEW] Unified context node (replaces guidance-context/week-context/portfolio-context)
│   │   ├── fetch-node.ts           # [NEW] Parallel fetch with fan-out/fan-in
│   │   ├── reasoning-node.ts       # [NEW] Hybrid: detectors → LLM synthesis
│   │   ├── action-node.ts          # [NEW] Route findings to notify/propose-mutation paths
│   │   └── fallback-node.ts        # [NEW] Mode-aware fallback (chat partial / proactive silent)
│   ├── detectors/
│   │   └── week-risk.ts            # [EXISTING] No changes — detectors are source of truth
│   ├── services/
│   │   ├── proactive-findings.ts   # [MODIFY] Wire through full graph pipeline
│   │   ├── contextual-guidance.ts  # [MODIFY] Wire through full graph pipeline with LLM
│   │   ├── chat-service.ts         # [NEW] Multi-turn chat session management
│   │   ├── action-service.ts       # [NEW] CRUD for pending actions (approve/dismiss/snooze)
│   │   └── portfolio-summary.ts    # [EXISTING] Minor: wire through graph if needed
│   └── llm/
│       ├── synthesis.ts            # [NEW] LLM prompt construction + structured output parsing
│       └── prompts.ts              # [NEW] System/user prompt templates
├── routes/
│   └── fleetgraph.ts              # [MODIFY] Add chat endpoint, action management endpoints
├── openapi/schemas/
│   └── fleetgraph.ts              # [MODIFY] Add chat + action schemas
└── db/migrations/
    ├── 039_agent_runs.sql          # [NEW] Run log table
    ├── 040_agent_actions.sql       # [NEW] Pending action table
    └── 041_agent_notifications.sql # [NEW] Notification dedup table

shared/src/types/
└── fleetgraph.ts                  # [MODIFY] Add chat types, action management types

web/src/
├── components/fleet/
│   ├── FleetGraphAssistantPanel.tsx  # [MODIFY] Add chat input + message history + action cards
│   ├── FleetGraphWeekPanel.tsx       # [MODIFY] Add inline action cards for findings
│   ├── FleetGraphPortfolioSummary.tsx # [EXISTING] No changes
│   └── ActionCard.tsx                # [NEW] Reusable approve/dismiss/snooze action card
├── hooks/
│   ├── useFleetGraphGuidance.ts     # [MODIFY] Add chat mutation
│   ├── useFleetGraphWeekQuery.ts    # [EXISTING] No changes
│   ├── useFleetGraphPortfolioQuery.ts # [EXISTING] No changes
│   └── useFleetGraphActions.ts      # [NEW] Hooks for action management (approve/dismiss/snooze)
```

**Structure Decision**: Extends the existing `api/src/fleet/` module structure. New `nodes/` directory replaces the ad-hoc node files in `nodes/` (guidance-context, week-context, portfolio-context) with a unified set of graph nodes. New `llm/` directory isolates LLM prompt construction. Frontend extends existing panel components rather than creating new pages.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 3 new tables (`agent_runs`, `agent_actions`, `agent_notifications`) | Required for HITL action tracking (US4), notification dedup (FR-013), and audit trail (FR-009). These are operational records with specific query patterns (pending actions by user, dedup within 24h, run audit) | Storing as documents would require querying all documents with filters, losing the ability to enforce unique constraints and time-window dedup efficiently. JSONB on existing tables would scatter agent state across unrelated records. |
| LLM dependency (@langchain/openai) | Hybrid reasoning (FR-005) requires LLM to synthesize detector output into natural language and handle open-ended chat questions (US2) | Pure deterministic detectors can't answer "how are we tracking?" or "what should I work on next?" conversationally. The LLM is the minimum addition needed for the chat use case. |
