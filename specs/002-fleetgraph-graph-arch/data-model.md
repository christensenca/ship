# Data Model: FleetGraph Agent Graph Architecture

**Feature**: 002-fleetgraph-graph-arch
**Date**: 2026-03-17 (Updated after clarification session)

## Existing Entities (Read-Only by Agent)

These entities are owned by Ship's core data model. The agent reads them exclusively through Ship API endpoints (`ship-api-client.ts`), never directly from the database.

### documents

The unified document table. Agent reads issues, sprints (weeks), projects, programs, persons.

**Key fields for agent**:
- `id`, `workspace_id`, `document_type`, `title`
- `properties` (JSONB): type-specific data (state, priority, assignee_id, sprint_number, owner_id, capacity_hours, etc.)
- `started_at`, `completed_at`, `cancelled_at` (issue lifecycle timestamps)
- `updated_at` (used for staleness detection)

**API access**: `GET /api/documents/:id`, `GET /api/issues`, `GET /api/weeks`, etc.

### document_associations

Junction table for organizational relationships.

**Key fields for agent**:
- `document_id`, `related_id`, `relationship_type` (parent, project, sprint/week, program)
- Used to traverse: program → projects → issues, week → issues

**API access**: `GET /api/documents/:id/associations`, `GET /api/weeks/:id/issues`

### document_history

Audit trail for field changes on documents.

**Key fields for agent**:
- `document_id`, `field`, `old_value`, `new_value`, `changed_by`, `automated_by`, `created_at`
- Agent reads for activity/staleness detection
- Agent writes `automated_by: 'fleetgraph'` when executing approved mutations (via `PATCH /api/issues/:id` which creates history entries)

**API access**: `GET /api/issues/:id/history`, `POST /api/issues/:id/history`

### issue_iterations

Work progress tracking per issue.

**Key fields for agent**:
- `issue_id`, `status` (pass/fail/in_progress), `what_attempted`, `blockers_encountered`, `author_id`, `created_at`
- Blocker detection: `status = 'fail'` with `blockers_encountered` text

**API access**: `GET /api/issues/:id/iterations`

---

## New Entities (Agent Infrastructure)

These tables store agent operational state. They are infrastructure tables (like `schema_migrations`), not user content. This is a documented exception to Constitution Principle I (Everything Is a Document) — these records have specific query patterns (time-window dedup, pending-action uniqueness, audit trail) that don't fit the document model.

### agent_runs (migration 039)

Audit trail for every graph invocation.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Run ID |
| workspace_id | UUID (FK → workspaces) | Scoped to workspace |
| trigger_type | TEXT | 'scheduled', 'event', 'on_demand' |
| scope_type | TEXT | 'workspace', 'week', 'project', 'program' |
| scope_id | UUID | Specific scope target (nullable for workspace-wide) |
| status | TEXT | 'running', 'completed', 'failed' |
| findings_count | INTEGER | Number of findings detected |
| actions_proposed | INTEGER | Number of actions proposed |
| degradation_tier | TEXT | 'full', 'partial', 'offline' |
| error_message | TEXT | Error details if failed (nullable) |
| started_at | TIMESTAMP | Run start |
| completed_at | TIMESTAMP | Run completion (nullable if interrupted) |

**Indexes**:
- `(workspace_id, started_at DESC)` — recent runs query
- `(workspace_id, trigger_type, started_at DESC)` — filtered run history

### agent_actions (migration 040)

Actions proposed by the agent awaiting human approval.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Action ID |
| run_id | UUID (FK → agent_runs) | Which run proposed this action |
| workspace_id | UUID (FK → workspaces) | Scoped to workspace |
| action_type | TEXT | 'move_issue', 'reassign', 'change_priority', 'change_state' |
| target_document_id | UUID | Document to be mutated |
| description | TEXT | Human-readable description of the proposed change |
| proposed_change | JSONB | The specific mutation: `{ field, old_value, new_value }` |
| finding_id | TEXT | Reference to the finding that triggered this |
| status | TEXT | 'pending', 'approved', 'dismissed', 'snoozed', 'expired', 'executed' |
| decision_by | UUID | User who decided (nullable) |
| decided_at | TIMESTAMP | When the decision was made (nullable) |
| snooze_until | TIMESTAMP | Snooze expiry (nullable) |
| created_at | TIMESTAMP | When proposed |

**Indexes**:
- `(workspace_id, status, created_at)` — list pending actions
- Unique partial index: `(workspace_id, target_document_id, action_type) WHERE status = 'pending'` — prevents duplicate proposals

### agent_notifications (migration 041)

Tracks sent notifications for deduplication (FR-013, SC-004).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Notification record ID |
| workspace_id | UUID (FK → workspaces) | Scoped to workspace |
| finding_category | TEXT | Finding category (blocker, stale_work, etc.) |
| finding_key | TEXT | Hash of category + sorted related document IDs |
| notified_at | TIMESTAMP | When notification was last sent |

**Indexes**:
- Unique index: `(workspace_id, finding_key)` — upsert on re-notification

**Dedup rule**: Before surfacing a finding, check:
```sql
SELECT 1 FROM agent_notifications
WHERE workspace_id = $1 AND finding_key = $2
AND notified_at > NOW() - INTERVAL '24 hours'
```
If exists, skip. Otherwise, upsert with current timestamp.

---

## State Transitions

### Action Lifecycle

```text
                    ┌─────────┐
                    │ pending │ (created by action node)
                    └────┬────┘
              ┌──────────┼──────────┬────────────┐
              ▼          ▼          ▼            ▼
         ┌─────────┐ ┌──────────┐ ┌───────┐ ┌─────────┐
         │approved │ │dismissed │ │snoozed│ │ expired │
         └────┬────┘ └──────────┘ └───┬───┘ └─────────┘
              ▼                       │     (48h no response)
         ┌─────────┐                  ▼
         │executed │            re-evaluate
         └─────────┘            on snooze expiry
```

- **Approved → Executed**: Backend calls Ship API to apply mutation (e.g., `PATCH /api/issues/:id`), records `automated_by: 'fleetgraph'` in document history.
- **Dismissed**: Logged permanently. Agent never re-proposes the exact same (target_document_id, action_type) combination (checked via partial unique index).
- **Snoozed**: `snooze_until` set. After expiry, agent re-evaluates the condition and may re-propose if still relevant.
- **Expired**: Actions pending >48h with no response. Treated as implicit snooze — agent may re-propose on next scan.

---

## Relationships

```text
workspaces ◄── agent_runs.workspace_id
workspaces ◄── agent_actions.workspace_id
workspaces ◄── agent_notifications.workspace_id
agent_runs ◄── agent_actions.run_id
```

All new tables reference existing Ship entities. Dropping them would not affect Ship's core functionality — they are purely agent operational state.
