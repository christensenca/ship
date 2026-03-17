/**
 * Action service — CRUD for agent_actions table.
 * Handles approve/dismiss/snooze decisions and mutation execution.
 */

import type {
  ActionDecideRequest,
  ActionDecideResponse,
  ActionShape,
  ActionType,
} from '@ship/shared';
import { ShipAPIClient, ShipAPIError } from '../ship-api-client.js';
import { getFleetGraphConfig } from '../runtime.js';
import { pool } from '../../db/client.js';

export interface ActionService {
  createPendingAction(params: {
    runId: string;
    workspaceId: string;
    actionType: ActionType;
    targetDocumentId: string;
    proposedChange: { field: string; old_value: unknown; new_value: unknown };
    description: string;
    findingId: string;
  }): Promise<string>;

  listActions(workspaceId: string, status?: string): Promise<ActionShape[]>;

  decideAction(actionId: string, decision: ActionDecideRequest, userId?: string): Promise<ActionDecideResponse>;

  expireStaleActions(workspaceId: string): Promise<number>;
}

export function createActionService(): ActionService {
  return {
    async createPendingAction(params) {
      const { rows } = await pool.query(
        `INSERT INTO agent_actions (run_id, workspace_id, action_type, target_document_id, proposed_change, description, finding_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (workspace_id, target_document_id, action_type) WHERE status = 'pending'
         DO UPDATE SET description = EXCLUDED.description, proposed_change = EXCLUDED.proposed_change, run_id = EXCLUDED.run_id
         RETURNING id`,
        [params.runId, params.workspaceId, params.actionType, params.targetDocumentId, JSON.stringify(params.proposedChange), params.description, params.findingId],
      );
      return rows[0]?.id ?? '';
    },

    async listActions(workspaceId, status = 'pending') {
      const { rows } = await pool.query(
        `SELECT a.id, a.action_type, a.target_document_id, a.proposed_change, a.description, a.finding_id, a.status, a.created_at,
                d.title as target_document_title
         FROM agent_actions a
         LEFT JOIN documents d ON d.id = a.target_document_id
         WHERE a.workspace_id = $1 AND a.status = $2
         ORDER BY a.created_at DESC`,
        [workspaceId, status],
      );

      return rows.map(r => ({
        id: r.id,
        actionType: r.action_type as ActionType,
        targetDocumentId: r.target_document_id,
        targetDocumentTitle: r.target_document_title ?? '',
        proposedChange: typeof r.proposed_change === 'string' ? JSON.parse(r.proposed_change) : r.proposed_change,
        description: r.description,
        findingId: r.finding_id,
        status: r.status,
        createdAt: r.created_at,
      }));
    },

    async decideAction(actionId, decision, userId) {
      const { decision: decisionType, snoozeHours, comment, targetDocumentId: overrideDocId } = decision;

      if (decisionType === 'approve') {
        // Fetch the action details
        const { rows } = await pool.query(
          `SELECT * FROM agent_actions WHERE id = $1 AND status = 'pending'`,
          [actionId],
        );

        if (rows.length === 0) {
          throw new Error(`Action ${actionId} not found or not pending`);
        }

        const action = rows[0];
        const proposedChange = typeof action.proposed_change === 'string'
          ? JSON.parse(action.proposed_change)
          : action.proposed_change;

        // Allow override of target document (e.g. user picks a different issue from dropdown)
        const effectiveDocId = overrideDocId ?? action.target_document_id;
        if (overrideDocId && overrideDocId !== action.target_document_id) {
          await pool.query(
            `UPDATE agent_actions SET target_document_id = $1 WHERE id = $2`,
            [overrideDocId, actionId],
          );
        }

        // Execute the mutation via Ship API
        const config = getFleetGraphConfig();
        const client = new ShipAPIClient({
          baseUrl: config.shipApiBaseUrl,
          apiToken: config.shipApiToken,
        });

        console.log('[ActionService] Executing patchIssue:', {
          docId: effectiveDocId,
          field: proposedChange.field,
          newValue: proposedChange.new_value,
        });

        try {
          await client.patchIssue(effectiveDocId, {
            [proposedChange.field]: proposedChange.new_value,
          });
        } catch (patchErr) {
          // Treat "No fields to update" as success — desired state already achieved
          if (patchErr instanceof ShipAPIError && patchErr.statusCode === 400 && patchErr.responseBody?.includes('No fields to update')) {
            console.log('[ActionService] No-op: field already has desired value');
          } else {
            if (patchErr instanceof ShipAPIError) {
              console.error('[ActionService] patchIssue failed:', patchErr.statusCode, patchErr.responseBody);
            }
            throw patchErr;
          }
        }

        // Update action status
        await pool.query(
          `UPDATE agent_actions SET status = 'executed', decision_by = $1, decided_at = NOW() WHERE id = $2`,
          [userId ?? null, actionId],
        );

        return {
          actionId,
          status: 'approved' as const,
          executionResult: {
            success: true,
            documentId: action.target_document_id,
            changeApplied: proposedChange,
          },
        };
      }

      if (decisionType === 'dismiss') {
        await pool.query(
          `UPDATE agent_actions SET status = 'dismissed', decision_by = $1, decided_at = NOW() WHERE id = $2`,
          [userId ?? null, actionId],
        );

        return { actionId, status: 'dismissed' as const };
      }

      if (decisionType === 'snooze') {
        const hours = snoozeHours ?? 24;
        await pool.query(
          `UPDATE agent_actions SET status = 'snoozed', decision_by = $1, decided_at = NOW(),
           snooze_until = NOW() + INTERVAL '1 hour' * $3 WHERE id = $2`,
          [userId ?? null, actionId, hours],
        );

        return { actionId, status: 'snoozed' as const };
      }

      throw new Error(`Unknown decision: ${decisionType}`);
    },

    async expireStaleActions(workspaceId) {
      const { rowCount } = await pool.query(
        `UPDATE agent_actions SET status = 'expired'
         WHERE workspace_id = $1 AND status = 'pending'
         AND created_at < NOW() - INTERVAL '48 hours'`,
        [workspaceId],
      );

      return rowCount ?? 0;
    },
  };
}
