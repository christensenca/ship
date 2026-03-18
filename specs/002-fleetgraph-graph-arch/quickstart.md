# Quickstart: FleetGraph Agent Graph Architecture

**Feature**: 002-fleetgraph-graph-arch
**Date**: 2026-03-17 (Updated after clarification session)

## Prerequisites

- PostgreSQL running locally
- `pnpm install` completed
- `pnpm build:shared` completed (shared types must be built first)
- Environment variables in `api/.env.local`:
  - `DATABASE_URL` (auto-created by `pnpm dev`)
  - `OPENAI_API_KEY` (required for LLM reasoning node)
  - `FLEETGRAPH_LLM_MODEL` (optional, default: `gpt-4o-mini`)
  - `LANGSMITH_API_KEY` (optional, for tracing)
  - `LANGSMITH_TRACING=true` (optional, enables trace collection)

## Development

```bash
# Start dev servers (API + Web)
pnpm dev

# Run unit tests
pnpm test

# Type check all packages
pnpm type-check

# Run database migrations (includes new agent_* tables)
pnpm db:migrate
```

## Key Files to Edit

### Graph Core (start here)

1. `api/src/fleet/graph.ts` — Graph builder. Add conditional edges for clean/problem/mutation paths.
2. `api/src/fleet/state.ts` — State annotation. Add chat messages, LLM response fields, degradation tier.
3. `api/src/fleet/runtime.ts` — Add LLM client initialization (`ChatOpenAI` from @langchain/openai).

### New Nodes (implement in order)

1. `api/src/fleet/nodes/context-node.ts` — Unified context (view metadata extraction, no LLM)
2. `api/src/fleet/nodes/fetch-node.ts` — Parallel fetch via Promise.all with per-fetch error isolation
3. `api/src/fleet/nodes/reasoning-node.ts` — Hybrid: run detectors → single LLM synthesis call
4. `api/src/fleet/nodes/action-node.ts` — Route to notify/propose-mutation/clean paths
5. `api/src/fleet/nodes/fallback-node.ts` — Mode-aware error handler (chat partial / proactive silent)

### LLM Integration

1. `api/src/fleet/llm/synthesis.ts` — LLM prompt construction + structured output parsing
2. `api/src/fleet/llm/prompts.ts` — System/user prompt templates

### Services

1. `api/src/fleet/services/chat-service.ts` — Chat session management (stateless, client-side history)
2. `api/src/fleet/services/action-service.ts` — CRUD for pending actions + mutation execution

### Database Migrations

1. `api/src/db/migrations/039_agent_runs.sql` — Run log table
2. `api/src/db/migrations/040_agent_actions.sql` — Pending action table
3. `api/src/db/migrations/041_agent_notifications.sql` — Notification dedup table

### API Routes & OpenAPI

1. `api/src/routes/fleetgraph.ts` — Add chat, action decide, check-blockers, expire-actions endpoints
2. `api/src/openapi/schemas/fleetgraph.ts` — Zod schemas + OpenAPI registration for all new endpoints

### Frontend

1. `web/src/components/fleet/FleetGraphAssistantPanel.tsx` — Add chat input + message history
2. `web/src/components/fleet/FleetGraphWeekPanel.tsx` — Add inline action cards
3. `web/src/components/fleet/ActionCard.tsx` — Reusable approve/dismiss/snooze component
4. `web/src/hooks/useFleetGraphActions.ts` — Hooks for action management

### Testing

- Each node gets a unit test in `api/src/fleet/nodes/__tests__/`
- LLM calls mocked in tests (deterministic detector output fed directly)
- Use existing `api/src/test/fleetgraph-fixtures.ts` and extend

## Verification

### Manual Test: Proactive Scan with LLM

1. Start dev server: `pnpm dev`
2. Seed data: `pnpm db:seed`
3. Trigger scan:
   ```bash
   curl -X POST http://localhost:3000/api/agent/proactive-findings \
     -H 'Content-Type: application/json' \
     -H 'Cookie: <session-cookie>' \
     -d '{"workspaceId": "<id>", "scopeType": "week", "scopeId": "<week-id>", "triggerType": "scheduled"}'
   ```
4. Verify response contains findings with LLM-narrated rationale.
5. Check `agent_runs` table for audit entry.

### Manual Test: Chat

1. Navigate to any sprint view in the web app.
2. The AssistantPanel should show a chat input field.
3. Type "how are we tracking?"
4. Verify the response includes sprint health analysis with specific issue references.
5. Follow-up: "what about blockers?" — verify it uses prior context.

### Manual Test: HITL Action Approval

1. Trigger a proactive scan on a week with stale issues.
2. Action cards should appear in WeekPanel with Approve/Dismiss/Snooze buttons.
3. Click Approve.
4. Verify mutation applied, `document_history` has `automated_by: 'fleetgraph'`.
5. Check `agent_actions` table: status = 'executed'.
