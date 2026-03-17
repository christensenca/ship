import { useQuery } from '@tanstack/react-query';
import type { ProactiveFindingsResponse, FleetGraphScopeType } from '@ship/shared';

const SCOPE_MAP: Record<string, FleetGraphScopeType | null> = {
  sprint: 'week',
  project: 'project',
  program: 'program',
  issue: null,    // too granular
  person: null,   // not supported yet
  wiki: null,
  weekly_plan: 'week',
  weekly_retro: 'week',
  standup: null,
};

async function fetchProactiveFindings(
  workspaceId: string,
  scopeType: FleetGraphScopeType,
  scopeId?: string,
): Promise<ProactiveFindingsResponse> {
  const csrfRes = await fetch('/api/csrf-token', { credentials: 'include' });
  const { token } = await csrfRes.json();

  const res = await fetch('/api/agent/proactive-findings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    credentials: 'include',
    body: JSON.stringify({
      workspaceId,
      scopeType,
      scopeId,
      triggerType: 'event',
    }),
  });

  if (!res.ok) throw new Error(`Proactive scan failed: ${res.status}`);
  return res.json();
}

export function useProactiveScan(
  workspaceId: string | undefined,
  documentId: string | null,
  documentType: string | null,
) {
  const scopeType = documentType ? SCOPE_MAP[documentType] ?? null : null;

  return useQuery({
    queryKey: ['proactive-scan', workspaceId, documentId, documentType],
    queryFn: () => fetchProactiveFindings(workspaceId!, scopeType!, documentId ?? undefined),
    enabled: !!workspaceId && !!scopeType,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
