/**
 * T018: Proactive findings orchestration and recommendation shaping.
 *
 * Orchestrates the week-risk detectors and shapes findings into
 * recommendations for the API response.
 */

import { v4 as uuid } from 'uuid';
import type {
  FleetGraphFinding,
  FleetGraphRecommendation,
  ProactiveFindingsRequest,
  ProactiveFindingsResponse,
} from '@ship/shared';
import { ShipAPIClient, type ShipIssue, type ShipWeek } from '../ship-api-client.js';
import { getFleetGraphConfig } from '../runtime.js';
import { runWeekRiskDetectors } from '../detectors/week-risk.js';

/**
 * Run a proactive findings scan for a given scope.
 */
export async function runProactiveFindingsScan(
  request: ProactiveFindingsRequest,
): Promise<ProactiveFindingsResponse> {
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  let findings: FleetGraphFinding[] = [];

  if (request.scopeType === 'week' && request.scopeId) {
    findings = await scanWeekScope(client, request.scopeId);
  } else if (request.scopeType === 'workspace') {
    findings = await scanWorkspaceScope(client);
  }
  // project and program scope stubs for future phases

  return {
    findings,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Scan a single week for risk findings.
 */
async function scanWeekScope(
  client: ShipAPIClient,
  weekId: string,
): Promise<FleetGraphFinding[]> {
  try {
    const [week, issues] = await Promise.all([
      client.getWeek(weekId),
      client.getWeekIssues(weekId),
    ]);

    return runWeekRiskDetectors(issues as ShipIssue[], week as ShipWeek);
  } catch (err) {
    console.error('Week scope scan failed:', err);
    return [];
  }
}

/**
 * Scan all active weeks in the workspace.
 */
async function scanWorkspaceScope(
  client: ShipAPIClient,
): Promise<FleetGraphFinding[]> {
  try {
    const weeks = await client.listWeeks();
    const activeWeeks = weeks.filter(
      w => (w.properties as any).status === 'active',
    );

    const allFindings: FleetGraphFinding[] = [];
    for (const week of activeWeeks) {
      const issues = await client.getWeekIssues(week.id);
      const findings = runWeekRiskDetectors(
        issues as ShipIssue[],
        week as ShipWeek,
      );
      allFindings.push(...findings);
    }

    return allFindings;
  } catch (err) {
    console.error('Workspace scope scan failed:', err);
    return [];
  }
}

/**
 * Shape findings into actionable recommendations.
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
