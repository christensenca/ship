/**
 * Action node — routes based on findings:
 * - No findings → clean path (END)
 * - Findings without mutations → notify path
 * - Findings with mutation recommendations → persist-action path
 *
 * Returns a routing key for conditional edges.
 */

import type { FleetGraphStateType } from '../graph.js';

export type ActionRoute = 'clean' | 'notify' | 'persist_action';

export async function actionNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  // Action node doesn't modify state — routing is handled by the conditional edge function.
  // It exists as a decision point in the graph.
  return {};
}

/**
 * Routing function for conditional edges after the action node.
 */
export function actionRouter(state: FleetGraphStateType): ActionRoute {
  const { detectedFindings, recommendedActions } = state;

  if (detectedFindings.length === 0) {
    return 'clean';
  }

  // Check if any recommendations suggest mutations (have pending approval)
  const hasMutations = recommendedActions.some(r => r.approvalStatus === 'pending');

  if (hasMutations) {
    return 'persist_action';
  }

  return 'notify';
}
