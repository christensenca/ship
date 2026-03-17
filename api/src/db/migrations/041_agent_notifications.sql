-- Agent notification deduplication tracking.
-- Part of FleetGraph agent graph architecture (002-fleetgraph-graph-arch).

CREATE TABLE IF NOT EXISTS agent_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  finding_category TEXT NOT NULL,
  finding_key TEXT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upsert on re-notification: update notified_at if same key
CREATE UNIQUE INDEX idx_agent_notifications_workspace_key
  ON agent_notifications (workspace_id, finding_key);
