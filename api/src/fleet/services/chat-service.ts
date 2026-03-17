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
  SuggestedIssue,
} from '@ship/shared';
import { buildFleetGraph, type FleetGraphStateType } from '../graph.js';
import type { InvocationContext } from '../state.js';
import { pool } from '../../db/client.js';
import { createActionService } from './action-service.js';
import { resolveActor } from './resolve-actor.js';

/**
 * Handle a chat message by invoking the full graph pipeline.
 */
export async function handleChat(request: ChatRequest, userId?: string): Promise<ChatResponse> {
  const runId = uuid();
  const startedAt = new Date();

  // Record run start
  await pool.query(
    `INSERT INTO agent_runs (id, workspace_id, trigger_type, scope_type, scope_id, status, started_at)
     VALUES ($1, $2, 'on_demand', $3, $4, 'running', $5)`,
    [runId, request.workspaceId, request.viewType, request.documentId ?? null, startedAt],
  );

  try {
    // Resolve authenticated user → person document
    const actor = userId ? await resolveActor(userId, request.workspaceId) : null;

    const graph = buildFleetGraph();

    const invocation: InvocationContext = {
      triggerType: 'on_demand',
      viewType: request.viewType,
      documentId: request.documentId,
      workspaceId: request.workspaceId,
      correlationId: runId,
      actorUserId: userId,
      actorPersonId: actor?.personId,
      actorName: actor?.name,
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

      const actionType = resolveActionType(r);
      const proposedChange = resolveProposedChange(r, userId);

      // Persist to agent_actions so approve/dismiss actually works
      const actionId = await actionService.createPendingAction({
        runId,
        workspaceId: request.workspaceId,
        actionType,
        targetDocumentId: r.affectedDocumentIds[0],
        proposedChange,
        description: r.reason,
        findingId: r.id,
      });

      if (actionId) {
        proposedActions.push({
          id: actionId,
          actionType,
          targetDocumentId: r.affectedDocumentIds[0],
          targetDocumentTitle: '',
          proposedChange,
          description: r.reason,
          findingId: r.id,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Build suggestedIssues from actor's fetched issues for personalized recommendations
    const suggestedIssues = buildSuggestedIssues(result, userId);

    // Auto-generate a reassign action if we have suggested issues but no reassign action was created
    // This ensures "what should I work on next?" always produces an actionable card
    const topIssue = suggestedIssues[0];
    if (topIssue && !proposedActions.some(a => a.actionType === 'reassign') && userId) {
      const proposedChange = { field: 'assignee_id', old_value: null as unknown, new_value: userId };
      const actionId = await actionService.createPendingAction({
        runId,
        workspaceId: request.workspaceId,
        actionType: 'reassign',
        targetDocumentId: topIssue.documentId,
        proposedChange,
        description: topIssue.reason ?? `Assign yourself to "${topIssue.title}"`,
        findingId: `auto-assign-${runId}`,
      });
      if (actionId) {
        proposedActions.push({
          id: actionId,
          actionType: 'reassign',
          targetDocumentId: topIssue.documentId,
          targetDocumentTitle: topIssue.title,
          proposedChange,
          description: topIssue.reason ?? `Assign yourself to "${topIssue.title}"`,
          findingId: `auto-assign-${runId}`,
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
      message: result.llmSummary || result.fallback?.message || result.contextSummary || 'No analysis available.',
      findings: result.detectedFindings,
      proposedActions,
      suggestedIssues: suggestedIssues.length > 0 ? suggestedIssues : undefined,
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

const VALID_ACTION_TYPES = new Set<ActionType>(['move_issue', 'reassign', 'change_priority', 'change_state']);

function resolveActionType(r: FleetGraphRecommendation): ActionType {
  // Prefer the LLM's explicit actionType if valid
  if (r.actionType && VALID_ACTION_TYPES.has(r.actionType)) {
    return r.actionType;
  }
  // Fall back to type-based mapping
  switch (r.type) {
    case 'escalate': return 'change_state';
    case 'reassign': return 'reassign';
    case 'rescope': return 'move_issue';
    case 'review_blocker': return 'change_state';
    default: return 'change_state';
  }
}

function resolveProposedChange(
  r: FleetGraphRecommendation,
  actorUserId?: string,
): { field: string; old_value: unknown; new_value: unknown } {
  // Prefer the LLM's explicit proposedChange if it has a real field
  if (r.proposedChange && r.proposedChange.field) {
    return r.proposedChange;
  }
  // Fall back to type-based defaults
  switch (r.type) {
    case 'escalate':
      return { field: 'state', old_value: null, new_value: 'blocked' };
    case 'reassign':
      return { field: 'assignee_id', old_value: null, new_value: actorUserId ?? null };
    case 'rescope':
      return { field: 'state', old_value: null, new_value: 'backlog' };
    case 'review_blocker':
      return { field: 'state', old_value: null, new_value: 'todo' };
    default:
      return { field: 'state', old_value: null, new_value: null };
  }
}

function buildSuggestedIssues(result: FleetGraphStateType, actorUserId?: string): SuggestedIssue[] {
  if (!actorUserId) return [];

  // Prioritize unassigned issues, then include actor's own — candidates for "work on next"
  const issues = result.fetchedResources
    .filter(r => r.document_type === 'issue')
    .filter(r => {
      const assigneeId = (r.properties as any)?.assignee_id;
      return !assigneeId || assigneeId === actorUserId;
    })
    .filter(r => {
      const state = (r.properties as any)?.state;
      return state && !['done', 'cancelled'].includes(state);
    });

  if (issues.length === 0) return [];

  // Deduplicate by ID (actor issues may overlap with project-scoped issues)
  const seen = new Set<string>();
  const deduped = issues.filter(issue => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });

  // Sort: unassigned first (actionable), then already-assigned
  deduped.sort((a, b) => {
    const aAssigned = !!(a.properties as any)?.assignee_id;
    const bAssigned = !!(b.properties as any)?.assignee_id;
    if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
    return 0;
  });

  // Cross-reference with recommendations for reasons
  const recsByDocId = new Map<string, string>();
  for (const r of result.recommendedActions) {
    for (const docId of r.affectedDocumentIds) {
      recsByDocId.set(docId, r.reason);
    }
  }

  return deduped.slice(0, 10).map(issue => ({
    documentId: issue.id,
    title: issue.title ?? 'Untitled',
    state: (issue.properties as any)?.state ?? 'unknown',
    priority: (issue.properties as any)?.priority ?? 'medium',
    reason: recsByDocId.get(issue.id),
  }));
}
