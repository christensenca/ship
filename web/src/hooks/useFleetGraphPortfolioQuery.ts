/**
 * T037: Portfolio summary query hooks.
 */

import { useMutation } from '@tanstack/react-query';
import type { PortfolioSummaryResponse } from '@ship/shared';

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

export function usePortfolioSummary() {
  return useMutation({
    mutationFn: ({
      workspaceId,
      programIds,
    }: {
      workspaceId: string;
      programIds?: string[];
    }) =>
      apiPost<PortfolioSummaryResponse>('/portfolio-summary', {
        workspaceId,
        programIds,
      }),
  });
}
