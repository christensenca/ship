/**
 * Blocker escalation check — called by external cron every 4h.
 * Fetches all active weeks, checks for issues with failed iterations >24h,
 * runs through graph pipeline, deduplicates notifications.
 */

import { v4 as uuid } from 'uuid';
import type {
  CheckBlockersRequest,
  CheckBlockersResponse,
  FleetGraphFinding,
} from '@ship/shared';
import { ShipAPIClient, type ShipIssue, type ShipWeek } from '../ship-api-client.js';
import { getFleetGraphConfig } from '../runtime.js';
import { buildFleetGraph, type FleetGraphStateType } from '../graph.js';
import type { InvocationContext } from '../state.js';
import { pool } from '../../db/client.js';

export async function runBlockerCheck(
  request: CheckBlockersRequest,
): Promise<CheckBlockersResponse> {
  const runId = uuid();
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  // Record run
  await pool.query(
    `INSERT INTO agent_runs (id, workspace_id, trigger_type, scope_type, status, started_at)
     VALUES ($1, $2, 'event', 'workspace', 'running', NOW())`,
    [runId, request.workspaceId],
  );

  try {
    // Fetch all active weeks
    const weeks = await client.listWeeks();
    const activeWeeks = weeks.filter(
      w => (w.properties as any).status === 'active',
    ) as ShipWeek[];

    const allFindings: FleetGraphFinding[] = [];
    let escalated = 0;
    let skipped = 0;

    for (const week of activeWeeks) {
      const graph = buildFleetGraph();

      const invocation: InvocationContext = {
        triggerType: 'event',
        viewType: 'week',
        documentId: week.id,
        workspaceId: request.workspaceId,
        correlationId: runId,
      };

      const result = await graph.invoke({
        invocation,
      }) as FleetGraphStateType;

      // Filter to blocker findings only
      const blockerFindings = result.detectedFindings.filter(f => f.category === 'blocker');

      // Dedup against agent_notifications
      for (const finding of blockerFindings) {
        const findingKey = `${finding.category}:${[...finding.relatedDocumentIds].sort().join(',')}`;

        const { rows } = await pool.query(
          `SELECT 1 FROM agent_notifications
           WHERE workspace_id = $1 AND finding_key = $2
           AND notified_at > NOW() - INTERVAL '24 hours'`,
          [request.workspaceId, findingKey],
        );

        if (rows.length > 0) {
          skipped++;
          continue;
        }

        // Upsert notification
        await pool.query(
          `INSERT INTO agent_notifications (workspace_id, finding_category, finding_key, notified_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (workspace_id, finding_key) DO UPDATE SET notified_at = NOW()`,
          [request.workspaceId, finding.category, findingKey],
        );

        allFindings.push(finding);
        escalated++;
      }
    }

    await pool.query(
      `UPDATE agent_runs SET status = 'completed', findings_count = $1, completed_at = NOW() WHERE id = $2`,
      [escalated, runId],
    );

    return { findings: allFindings, escalated, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE agent_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
      [message, runId],
    );
    console.error('Blocker check failed:', err);
    return { findings: [], escalated: 0, skipped: 0 };
  }
}
