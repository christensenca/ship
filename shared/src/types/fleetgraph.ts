// FleetGraph Agent shared types

// === Enums ===

export type FleetGraphViewType = 'issue' | 'week' | 'project' | 'program' | 'person' | 'workspace';
export type FleetGraphTriggerType = 'on_demand' | 'scheduled' | 'event';
export type FleetGraphScopeType = 'workspace' | 'week' | 'project' | 'program';

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
