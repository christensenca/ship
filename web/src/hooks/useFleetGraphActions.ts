/**
 * Hooks for FleetGraph action management — list, approve, dismiss, snooze.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ActionListResponse,
  ActionDecideResponse,
  ActionDecision,
} from '@ship/shared';

const API_BASE = '/api/agent';

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`FleetGraph API error: ${res.status}`);
  }

  return res.json();
}

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

export function useFleetGraphActions(workspaceId: string) {
  return useQuery({
    queryKey: ['fleetgraph-actions', workspaceId],
    queryFn: () => apiGet<ActionListResponse>(`/actions?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useActionDecide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      actionId,
      decision,
      snoozeHours,
      comment,
    }: {
      actionId: string;
      decision: ActionDecision;
      snoozeHours?: number;
      comment?: string;
    }) =>
      apiPost<ActionDecideResponse>(`/actions/${actionId}/decide`, {
        decision,
        snoozeHours,
        comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleetgraph-actions'] });
    },
  });
}
