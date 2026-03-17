/**
 * FleetGraph LangGraph workflow — context → fetch → reasoning → action routing.
 *
 * Conditional edges after action node:
 * - clean: no findings → END
 * - notify: findings without mutations → END (notifications handled by service layer)
 * - persist_action: findings with mutations → END (actions persisted by service layer)
 * - fallback: errors → fallback node → END
 *
 * HITL gate is handled at the route/service level after graph execution,
 * not inside the graph, since approval requires an HTTP response cycle.
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import type {
  FleetGraphFinding,
  FleetGraphRecommendation,
  FleetGraphDraft,
  FleetGraphFallback,
  DegradationTier,
  ChatMessage,
} from '@ship/shared';
import type { InvocationContext, ApprovalGate, FallbackEvent } from './state.js';
import type { ShipDocument } from './ship-api-client.js';

import { contextNode } from './nodes/context-node.js';
import { fetchNode } from './nodes/fetch-node.js';
import { reasoningNode } from './nodes/reasoning-node.js';
import { actionNode, actionRouter } from './nodes/action-node.js';
import { fallbackNode } from './nodes/fallback-node.js';

// === LangGraph State Annotation ===

export const FleetGraphAnnotation = Annotation.Root({
  invocation: Annotation<InvocationContext>,
  contextSummary: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  fetchedResources: Annotation<ShipDocument[]>({ reducer: (_, b) => b, default: () => [] }),
  detectedFindings: Annotation<FleetGraphFinding[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  recommendedActions: Annotation<FleetGraphRecommendation[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  draftOutputs: Annotation<FleetGraphDraft[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  chatMessages: Annotation<ChatMessage[] | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  degradationTier: Annotation<DegradationTier>({ reducer: (_, b) => b, default: () => 'full' }),
  approvalRequirements: Annotation<ApprovalGate[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  errors: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  fallbackStatus: Annotation<FallbackEvent[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  fallback: Annotation<FleetGraphFallback | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  userPrompt: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  llmSummary: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
});

export type FleetGraphStateType = typeof FleetGraphAnnotation.State;

// === Node function signatures ===

export type FleetGraphNodeFn = (state: FleetGraphStateType) => Promise<Partial<FleetGraphStateType>>;

// === Graph Builder ===

/**
 * Build the FleetGraph LangGraph workflow with default nodes.
 *
 * Flow: START → context → fetch → reasoning → action → (conditional routing) → END
 * Error path: any errors → fallback → END
 */
export function buildFleetGraph() {
  const graph = new StateGraph(FleetGraphAnnotation)
    .addNode('context', contextNode)
    .addNode('fetch', fetchNode)
    .addNode('reasoning', reasoningNode)
    .addNode('action', actionNode)
    .addNode('fallbackHandler', fallbackNode)
    .addEdge(START, 'context')
    .addEdge('context', 'fetch')
    .addConditionalEdges('fetch', (state) => {
      // If all fetches failed, go to fallback
      return state.degradationTier === 'offline' ? 'fallbackHandler' : 'reasoning';
    }, { fallbackHandler: 'fallbackHandler', reasoning: 'reasoning' })
    .addEdge('reasoning', 'action')
    .addConditionalEdges('action', (state) => {
      // Check for errors first
      if (state.errors.length > 0 && state.degradationTier !== 'full') {
        return 'fallbackHandler';
      }
      // Route based on findings
      const route = actionRouter(state);
      // All routes end the graph — service layer handles notifications/persistence
      return 'end';
    }, { fallbackHandler: 'fallbackHandler', end: END })
    .addEdge('fallbackHandler', END);

  return graph.compile();
}

// Re-export for backward compatibility (custom node injection)
export interface FleetGraphNodeMap {
  context: FleetGraphNodeFn;
  fetch: FleetGraphNodeFn;
  reasoning: FleetGraphNodeFn;
  action: FleetGraphNodeFn;
}

/**
 * Build a FleetGraph with custom nodes (for testing).
 */
export function buildFleetGraphWithNodes(nodes: FleetGraphNodeMap) {
  const graph = new StateGraph(FleetGraphAnnotation)
    .addNode('context', nodes.context)
    .addNode('fetch', nodes.fetch)
    .addNode('reasoning', nodes.reasoning)
    .addNode('action', nodes.action)
    .addNode('fallbackHandler', fallbackNode)
    .addEdge(START, 'context')
    .addEdge('context', 'fetch')
    .addConditionalEdges('fetch', (state) => {
      return state.degradationTier === 'offline' ? 'fallbackHandler' : 'reasoning';
    }, { fallbackHandler: 'fallbackHandler', reasoning: 'reasoning' })
    .addEdge('reasoning', 'action')
    .addConditionalEdges('action', (state) => {
      if (state.errors.length > 0 && state.degradationTier !== 'full') {
        return 'fallbackHandler';
      }
      return 'end';
    }, { fallbackHandler: 'fallbackHandler', end: END })
    .addEdge('fallbackHandler', END);

  return graph.compile();
}
