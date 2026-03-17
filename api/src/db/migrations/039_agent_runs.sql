-- Agent run audit trail for every graph invocation.
-- Part of FleetGraph agent graph architecture (002-fleetgraph-graph-arch).

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'event', 'on_demand')),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace', 'week', 'project', 'program')),
  scope_id UUID,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  findings_count INTEGER NOT NULL DEFAULT 0,
  actions_proposed INTEGER NOT NULL DEFAULT 0,
  degradation_tier TEXT NOT NULL DEFAULT 'full' CHECK (degradation_tier IN ('full', 'partial', 'offline')),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_runs_workspace_started
  ON agent_runs (workspace_id, started_at DESC);

CREATE INDEX idx_agent_runs_workspace_trigger_started
  ON agent_runs (workspace_id, trigger_type, started_at DESC);
