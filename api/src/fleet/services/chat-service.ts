/**
 * Multi-turn chat session management — stateless, client-side history.
 * Invokes the full graph pipeline with trigger_type='on_demand'.
 */

import { v4 as uuid } from 'uuid';
import type {
  ChatRequest,
  ChatResponse,
  ActionShape,
  ActionType,
  FleetGraphFinding,
  FleetGraphRecommendation,
} from '@ship/shared';
import { buildFleetGraph, type FleetGraphStateType } from '../graph.js';
import type { InvocationContext } from '../state.js';
import { pool } from '../../db/client.js';
import { createActionService } from './action-service.js';

/**
 * Handle a chat message by invoking the full graph pipeline.
 */
export async function handleChat(request: ChatRequest): Promise<ChatResponse> {
  const runId = uuid();
  const startedAt = new Date();

  // Record run start
  await pool.query(
    `INSERT INTO agent_runs (id, workspace_id, trigger_type, scope_type, scope_id, status, started_at)
     VALUES ($1, $2, 'on_demand', $3, $4, 'running', $5)`,
    [runId, request.workspaceId, request.viewType, request.documentId ?? null, startedAt],
  );

  try {
    const graph = buildFleetGraph();

    const invocation: InvocationContext = {
      triggerType: 'on_demand',
      viewType: request.viewType,
      documentId: request.documentId,
      workspaceId: request.workspaceId,
      correlationId: runId,
    };

    const result = await graph.invoke({
      invocation,
      chatMessages: request.messages.slice(-10), // Max 10 messages
    }) as FleetGraphStateType;

    // Only create ActionShapes for recommendations that target a specific document
    // Generic recommendations (no target document) are informational only
    const actionService = createActionService();
    const proposedActions: ActionShape[] = [];
    for (const r of result.recommendedActions) {
      if (r.approvalStatus !== 'pending' || r.affectedDocumentIds.length === 0 || !r.affectedDocumentIds[0]) {
        continue;
      }

      // Persist to agent_actions so approve/dismiss actually works
      const actionId = await actionService.createPendingAction({
        runId,
        workspaceId: request.workspaceId,
        actionType: mapRecommendationToActionType(r.type),
        targetDocumentId: r.affectedDocumentIds[0],
        proposedChange: mapRecommendationToChange(r),
        description: r.reason,
        findingId: r.id,
      });

      if (actionId) {
        proposedActions.push({
          id: actionId,
          actionType: mapRecommendationToActionType(r.type),
          targetDocumentId: r.affectedDocumentIds[0],
          targetDocumentTitle: '',
          proposedChange: mapRecommendationToChange(r),
          description: r.reason,
          findingId: r.id,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Update run record
    await pool.query(
      `UPDATE agent_runs SET status = 'completed', findings_count = $1, actions_proposed = $2,
       degradation_tier = $3, completed_at = NOW() WHERE id = $4`,
      [result.detectedFindings.length, proposedActions.length, result.degradationTier ?? 'full', runId],
    );

    return {
      message: result.contextSummary || result.fallback?.message || 'No analysis available.',
      findings: result.detectedFindings,
      proposedActions,
      degradationTier: result.degradationTier ?? 'full',
      refetchedScope: true, // Always true for now (stateless)
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE agent_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
      [message, runId],
    );
    console.error('Chat service error:', err);
    return {
      message: 'Sorry, I encountered an error processing your request. Please try again.',
      findings: [],
      proposedActions: [],
      degradationTier: 'offline',
      refetchedScope: false,
    };
  }
}

function mapRecommendationToActionType(type: string): ActionType {
  switch (type) {
    case 'escalate': return 'change_state';
    case 'reassign': return 'reassign';
    case 'rescope': return 'move_issue';
    case 'review_blocker': return 'change_state';
    case 'change_state': return 'change_state';
    default: return 'change_state';
  }
}

function mapRecommendationToChange(r: FleetGraphRecommendation): { field: string; old_value: unknown; new_value: unknown } {
  switch (r.type) {
    case 'escalate':
      return { field: 'state', old_value: null, new_value: 'blocked' };
    case 'rescope':
      return { field: 'state', old_value: null, new_value: 'backlog' };
    case 'review_blocker':
      return { field: 'state', old_value: null, new_value: 'todo' };
    default:
      return { field: 'state', old_value: null, new_value: null };
  }
}
