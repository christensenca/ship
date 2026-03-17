# Research: FleetGraph Agent Graph Architecture

**Feature**: 002-fleetgraph-graph-arch
**Date**: 2026-03-17 (Updated after clarification session)

## Research Topics

### 1. LangGraph Parallel Fetch Strategy

**Decision**: Use `Promise.all` inside a single fetch node with per-fetch try/catch for error isolation.

**Rationale**: The existing graph (`graph.ts`) uses a linear pipeline: `context → fetch → reasoning → action → fallback`. FR-003 requires parallel fetch execution. The `fetchedResources` annotation already uses `reducer: (a, b) => [...a, ...b]` which merges results. The existing `proactive-findings.ts:scanWeekScope()` already uses `Promise.all` for parallel week + issues fetches. Extending this pattern to 3-5 concurrent API calls is straightforward and boring.

**Alternatives considered**:
- **LangGraph `Send()` fan-out**: More idiomatic LangGraph but adds graph complexity (named fetch sub-nodes, edge routing) for minimal gain at our scale (~5 concurrent API calls).
- **Sequential fetches**: Too slow. Sprint health checks need issues + week + people data; sequential triples latency vs the 5s target (SC-002).

**Resolution**: `Promise.all` with per-fetch try/catch. Failed fetches append to `errors[]` but don't block other fetches. This matches the existing pattern and keeps the graph simple.

### 2. LLM Integration — Hybrid Detectors + Synthesis

**Decision**: Use `@langchain/openai` `ChatOpenAI` with `withStructuredOutput()` for a single synthesis call after detectors run. Model: `gpt-4o-mini` for proactive scans, `gpt-4o` for chat (configurable via env).

**Rationale**: Per clarification Q1, the reasoning node uses a hybrid approach: deterministic detectors (already implemented in `detectors/week-risk.ts`) run first, then a single LLM call synthesizes their output. This preserves testable, deterministic detection while adding natural language narration and open-ended question handling.

**Implementation**:
- Proactive scans: detectors → LLM narrates findings into human-readable summary → route based on severity
- Chat: detectors → LLM receives detector output + user prompt + view context → single call produces: narrated summary, intent label (for logging), proposed actions (if any)
- The LLM prompt includes a Zod-derived JSON schema for structured output: `{ summary: string, findings_narration: string[], proposed_actions: Array<{type, target, description}>, intent_label: string }`

**Alternatives considered**:
- **Anthropic Claude via API**: Available per project memory. However, @langchain/openai is already a dependency with LangSmith tracing configured. Swappable later via LangChain abstraction.
- **No LLM (pure deterministic)**: Can't answer "how are we tracking?" conversationally. Detectors only produce structured signals, not natural language.
- **Two LLM calls (intent classification + analysis)**: Per clarification Q1 (prior session), rejected in favor of single call. Saves latency and cost.

**Cost controls**:
- `gpt-4o-mini` for proactive scans (~$0.0005/call, ~$0.15/month at 10 scans/day)
- `gpt-4o` for chat (~$0.02/call, bounded by rate limiter at 20 req/min/user)
- Model configurable via `FLEETGRAPH_LLM_MODEL` env var

### 3. Persistence Tables Design

**Decision**: Three new tables via migrations 039-041: `agent_runs`, `agent_actions`, `agent_notifications`.

**Rationale**: Per clarification Q2, operational/audit state doesn't fit the unified document model. Three tables match three distinct query patterns:

1. **`agent_runs`** (migration 039): Audit trail per graph invocation.
   - Columns: id (uuid), workspace_id, trigger_type, scope_type, scope_id, status (running/completed/failed), findings_count, actions_proposed, started_at, completed_at, error_message
   - Index: (workspace_id, started_at DESC) for recent runs query

2. **`agent_actions`** (migration 040): HITL pending action tracking.
   - Columns: id (uuid), run_id (FK agent_runs), workspace_id, action_type, target_document_id, description, status (pending/approved/dismissed/snoozed/expired), decision_by, decided_at, snooze_until, created_at
   - Unique partial index: (workspace_id, target_document_id, action_type) WHERE status = 'pending' — prevents duplicate proposals
   - Index: (workspace_id, status, created_at) for listing pending actions

3. **`agent_notifications`** (migration 041): Deduplication tracking.
   - Columns: id (uuid), workspace_id, finding_category, finding_key (hash of category + sorted related document IDs), notified_at
   - Unique index: (workspace_id, finding_key) — a new notification for the same key replaces the old timestamp
   - Query pattern: `WHERE finding_key = $1 AND notified_at > NOW() - INTERVAL '24 hours'` to check dedup window

**Alternatives considered**:
- **Unified document model**: Lacks constraint enforcement for dedup and pending-action uniqueness.
- **Single JSONB column**: Loses queryability (e.g., "list all pending actions for user X").

### 4. Chat Session Management

**Decision**: Stateless per-request with client-side message history.

**Rationale**: FR-015 requires carrying data across chat turns. The simplest approach: the frontend sends the last N messages (capped at 10) with each chat request. The context node checks if scope changed (different documentId/viewType from last message) — if unchanged, the LLM receives the prior fetched data summary in its prompt context without re-fetching.

**Implementation**:
- New endpoint: `POST /api/agent/chat` accepts `{ workspaceId, viewType, documentId, messages: Array<{role: 'user'|'assistant', content: string}> }`
- The reasoning node's LLM prompt includes conversation history for multi-turn context
- Re-fetch happens when: (a) first message, (b) scope changed, (c) >5 minutes since last fetch (client tracks timestamp)
- No server-side session storage — stateless, boring, works

**Alternatives considered**:
- **LangGraph checkpointing**: Powerful but requires checkpoint store setup (PostgreSQL adapter), thread management, cleanup. Overkill for a chat panel with ~3-5 turns average.
- **Server-side session table**: Adds another table and cleanup job. Client-side history achieves the same goal with zero server state.

### 5. External Cron Trigger Architecture

**Decision**: Railway cron jobs calling Ship API endpoints via Bearer token authentication.

**Rationale**: Per clarification Q5, no in-process scheduler and no direct DB access. Railway supports scheduled HTTP requests.

**Implementation**:
- **Scheduled midweek scan**: Railway cron, `0 10 * * 3` (Wednesday 10:00 UTC), calls:
  ```
  POST /api/agent/proactive-findings
  Authorization: Bearer {SHIP_API_TOKEN}
  Body: { workspaceId: "{WORKSPACE_ID}", scopeType: "workspace", triggerType: "scheduled" }
  ```
- **Blocker check polling**: Railway cron, `0 */4 * * *` (every 4 hours), calls:
  ```
  POST /api/agent/check-blockers
  Authorization: Bearer {SHIP_API_TOKEN}
  Body: { workspaceId: "{WORKSPACE_ID}" }
  ```
  The `check-blockers` endpoint (new) internally calls `GET /api/issues` to find issues with recent failed iterations, then runs blocker detection.
- **Action expiry**: Railway cron, `0 6 * * *` (daily 6:00 UTC), calls:
  ```
  POST /api/agent/expire-actions
  Authorization: Bearer {SHIP_API_TOKEN}
  Body: { workspaceId: "{WORKSPACE_ID}" }
  ```
  Expires pending actions older than 48 hours (FR: implicit snooze).

**Alternatives considered**:
- **In-process node-cron**: Explicitly prohibited by spec clarification.
- **Database-backed queue (pg-boss)**: Adds a dependency for 3 simple scheduled jobs.

### 6. Conditional Edge Routing

**Decision**: Two conditional routing points: (1) after reasoning node — clean vs. problem-detected, (2) after action node — mutation vs. read-only.

**Rationale**: FR-006 requires distinct execution paths for clean vs. problem runs. The existing graph has one conditional edge (action → fallback if errors). Extend with:
- After reasoning: if `detectedFindings.length === 0` → END (clean path, log only). If findings exist → action node.
- After action: if any `recommendedActions` have `approvalStatus === 'pending'` → persist to `agent_actions` → END. If only read-only actions → notify → END.

This creates three visibly different traces (SC-007) in run logs:
1. Clean: `context → fetch → reasoning → END`
2. Notify: `context → fetch → reasoning → action → notify → END`
3. Propose mutation: `context → fetch → reasoning → action → persist-action → END`

**Implementation note**: HITL gate is at the route/service level after graph execution (existing design comment in `graph.ts:77-78`), not inside the graph. The graph completes; proposed mutations are persisted; user responds asynchronously.

### 7. HITL Action Card UX Pattern

**Decision**: Inline action cards in existing panels with Approve / Dismiss / Snooze controls.

**Rationale**: Per clarification Q4, action cards render alongside findings in the same panel. The `FleetGraphWeekPanel` already has expandable `FindingCard` components. Action cards follow the same visual pattern but add control buttons.

**Implementation**:
- New reusable `ActionCard` component with three buttons
- Approve: `POST /api/agent/actions/:id/decide` with `{ decision: 'approve' }`
- Dismiss: same endpoint, `{ decision: 'dismiss' }`
- Snooze: same endpoint, `{ decision: 'snooze', snoozeHours: 24 }`
- Backend executes approved mutations via Ship API (e.g., `PATCH /api/issues/:id`)
- The existing `recommendations/:id/confirm` placeholder endpoint is replaced by `actions/:id/decide`

### 8. Error Handling and Graceful Degradation

**Decision**: Per-node try/catch with mode-aware fallback.

**Rationale**: FR-011/012 require every node to have error handling, with behavior varying by trigger type. The existing fallback node (`graph.ts:40-60`) already handles this partially.

**Implementation**:
- Each sub-fetch in the parallel fetch wraps in try/catch, appends to `errors[]`
- The reasoning node receives whatever data succeeded + error list
- LLM prompt includes: "The following data sources were unavailable: [list]. Provide analysis based on available data and note what information is missing."
- Fallback node checks `invocation.triggerType`:
  - `on_demand` (chat): return partial results with caveats in `summary`
  - `scheduled`/`event`: log to `agent_runs` as failed, no notifications sent
- `degradationTier` field in state: `full` (all succeeded), `partial` (some fetches failed), `offline` (all fetches or LLM failed)
