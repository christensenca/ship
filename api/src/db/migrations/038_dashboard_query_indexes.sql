-- Migration 038: Add focused indexes for dashboard data queries

CREATE INDEX IF NOT EXISTS idx_documents_weekly_dashboard_lookup
ON documents (
  workspace_id,
  document_type,
  (properties->>'person_id'),
  ((properties->>'week_number')::int)
)
WHERE document_type IN ('weekly_plan', 'weekly_retro')
  AND archived_at IS NULL
  AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_standup_dashboard_lookup
ON documents (
  workspace_id,
  (properties->>'author_id'),
  (properties->>'date')
)
WHERE document_type = 'standup'
  AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_sprint_dashboard_week_project
ON documents (
  workspace_id,
  ((properties->>'sprint_number')::int),
  ((properties->>'project_id')::uuid)
)
WHERE document_type = 'sprint'
  AND deleted_at IS NULL
  AND properties ? 'project_id';

CREATE INDEX IF NOT EXISTS idx_documents_sprint_dashboard_assignee_ids
ON documents USING GIN ((properties->'assignee_ids'))
WHERE document_type = 'sprint'
  AND deleted_at IS NULL;
