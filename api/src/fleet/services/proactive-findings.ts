/**
 * Proactive findings orchestration — wires through the full FleetGraph graph pipeline.
 * Persists runs to agent_runs, checks notification dedup via agent_notifications.
 */

import { v4 as uuid } from 'uuid';
import type {
  FleetGraphFinding,
  FleetGraphRecommendation,
  FleetGraphViewType,
  ProactiveFindingsRequest,
  ProactiveFindingsResponse,
} from '@ship/shared';
import { buildFleetGraph, type FleetGraphStateType } from '../graph.js';
import type { InvocationContext } from '../state.js';
import { pool } from '../../db/client.js';

/**
 * Run a proactive findings scan for a given scope using the full graph pipeline.
 */
export async function runProactiveFindingsScan(
  request: ProactiveFindingsRequest,
): Promise<ProactiveFindingsResponse> {
  const runId = uuid();
  const startedAt = new Date();

  // Record run start
  await pool.query(
    `INSERT INTO agent_runs (id, workspace_id, trigger_type, scope_type, scope_id, status, started_at)
     VALUES ($1, $2, $3, $4, $5, 'running', $6)`,
    [runId, request.workspaceId, request.triggerType ?? 'scheduled', request.scopeType, request.scopeId ?? null, startedAt],
  );

  try {
    const graph = buildFleetGraph();

    const invocation: InvocationContext = {
      triggerType: request.triggerType ?? 'scheduled',
      viewType: request.scopeType === 'workspace' ? 'workspace' : request.scopeType as FleetGraphViewType,
      documentId: request.scopeId,
      workspaceId: request.workspaceId,
      correlationId: runId,
    };

    const result = await graph.invoke({
      invocation,
    }) as FleetGraphStateType;

    // Apply notification dedup
    const { surfaced, skipped } = await deduplicateFindings(
      request.workspaceId,
      result.detectedFindings,
    );

    // Update run record
    await pool.query(
      `UPDATE agent_runs SET status = 'completed', findings_count = $1, actions_proposed = $2,
       degradation_tier = $3, completed_at = NOW() WHERE id = $4`,
      [surfaced.length, result.recommendedActions.length, result.degradationTier ?? 'full', runId],
    );

    return {
      findings: surfaced,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE agent_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
      [message, runId],
    );
    console.error('Proactive findings scan failed:', err);
    return { findings: [], generatedAt: new Date().toISOString() };
  }
}

/**
 * Check notification dedup — filter out findings already notified within 24h.
 */
async function deduplicateFindings(
  workspaceId: string,
  findings: FleetGraphFinding[],
): Promise<{ surfaced: FleetGraphFinding[]; skipped: number }> {
  const surfaced: FleetGraphFinding[] = [];
  let skipped = 0;

  for (const finding of findings) {
    const findingKey = computeFindingKey(finding);

    // Check if already notified within 24h
    const { rows } = await pool.query(
      `SELECT 1 FROM agent_notifications
       WHERE workspace_id = $1 AND finding_key = $2
       AND notified_at > NOW() - INTERVAL '24 hours'`,
      [workspaceId, findingKey],
    );

    if (rows.length > 0) {
      skipped++;
      continue;
    }

    // Upsert notification record
    await pool.query(
      `INSERT INTO agent_notifications (workspace_id, finding_category, finding_key, notified_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (workspace_id, finding_key) DO UPDATE SET notified_at = NOW()`,
      [workspaceId, finding.category, findingKey],
    );

    surfaced.push(finding);
  }

  return { surfaced, skipped };
}

/**
 * Compute a stable dedup key for a finding: category + sorted related document IDs.
 */
function computeFindingKey(finding: FleetGraphFinding): string {
  const sortedIds = [...finding.relatedDocumentIds].sort().join(',');
  return `${finding.category}:${sortedIds}`;
}

/**
 * Shape findings into actionable recommendations (kept for backward compatibility).
 */
export function shapeRecommendations(
  findings: FleetGraphFinding[],
): FleetGraphRecommendation[] {
  const recommendations: FleetGraphRecommendation[] = [];

  for (const finding of findings) {
    if (!finding.requiresHumanAction) continue;

    if (finding.category === 'blocker') {
      recommendations.push({
        id: `rec-${uuid()}`,
        type: 'review_blocker',
        reason: finding.rationale,
        expectedImpact: 'Unblock downstream work and restore progress.',
        approvalStatus: 'pending',
        affectedDocumentIds: finding.relatedDocumentIds,
      });
    }

    if (finding.category === 'slipping_scope') {
      recommendations.push({
        id: `rec-${uuid()}`,
        type: 'rescope',
        reason: finding.rationale,
        expectedImpact: 'Reduce week scope to achievable level.',
        approvalStatus: 'pending',
        affectedDocumentIds: finding.relatedDocumentIds,
      });
    }

    if (finding.category === 'planning_gap') {
      recommendations.push({
        id: `rec-${uuid()}`,
        type: 'approve_plan',
        reason: finding.rationale,
        expectedImpact: 'Ensures alignment before further execution.',
        approvalStatus: 'pending',
        affectedDocumentIds: finding.relatedDocumentIds,
      });
    }

    if (finding.category === 'stale_work') {
      recommendations.push({
        id: `rec-${uuid()}`,
        type: 'escalate',
        reason: finding.rationale,
        expectedImpact: 'Restore momentum on stalled work.',
        approvalStatus: 'pending',
        affectedDocumentIds: finding.relatedDocumentIds,
      });
    }
  }

  return recommendations;
}
