/**
 * Unified context node — extracts trigger type, view metadata, actor, workspace,
 * and time window from the invocation. No LLM call.
 */

import type { FleetGraphStateType } from '../graph.js';

export async function contextNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { invocation } = state;
  const { triggerType, viewType, documentId, workspaceId } = invocation;

  const parts: string[] = [];

  if (triggerType === 'scheduled') {
    parts.push('Scheduled proactive scan');
  } else if (triggerType === 'event') {
    parts.push('Event-triggered analysis');
  } else {
    parts.push('On-demand analysis');
  }

  parts.push(`for ${viewType} view`);

  if (documentId) {
    parts.push(`(document: ${documentId})`);
  }

  parts.push(`in workspace ${workspaceId}`);

  return {
    contextSummary: parts.join(' '),
  };
}
