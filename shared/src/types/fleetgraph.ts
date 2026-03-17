// FleetGraph Agent shared types

// === Enums ===

export type FleetGraphViewType = 'issue' | 'week' | 'project' | 'program' | 'person' | 'workspace';
export type FleetGraphTriggerType = 'on_demand' | 'scheduled' | 'event';
export type FleetGraphScopeType = 'workspace' | 'week' | 'project' | 'program' | 'person' | 'issue';

export type FindingCategory =
  | 'blocker'
  | 'stale_work'
  | 'capacity_risk'
  | 'planning_gap'
  | 'slipping_scope'
  | 'silent_project'
  | 'missing_standup';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export type RecommendationType =
  | 'escalate'
  | 'reassign'
  | 'rescope'
  | 'approve_plan'
  | 'review_blocker'
  | 'publish_draft';

export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected' | 'expired';

export type DraftType = 'standup' | 'weekly_plan' | 'week_summary' | 'portfolio_report';
export type DraftStatus = 'draft' | 'reviewed' | 'published';

export type GateType = 'mutation' | 'notification_send' | 'document_publish';
export type GateStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type ProgramHealthStatus = 'on_track' | 'at_risk' | 'stalled';

export type DegradationTier = 'full' | 'partial' | 'offline';

export type ActionType = 'move_issue' | 'reassign' | 'change_priority' | 'change_state';
export type ActionStatus = 'pending' | 'approved' | 'dismissed' | 'snoozed' | 'expired' | 'executed';
export type ActionDecision = 'approve' | 'dismiss' | 'snooze';

// === Core Entities ===

export interface FleetGraphFinding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  headline: string;
  rationale: string;
  evidence: string[];
  relatedDocumentIds: string[];
  recommendedAudience: string[];
  requiresHumanAction: boolean;
  confidence: number;
}

export interface FleetGraphRecommendation {
  id: string;
  type: RecommendationType;
  reason: string;
  expectedImpact: string;
  approvalStatus: ApprovalStatus;
  affectedDocumentIds: string[];
}

export interface FleetGraphDraft {
  type: DraftType;
  title: string;
  body: string;
  status: DraftStatus;
  automated: boolean;
}

export interface FleetGraphFallback {
  message: string;
  retryable: boolean;
}

export interface FleetGraphProgramSummary {
  programId: string;
  status: ProgramHealthStatus;
  headline: string;
  blockers?: number;
  silentDays?: number;
}

// === Chat Types ===

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// === Action Types ===

export interface ActionShape {
  id: string;
  actionType: ActionType;
  targetDocumentId: string;
  targetDocumentTitle: string;
  proposedChange: { field: string; old_value: unknown; new_value: unknown };
  description: string;
  findingId: string;
  status: ActionStatus;
  createdAt: string;
}

// === Request Types ===

export interface ContextualGuidanceRequest {
  workspaceId: string;
  viewType: FleetGraphViewType;
  documentId?: string;
  actorUserId?: string;
  prompt?: string;
}

export interface ProactiveFindingsRequest {
  workspaceId: string;
  scopeType: FleetGraphScopeType;
  scopeId?: string;
  triggerType?: 'scheduled' | 'event';
}

export interface CreateDraftRequest {
  workspaceId: string;
  draftType: DraftType;
  sourceContext: Record<string, unknown>;
  persist?: boolean;
}

export interface RecommendationDecisionRequest {
  decision: 'approve' | 'reject';
  comment?: string;
}

export interface PortfolioSummaryRequest {
  workspaceId: string;
  programIds?: string[];
}

// === Response Types ===

export interface ContextualGuidanceResponse {
  summary: string;
  findings: FleetGraphFinding[];
  recommendations: FleetGraphRecommendation[];
  fallback?: FleetGraphFallback;
}

export interface ProactiveFindingsResponse {
  findings: FleetGraphFinding[];
  generatedAt?: string;
}

export interface CreateDraftResponse {
  draft: FleetGraphDraft;
}

export interface RecommendationDecisionResponse {
  recommendationId: string;
  status: 'approved' | 'rejected';
}

export interface PortfolioSummaryResponse {
  summary: string;
  programs: FleetGraphProgramSummary[];
}

// === Chat Request/Response ===

export interface ChatRequest {
  workspaceId: string;
  viewType: FleetGraphViewType;
  documentId?: string;
  messages: ChatMessage[];
}

export interface ChatResponse {
  message: string;
  findings: FleetGraphFinding[];
  proposedActions: ActionShape[];
  degradationTier: DegradationTier;
  refetchedScope: boolean;
}

// === Action Management Request/Response ===

export interface ActionDecideRequest {
  decision: ActionDecision;
  snoozeHours?: number;
  comment?: string;
}

export interface ActionDecideResponse {
  actionId: string;
  status: 'approved' | 'dismissed' | 'snoozed';
  executionResult?: {
    success: boolean;
    documentId: string;
    changeApplied: { field: string; old_value: unknown; new_value: unknown };
  };
}

export interface ActionListResponse {
  actions: ActionShape[];
}

// === Check Blockers Request/Response ===

export interface CheckBlockersRequest {
  workspaceId: string;
}

export interface CheckBlockersResponse {
  findings: FleetGraphFinding[];
  escalated: number;
  skipped: number;
}

// === Expire Actions Request/Response ===

export interface ExpireActionsRequest {
  workspaceId: string;
}

export interface ExpireActionsResponse {
  expired: number;
}
