import { v4 as uuid } from 'uuid';
import type {
  ActionShape,
  AgentInvocationContext,
  AgentResult,
  AssignmentChangedEventPayload,
  ChatMessage,
  ChatRequest,
} from '@ship/shared';
import { pool } from '../../db/client.js';
import { buildFleetGraph, type FleetGraphStateType } from '../graph.js';
import { logFleetGraph } from '../observability.js';
import { createActionService } from './action-service.js';
import { resolveActor } from './resolve-actor.js';
import { createInitialState } from '../state.js';

export async function invokeChatAgent(request: ChatRequest, userId?: string): Promise<AgentResult> {
  const runId = uuid();
  const actor = userId ? await resolveActor(userId, request.workspaceId) : null;

  const invocation: AgentInvocationContext = {
    mode: 'chat',
    triggerType: 'on_demand',
    workspaceId: request.workspaceId,
    viewType: request.viewType,
    documentId: request.documentId,
    actorUserId: userId,
    actorPersonId: actor?.personId,
    actorName: actor?.name,
    scope: {
      issueId: request.viewType === 'issue' ? request.documentId : undefined,
      projectId: request.viewType === 'project' ? request.documentId : undefined,
      weekId: request.viewType === 'week' ? request.documentId : undefined,
      personId: request.viewType === 'person' ? request.documentId : actor?.personId,
    },
    correlationId: runId,
  };

  return invokeAgent(invocation, request.messages, runId);
}

export async function invokeAssignmentChangedAgent(eventPayload: AssignmentChangedEventPayload): Promise<AgentResult> {
  const runId = uuid();

  const invocation: AgentInvocationContext = {
    mode: 'event',
    triggerType: 'event',
    workspaceId: eventPayload.workspaceId,
    viewType: eventPayload.projectId ? 'project' : 'issue',
    documentId: eventPayload.issueId,
    scope: {
      issueId: eventPayload.issueId,
      projectId: eventPayload.projectId,
      personId: eventPayload.newAssigneeId ?? undefined,
    },
    eventType: 'assignment_changed',
    eventPayload,
    correlationId: runId,
  };

  return invokeAgent(invocation, undefined, runId);
}

async function invokeAgent(
  invocation: AgentInvocationContext,
  chatMessages: ChatMessage[] | undefined,
  runId: string,
): Promise<AgentResult> {
  logFleetGraph({
    level: 'info',
    correlationId: invocation.correlationId,
    action: 'invoke',
    message: 'Starting FleetGraph agent run',
    metadata: {
      runId,
      mode: invocation.mode,
      viewType: invocation.viewType,
      documentId: invocation.documentId ?? null,
      workspaceId: invocation.workspaceId,
      actorUserId: invocation.actorUserId ?? null,
      actorPersonId: invocation.actorPersonId ?? null,
      messages: chatMessages?.map((message) => ({ role: message.role, content: message.content })) ?? [],
    },
  });

  await pool.query(
    `INSERT INTO agent_runs (id, workspace_id, trigger_type, scope_type, scope_id, status, started_at)
     VALUES ($1, $2, $3, $4, $5, 'running', NOW())`,
    [
      runId,
      invocation.workspaceId,
      invocation.triggerType,
      invocation.viewType,
      invocation.documentId ?? invocation.scope?.projectId ?? invocation.scope?.personId ?? null,
    ],
  );

  try {
    const graph = buildFleetGraph();
    const result = await graph.invoke(createInitialState(invocation, chatMessages)) as FleetGraphStateType;

    const proposedActions = await persistCandidateAction(runId, invocation.workspaceId, result);
    const summary = result.llmSummary || result.fallback?.message || result.contextSummary || 'No analysis available.';

    logFleetGraph({
      level: 'info',
      correlationId: invocation.correlationId,
      action: 'invoke',
      message: 'Completed FleetGraph agent run',
      metadata: {
        runId,
        summary,
        findingsCount: result.detectedFindings.length,
        hasCandidateAction: !!result.candidateAction,
        candidateAction: result.candidateAction ?? null,
        proposedActionsCount: proposedActions.length,
        degradationTier: result.degradationTier,
      },
    });

    await pool.query(
      `UPDATE agent_runs
         SET status = 'completed',
             findings_count = $1,
             actions_proposed = $2,
             degradation_tier = $3,
             completed_at = NOW()
       WHERE id = $4`,
      [result.detectedFindings.length, proposedActions.length, result.degradationTier, runId],
    );

    return {
      runId,
      summary,
      findings: result.detectedFindings,
      proposedActions,
      degradationTier: result.degradationTier,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logFleetGraph({
      level: 'error',
      correlationId: invocation.correlationId,
      action: 'invoke',
      message: 'FleetGraph agent run failed',
      metadata: { runId, error: message },
    });
    await pool.query(
      `UPDATE agent_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
      [message, runId],
    );
    return {
      runId,
      summary: 'FleetGraph could not complete this run. Please try again.',
      findings: [],
      proposedActions: [],
      degradationTier: 'offline',
    };
  }
}

async function persistCandidateAction(
  runId: string,
  workspaceId: string,
  result: FleetGraphStateType,
): Promise<ActionShape[]> {
  if (!result.candidateAction) return [];

  const actionService = createActionService();
  const actionId = await actionService.createPendingAction({
    runId,
    workspaceId,
    actionType: 'reassign',
    targetDocumentId: result.candidateAction.targetDocumentId,
    proposedChange: result.candidateAction.proposedChange,
    description: result.candidateAction.description,
    findingId: result.candidateAction.findingId,
  });

  if (!actionId) return [];

  return [{
    id: actionId,
    actionType: 'reassign',
    targetDocumentId: result.candidateAction.targetDocumentId,
    targetDocumentTitle: result.candidateAction.targetDocumentTitle,
    proposedChange: result.candidateAction.proposedChange,
    description: result.candidateAction.description,
    findingId: result.candidateAction.findingId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }];
}
