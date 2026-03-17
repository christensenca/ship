/**
 * T028: Contextual guidance and draft-generation hooks.
 */

import { useMutation } from '@tanstack/react-query';
import type {
  ContextualGuidanceResponse,
  CreateDraftResponse,
  FleetGraphViewType,
  DraftType,
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

export function useContextualGuidance() {
  return useMutation({
    mutationFn: ({
      workspaceId,
      viewType,
      documentId,
      prompt,
    }: {
      workspaceId: string;
      viewType: FleetGraphViewType;
      documentId?: string;
      prompt?: string;
    }) =>
      apiPost<ContextualGuidanceResponse>('/contextual-guidance', {
        workspaceId,
        viewType,
        documentId,
        prompt,
      }),
  });
}

export function useGenerateDraft() {
  return useMutation({
    mutationFn: ({
      workspaceId,
      draftType,
      sourceContext,
      persist,
    }: {
      workspaceId: string;
      draftType: DraftType;
      sourceContext: Record<string, unknown>;
      persist?: boolean;
    }) =>
      apiPost<CreateDraftResponse>('/drafts', {
        workspaceId,
        draftType,
        sourceContext,
        persist,
      }),
  });
}
