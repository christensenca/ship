/**
 * T020: Week findings and recommendation mutation hooks.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ProactiveFindingsResponse,
  RecommendationDecisionResponse,
} from '@ship/shared';

const API_BASE = '/api/agent';

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const csrfRes = await fetch('/api/csrf-token', { credentials: 'include' });
  const { token } = await csrfRes.json();

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`FleetGraph API error: ${res.status}`);
  }

  return res.json();
}

export const fleetGraphWeekKeys = {
  all: ['fleetgraph-week'] as const,
  findings: (weekId: string) => ['fleetgraph-week', 'findings', weekId] as const,
};

export function useWeekFindingsQuery(weekId: string, workspaceId: string) {
  return useQuery({
    queryKey: fleetGraphWeekKeys.findings(weekId),
    queryFn: () =>
      apiPost<ProactiveFindingsResponse>('/proactive-findings', {
        workspaceId,
        scopeType: 'week',
        scopeId: weekId,
      }),
    enabled: !!weekId && !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useConfirmRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      recommendationId,
      decision,
      comment,
    }: {
      recommendationId: string;
      decision: 'approve' | 'reject';
      comment?: string;
    }) =>
      apiPost<RecommendationDecisionResponse>(
        `/recommendations/${recommendationId}/confirm`,
        { decision, comment },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fleetGraphWeekKeys.all });
    },
  });
}
