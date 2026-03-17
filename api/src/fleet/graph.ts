/**
 * FleetGraph LangGraph workflow - base graph with context, fetch, reasoning,
 * action, HITL, and fallback nodes.
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import type {
  FleetGraphFinding,
  FleetGraphRecommendation,
  FleetGraphDraft,
  FleetGraphFallback,
} from '@ship/shared';
import type { InvocationContext, ApprovalGate, FallbackEvent } from './state.js';
import type { ShipDocument } from './ship-api-client.js';

// === LangGraph State Annotation ===

export const FleetGraphAnnotation = Annotation.Root({
  invocation: Annotation<InvocationContext>,
  contextSummary: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  fetchedResources: Annotation<ShipDocument[]>({ reducer: (_, b) => b, default: () => [] }),
  detectedFindings: Annotation<FleetGraphFinding[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  recommendedActions: Annotation<FleetGraphRecommendation[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  draftOutputs: Annotation<FleetGraphDraft[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  approvalRequirements: Annotation<ApprovalGate[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  errors: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  fallbackStatus: Annotation<FallbackEvent[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  fallback: Annotation<FleetGraphFallback | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  userPrompt: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
});

export type FleetGraphStateType = typeof FleetGraphAnnotation.State;

// === Node function signatures ===

export type FleetGraphNodeFn = (state: FleetGraphStateType) => Promise<Partial<FleetGraphStateType>>;

// === Default fallback node ===

async function fallbackNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const hasErrors = state.errors.length > 0;
  if (!hasErrors) return {};

  const fallbackEvent: FallbackEvent = {
    fallbackId: `fb-${Date.now()}`,
    errorType: 'node_failure',
    userSafeMessage: 'Some analysis steps could not complete. Results may be partial.',
    recoveryAction: 'retry',
    retryable: true,
    loggedAt: new Date().toISOString(),
  };

  return {
    fallbackStatus: [fallbackEvent],
    fallback: {
      message: fallbackEvent.userSafeMessage,
      retryable: true,
    },
  };
}

// === Graph Builder ===

export interface FleetGraphNodeMap {
  context: FleetGraphNodeFn;
  fetch: FleetGraphNodeFn;
  reasoning: FleetGraphNodeFn;
  action: FleetGraphNodeFn;
}

/**
 * Build the base FleetGraph LangGraph workflow.
 *
 * Flow: START → context → fetch → reasoning → action → fallback → END
 *
 * The HITL gate is handled at the route/service level after graph execution,
 * not inside the graph itself, since approval requires an HTTP response cycle.
 */
export function buildFleetGraph(nodes: FleetGraphNodeMap) {
  const graph = new StateGraph(FleetGraphAnnotation)
    .addNode('context', nodes.context)
    .addNode('fetch', nodes.fetch)
    .addNode('reasoning', nodes.reasoning)
    .addNode('action', nodes.action)
    .addNode('fallback', fallbackNode)
    .addEdge(START, 'context')
    .addEdge('context', 'fetch')
    .addEdge('fetch', 'reasoning')
    .addEdge('reasoning', 'action')
    .addConditionalEdges('action', (state) => {
      return state.errors.length > 0 ? 'fallback' : 'end';
    }, { fallback: 'fallback', end: END })
    .addEdge('fallback', END);

  return graph.compile();
}
