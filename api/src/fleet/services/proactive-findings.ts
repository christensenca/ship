/**
 * Deprecated compatibility wrapper.
 *
 * The active proactive path is now the in-process assignment_changed event flow.
 */

import type {
  FleetGraphFinding,
  FleetGraphRecommendation,
  ProactiveFindingsRequest,
  ProactiveFindingsResponse,
} from '@ship/shared';

export async function runProactiveFindingsScan(
  _request: ProactiveFindingsRequest,
): Promise<ProactiveFindingsResponse> {
  return {
    findings: [],
    generatedAt: new Date().toISOString(),
  };
}

export function shapeRecommendations(
  _findings: FleetGraphFinding[],
): FleetGraphRecommendation[] {
  return [];
}
