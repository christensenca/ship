import { v4 as uuid } from 'uuid';
import type { FleetGraphStateType } from '../graph.js';

export type ActionRoute = 'cleanResponse' | 'actionPlanning' | 'fallbackHandler';

export async function actionNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { candidateAction } = state;
  if (!candidateAction) {
    return {};
  }

  return {
    recommendedActions: [{
      id: `rec-${uuid()}`,
      type: 'reassign',
      reason: candidateAction.description,
      expectedImpact: 'Reduces assignment drift and keeps the next best owner on the work.',
      approvalStatus: 'pending',
      affectedDocumentIds: [candidateAction.targetDocumentId],
      actionType: 'reassign',
      proposedChange: candidateAction.proposedChange,
    }],
  };
}

export function actionRouter(state: FleetGraphStateType): ActionRoute {
  if (state.errors.length > 0 && state.fetchedResources.length === 0) {
    return 'fallbackHandler';
  }

  return state.candidateAction ? 'actionPlanning' : 'cleanResponse';
}
