import type { FleetGraphStateType } from '../graph.js';

export async function contextNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { invocation } = state;
  const parts: string[] = [];

  if (invocation.mode === 'chat') {
    parts.push(invocation.actorName ? `${invocation.actorName} asked FleetGraph for work guidance` : 'On-demand work guidance');
  } else {
    parts.push('Assignment change event received');
  }

  parts.push(`view=${invocation.viewType}`);

  if (invocation.documentId) {
    parts.push(`document=${invocation.documentId}`);
  }

  if (invocation.eventType === 'assignment_changed' && invocation.eventPayload) {
    parts.push(`issue=${invocation.eventPayload.issueId}`);
    parts.push(`oldAssignee=${invocation.eventPayload.oldAssigneeId ?? 'none'}`);
    parts.push(`newAssignee=${invocation.eventPayload.newAssigneeId ?? 'none'}`);
  }

  parts.push(`workspace=${invocation.workspaceId}`);

  return {
    contextSummary: parts.join(' | '),
  };
}
