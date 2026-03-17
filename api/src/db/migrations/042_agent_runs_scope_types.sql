-- Expand agent_runs scope_type to include all view types (issue, person).
-- Chat can be invoked from any document view.

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_scope_type_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_scope_type_check
  CHECK (scope_type IN ('workspace', 'week', 'project', 'program', 'issue', 'person'));
