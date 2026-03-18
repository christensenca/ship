/**
 * FleetGraph invocation state and approval gate types.
 */

import type {
  AgentInvocationContext,
  FleetGraphFinding,
  FleetGraphRecommendation,
  FleetGraphFallback,
  GateType,
  GateStatus,
  DegradationTier,
  ChatMessage,
  ActionShape,
} from '@ship/shared';
import type { ShipDocument } from './ship-api-client.js';

export interface ApprovalGate {
  gateId: string;
  gateType: GateType;
  decisionOwner?: string;
  decisionReason?: string;
  status: GateStatus;
  blockedActionIds: string[];
}

export interface FallbackEvent {
  fallbackId: string;
  errorType: string;
  userSafeMessage: string;
  recoveryAction?: string;
  retryable: boolean;
  loggedAt: string;
}

export interface CandidateAction {
  actionType: 'reassign';
  targetDocumentId: string;
  targetDocumentTitle: string;
  proposedChange: { field: string; old_value: unknown; new_value: unknown };
  description: string;
  findingId: string;
}

export interface PreparedIssueCandidate {
  issueId: string;
  title: string;
  state: string;
  priority: string;
  assigneeId?: string | null;
  scope: 'project' | 'week' | 'person' | 'workspace' | 'actor';
  recommendationKind: 'continue' | 'assign_to_me';
  rationale: string;
}

export interface FleetGraphState {
  invocation: AgentInvocationContext;
  contextSummary: string;
  fetchedResources: ShipDocument[];
  detectedFindings: FleetGraphFinding[];
  recommendedActions: FleetGraphRecommendation[];
  chatMessages?: ChatMessage[];
  llmSummary?: string;
  degradationTier: DegradationTier;
  approvalRequirements: ApprovalGate[];
  surfacedActions: ActionShape[];
  preparedCandidates: PreparedIssueCandidate[];
  candidateAction?: CandidateAction;
  errors: string[];
  fallbackStatus: FallbackEvent[];
  fallback?: FleetGraphFallback;
}

export function createInitialState(invocation: AgentInvocationContext, chatMessages?: ChatMessage[]): FleetGraphState {
  return {
    invocation,
    contextSummary: '',
    fetchedResources: [],
    detectedFindings: [],
    recommendedActions: [],
    chatMessages,
    degradationTier: 'full',
    approvalRequirements: [],
    surfacedActions: [],
    preparedCandidates: [],
    errors: [],
    fallbackStatus: [],
  };
}
