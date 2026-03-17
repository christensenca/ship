-- Agent actions proposed by FleetGraph awaiting human approval.
-- Part of FleetGraph agent graph architecture (002-fleetgraph-graph-arch).

CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('move_issue', 'reassign', 'change_priority', 'change_state')),
  target_document_id UUID NOT NULL,
  description TEXT NOT NULL,
  proposed_change JSONB NOT NULL,
  finding_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed', 'snoozed', 'expired', 'executed')),
  decision_by UUID,
  decided_at TIMESTAMPTZ,
  snooze_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_actions_workspace_status_created
  ON agent_actions (workspace_id, status, created_at);

-- Prevent duplicate pending proposals for the same document + action type
CREATE UNIQUE INDEX idx_agent_actions_pending_unique
  ON agent_actions (workspace_id, target_document_id, action_type)
  WHERE status = 'pending';
