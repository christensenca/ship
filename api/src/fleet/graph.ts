import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type {
  ActionShape,
  ChatMessage,
  DegradationTier,
  FleetGraphFallback,
  FleetGraphFinding,
  FleetGraphRecommendation,
} from '@ship/shared';
import type { ApprovalGate, CandidateAction, FallbackEvent, PreparedIssueCandidate } from './state.js';
import type { AgentInvocationContext } from '@ship/shared';
import type { ShipDocument } from './ship-api-client.js';

import { contextNode } from './nodes/context-node.js';
import { fetchNode } from './nodes/fetch-node.js';
import { candidateNode } from './nodes/candidate-node.js';
import { reasoningNode } from './nodes/reasoning-node.js';
import { actionNode, actionRouter } from './nodes/action-node.js';
import { hitlGateNode } from './nodes/hitl-gate-node.js';
import { surfaceActionNode } from './nodes/surface-action-node.js';
import { cleanResponseNode } from './nodes/clean-response-node.js';
import { fallbackNode } from './nodes/fallback-node.js';

export const FleetGraphAnnotation = Annotation.Root({
  invocation: Annotation<AgentInvocationContext>,
  contextSummary: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  fetchedResources: Annotation<ShipDocument[]>({ reducer: (_, b) => b, default: () => [] }),
  detectedFindings: Annotation<FleetGraphFinding[]>({ reducer: (_, b) => b, default: () => [] }),
  recommendedActions: Annotation<FleetGraphRecommendation[]>({ reducer: (_, b) => b, default: () => [] }),
  chatMessages: Annotation<ChatMessage[] | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  llmSummary: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  preparedCandidates: Annotation<PreparedIssueCandidate[]>({ reducer: (_, b) => b, default: () => [] }),
  candidateAction: Annotation<CandidateAction | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  approvalRequirements: Annotation<ApprovalGate[]>({ reducer: (_, b) => b, default: () => [] }),
  surfacedActions: Annotation<ActionShape[]>({ reducer: (_, b) => b, default: () => [] }),
  degradationTier: Annotation<DegradationTier>({ reducer: (_, b) => b, default: () => 'full' }),
  errors: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  fallbackStatus: Annotation<FallbackEvent[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  fallback: Annotation<FleetGraphFallback | undefined>({ reducer: (_, b) => b, default: () => undefined }),
});

export type FleetGraphStateType = typeof FleetGraphAnnotation.State;
export type FleetGraphNodeFn = (state: FleetGraphStateType) => Promise<Partial<FleetGraphStateType>>;

export function buildFleetGraph() {
  return new StateGraph(FleetGraphAnnotation)
    .addNode('context', contextNode)
    .addNode('fetch', fetchNode)
    .addNode('candidatePrep', candidateNode)
    .addNode('reasoning', reasoningNode)
    .addNode('actionPlanning', actionNode)
    .addNode('hitlGate', hitlGateNode)
    .addNode('surfaceAction', surfaceActionNode)
    .addNode('cleanResponse', cleanResponseNode)
    .addNode('fallbackHandler', fallbackNode)
    .addEdge(START, 'context')
    .addEdge('context', 'fetch')
    .addConditionalEdges(
      'fetch',
      (state) => (state.errors.length > 0 && state.fetchedResources.length === 0 ? 'fallbackHandler' : 'candidatePrep'),
      { candidatePrep: 'candidatePrep', fallbackHandler: 'fallbackHandler' },
    )
    .addEdge('candidatePrep', 'reasoning')
    .addConditionalEdges(
      'reasoning',
      (state) => {
        if (state.errors.length > 0 && state.fetchedResources.length === 0) {
          return 'fallbackHandler';
        }
        return actionRouter(state);
      },
      { cleanResponse: 'cleanResponse', actionPlanning: 'actionPlanning', fallbackHandler: 'fallbackHandler' },
    )
    .addEdge('actionPlanning', 'hitlGate')
    .addEdge('hitlGate', 'surfaceAction')
    .addEdge('surfaceAction', END)
    .addEdge('cleanResponse', END)
    .addEdge('fallbackHandler', END)
    .compile();
}
