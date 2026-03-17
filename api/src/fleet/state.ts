/**
 * FleetGraph invocation state and approval gate types.
 *
 * This is the in-flight state passed between LangGraph nodes.
 */

import type {
  FleetGraphViewType,
  FleetGraphTriggerType,
  FleetGraphFinding,
  FleetGraphRecommendation,
  FleetGraphDraft,
  FleetGraphFallback,
  GateType,
  GateStatus,
  DegradationTier,
  ChatMessage,
} from '@ship/shared';
import type { ShipDocument } from './ship-api-client.js';

// === Invocation Context ===

export interface InvocationContext {
  triggerType: FleetGraphTriggerType;
  viewType: FleetGraphViewType;
  documentId?: string;
  actorUserId?: string;
  workspaceId: string;
  timeWindow?: { start: string; end: string };
  correlationId: string;
}

// === Approval Gate ===

export interface ApprovalGate {
  gateId: string;
  gateType: GateType;
  decisionOwner?: string;
  decisionReason?: string;
  status: GateStatus;
  blockedActionIds: string[];
}

// === Fallback Event ===

export interface FallbackEvent {
  fallbackId: string;
  errorType: string;
  userSafeMessage: string;
  recoveryAction?: string;
  retryable: boolean;
  loggedAt: string;
}

// === Agent State (LangGraph annotation) ===

export interface FleetGraphState {
  // Invocation metadata
  invocation: InvocationContext;

  // Data fetched from Ship APIs
  contextSummary: string;
  fetchedResources: ShipDocument[];

  // Analysis outputs
  detectedFindings: FleetGraphFinding[];
  recommendedActions: FleetGraphRecommendation[];
  draftOutputs: FleetGraphDraft[];

  // Chat message history (stateless, sent by client)
  chatMessages?: ChatMessage[];

  // LLM response
  llmSummary?: string;

  // Degradation tracking
  degradationTier: DegradationTier;

  // Approval tracking
  approvalRequirements: ApprovalGate[];

  // Error and fallback tracking
  errors: string[];
  fallbackStatus: FallbackEvent[];
  fallback?: FleetGraphFallback;

  // User prompt (for on-demand guidance)
  userPrompt?: string;
}

/**
 * Create initial empty state for a new FleetGraph invocation.
 */
export function createInitialState(invocation: InvocationContext): FleetGraphState {
  return {
    invocation,
    contextSummary: '',
    fetchedResources: [],
    detectedFindings: [],
    recommendedActions: [],
    draftOutputs: [],
    degradationTier: 'full',
    approvalRequirements: [],
    errors: [],
    fallbackStatus: [],
  };
}
