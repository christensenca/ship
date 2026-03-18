import { v4 as uuid } from 'uuid';
import type { FleetGraphStateType } from '../graph.js';

export async function hitlGateNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  if (!state.candidateAction) {
    return {};
  }

  return {
    approvalRequirements: [{
      gateId: `gate-${uuid()}`,
      gateType: 'mutation',
      decisionOwner: state.invocation.actorUserId ?? state.invocation.eventPayload?.changedByUserId,
      decisionReason: state.candidateAction.description,
      status: 'pending',
      blockedActionIds: [state.candidateAction.targetDocumentId],
    }],
  };
}
