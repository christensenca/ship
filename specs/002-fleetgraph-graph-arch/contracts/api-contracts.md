# API Contracts: FleetGraph Agent Graph Architecture

**Feature**: 002-fleetgraph-graph-arch
**Date**: 2026-03-17 (Updated after clarification session)

## Existing Endpoints (Evolved)

### POST /api/agent/contextual-guidance

**Change**: Wire through full graph pipeline with hybrid detectors + LLM synthesis. Response shape unchanged, content richer.

**Request** (unchanged):
```json
{
  "workspaceId": "uuid",
  "viewType": "issue | week | project | program | person",
  "documentId": "uuid",
  "actorUserId": "uuid",
  "prompt": "optional natural language question"
}
```

**Response** (unchanged shape, richer content):
```json
{
  "summary": "string (LLM-narrated)",
  "findings": [
    {
      "id": "string",
      "category": "blocker | stale_work | capacity_risk | planning_gap | slipping_scope | silent_project | missing_standup",
      "severity": "critical | high | medium | low",
      "headline": "string",
      "rationale": "string (LLM-enhanced)",
      "evidence": ["string"],
      "relatedDocumentIds": ["uuid"],
      "recommendedAudience": ["uuid"],
      "requiresHumanAction": true,
      "confidence": 0.85
    }
  ],
  "recommendations": [
    {
      "id": "string",
      "type": "escalate | reassign | rescope | approve_plan | review_blocker | publish_draft",
      "reason": "string",
      "expectedImpact": "string",
      "approvalStatus": "not_required | pending",
      "affectedDocumentIds": ["uuid"]
    }
  ],
  "fallback": { "message": "string", "retryable": true }
}
```

### POST /api/agent/proactive-findings

**Change**: Now invokes full graph pipeline. Detectors remain source of truth; LLM augments with narration. Results persisted to `agent_runs` for audit trail. Notification dedup checked against `agent_notifications`.

**Request** (unchanged):
```json
{
  "workspaceId": "uuid",
  "scopeType": "workspace | week | project | program",
  "scopeId": "uuid",
  "triggerType": "scheduled | event"
}
```

**Response** (unchanged):
```json
{
  "findings": [{ "...FindingShape" }],
  "generatedAt": "ISO-8601"
}
```

### POST /api/agent/drafts

**No changes**. Continues to generate standup/plan drafts via deterministic logic.

### POST /api/agent/portfolio-summary

**No changes**. Continues to assess program health via deterministic detectors.

---

## New Endpoints

### POST /api/agent/chat

Multi-turn conversational chat. Replaces button-click guidance with conversational interaction.

**Request**:
```json
{
  "workspaceId": "uuid",
  "viewType": "issue | week | project | program | person",
  "documentId": "uuid",
  "messages": [
    { "role": "user", "content": "how are we tracking?" },
    { "role": "assistant", "content": "Sprint 12 is at 60% completion..." },
    { "role": "user", "content": "what about blockers?" }
  ]
}
```

**Response**:
```json
{
  "message": "string (markdown formatted)",
  "findings": [{ "...FindingShape (if detected)" }],
  "proposedActions": [{ "...ActionShape (if mutation suggested)" }],
  "degradationTier": "full | partial | offline",
  "refetchedScope": true
}
```

**Notes**:
- Client sends full message history (max 10 messages) per request — stateless server
- `refetchedScope` indicates whether data was re-fetched (true on first message or scope change)
- `proposedActions` only included when the LLM determines a mutation would help
- Rate limit: 20 req/min per user (existing limiter)

**OpenAPI registration**: Required with Zod schemas for request/response.

### POST /api/agent/actions/:id/decide

Approve, dismiss, or snooze a proposed action. Replaces the placeholder `recommendations/:id/confirm`.

**Request**:
```json
{
  "decision": "approve | dismiss | snooze",
  "snoozeHours": 24,
  "comment": "optional string"
}
```

**Response**:
```json
{
  "actionId": "uuid",
  "status": "approved | dismissed | snoozed",
  "executionResult": {
    "success": true,
    "documentId": "uuid",
    "changeApplied": { "field": "string", "old_value": "any", "new_value": "any" }
  }
}
```

**Notes**:
- On approve: backend executes mutation via Ship API (`PATCH /api/issues/:id`), records `automated_by: 'fleetgraph'` in document history, updates action status to 'executed'
- On dismiss: action marked as dismissed, never re-proposed for same (target_document_id, action_type)
- On snooze: `snooze_until` set, action reappears after expiry if condition persists
- `executionResult` only present on approve

**OpenAPI registration**: Required.

### GET /api/agent/actions

List actions for the current user's workspace.

**Query params**: `workspaceId` (required), `status` (optional, default 'pending')

**Response**:
```json
{
  "actions": [
    {
      "id": "uuid",
      "actionType": "move_issue | reassign | change_priority | change_state",
      "targetDocumentId": "uuid",
      "targetDocumentTitle": "string",
      "proposedChange": { "field": "string", "old_value": "any", "new_value": "any" },
      "description": "string",
      "findingId": "string",
      "status": "pending",
      "createdAt": "ISO-8601"
    }
  ]
}
```

**OpenAPI registration**: Required.

### POST /api/agent/check-blockers

Called by external cron to poll for blocker escalation. Queries recent iterations via Ship API and runs blocker detection.

**Request**:
```json
{
  "workspaceId": "uuid"
}
```

**Response**:
```json
{
  "findings": [{ "...FindingShape" }],
  "escalated": 0,
  "skipped": 2
}
```

**Notes**:
- Internally calls `GET /api/issues` and `GET /api/issues/:id/iterations` to find issues with recent failed iterations
- Checks `agent_notifications` dedup table before surfacing findings
- `escalated` = new findings surfaced, `skipped` = findings suppressed by dedup

**OpenAPI registration**: Required.

### POST /api/agent/expire-actions

Called by external cron to expire stale pending actions (>48h).

**Request**:
```json
{
  "workspaceId": "uuid"
}
```

**Response**:
```json
{
  "expired": 3
}
```

**OpenAPI registration**: Required.

---

## Internal Contracts (Node Interfaces)

These define the contract between LangGraph nodes via state annotations.

### Context Node → State

```typescript
// Output: establishes invocation context
{
  invocation: InvocationContext,  // trigger type, view, actor, workspace, time window
  contextSummary: string          // human-readable scope description
}
```

### Fetch Node → State

Single fetch node using Promise.all. Writes to typed state slots:
```typescript
{
  fetchedResources: ShipDocument[],  // merged via reducer
  errors: string[]                    // per-fetch errors appended
}
```

### Reasoning Node → State

Hybrid: detectors → LLM synthesis.
```typescript
{
  detectedFindings: FleetGraphFinding[],    // from detectors
  recommendedActions: FleetGraphRecommendation[],  // from LLM
  contextSummary: string                     // LLM-narrated summary (overwrites)
}
```

### Action Node → Conditional Edge

Returns routing decision:
- `detectedFindings.length === 0` → END (clean path)
- Findings exist, no mutations → notify → END
- Findings with mutation recommendations → persist to `agent_actions` → END

### Fallback Node → State

Mode-aware error handling:
```typescript
{
  fallback: FleetGraphFallback,     // user-safe error message
  fallbackStatus: FallbackEvent[]   // detailed error records
}
```
- `on_demand` trigger: returns partial results with caveats
- `scheduled`/`event` trigger: logs to `agent_runs` as failed, no notifications

---

## External Cron Contracts

Three Railway cron jobs calling Ship API endpoints:

| Job | Schedule | Endpoint | Auth |
|-----|----------|----------|------|
| Midweek scan | `0 10 * * 3` (Wed 10:00 UTC) | `POST /api/agent/proactive-findings` | Bearer token |
| Blocker check | `0 */4 * * *` (every 4h) | `POST /api/agent/check-blockers` | Bearer token |
| Action expiry | `0 6 * * *` (daily 6:00 UTC) | `POST /api/agent/expire-actions` | Bearer token |

All jobs authenticated via `SHIP_API_TOKEN` environment variable using Bearer token auth (already supported by `authMiddleware`).
