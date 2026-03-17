/**
 * FleetGraph Agent OpenAPI schemas and endpoint registration.
 */

import { z, registry } from '../registry.js';

// ============== Shared Sub-Schemas ==============

const FindingSchema = z.object({
  id: z.string(),
  category: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  headline: z.string(),
  rationale: z.string(),
  evidence: z.array(z.string()).optional(),
  relatedDocumentIds: z.array(z.string()).optional(),
  recommendedAudience: z.array(z.string()).optional(),
  requiresHumanAction: z.boolean(),
  confidence: z.number().min(0).max(1),
}).openapi('FleetGraphFinding');

registry.register('FleetGraphFinding', FindingSchema);

const RecommendationSchema = z.object({
  id: z.string(),
  type: z.string(),
  reason: z.string(),
  expectedImpact: z.string(),
  approvalStatus: z.enum(['not_required', 'pending', 'approved', 'rejected', 'expired']),
  affectedDocumentIds: z.array(z.string()).optional(),
}).openapi('FleetGraphRecommendation');

registry.register('FleetGraphRecommendation', RecommendationSchema);

const DraftSchema = z.object({
  type: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.enum(['draft', 'reviewed', 'published']),
  automated: z.boolean(),
}).openapi('FleetGraphDraft');

registry.register('FleetGraphDraft', DraftSchema);

const FallbackSchema = z.object({
  message: z.string(),
  retryable: z.boolean(),
}).openapi('FleetGraphFallback');

registry.register('FleetGraphFallback', FallbackSchema);

const ProgramSummarySchema = z.object({
  programId: z.string(),
  status: z.enum(['on_track', 'at_risk', 'stalled']),
  headline: z.string(),
  blockers: z.number().int().optional(),
  silentDays: z.number().int().optional(),
}).openapi('FleetGraphProgramSummary');

registry.register('FleetGraphProgramSummary', ProgramSummarySchema);

// ============== Request/Response Schemas ==============

const ContextualGuidanceRequestSchema = z.object({
  workspaceId: z.string(),
  viewType: z.enum(['issue', 'week', 'project', 'program', 'person']),
  documentId: z.string().optional(),
  actorUserId: z.string().optional(),
  prompt: z.string().optional(),
}).openapi('ContextualGuidanceRequest');

const ContextualGuidanceResponseSchema = z.object({
  summary: z.string(),
  findings: z.array(FindingSchema),
  recommendations: z.array(RecommendationSchema),
  fallback: FallbackSchema.optional(),
}).openapi('ContextualGuidanceResponse');

const ProactiveFindingsRequestSchema = z.object({
  workspaceId: z.string(),
  scopeType: z.enum(['workspace', 'week', 'project', 'program']),
  scopeId: z.string().optional(),
  triggerType: z.enum(['scheduled', 'event']).optional(),
}).openapi('ProactiveFindingsRequest');

const ProactiveFindingsResponseSchema = z.object({
  findings: z.array(FindingSchema),
  generatedAt: z.string().datetime().optional(),
}).openapi('ProactiveFindingsResponse');

const CreateDraftRequestSchema = z.object({
  workspaceId: z.string(),
  draftType: z.enum(['standup', 'weekly_plan', 'week_summary', 'portfolio_report']),
  sourceContext: z.record(z.unknown()),
  persist: z.boolean().default(false),
}).openapi('CreateDraftRequest');

const CreateDraftResponseSchema = z.object({
  draft: DraftSchema,
}).openapi('CreateDraftResponse');

const RecommendationDecisionRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  comment: z.string().optional(),
}).openapi('RecommendationDecisionRequest');

const RecommendationDecisionResponseSchema = z.object({
  recommendationId: z.string(),
  status: z.enum(['approved', 'rejected']),
}).openapi('RecommendationDecisionResponse');

const PortfolioSummaryRequestSchema = z.object({
  workspaceId: z.string(),
  programIds: z.array(z.string()).optional(),
}).openapi('PortfolioSummaryRequest');

const PortfolioSummaryResponseSchema = z.object({
  summary: z.string(),
  programs: z.array(ProgramSummarySchema),
}).openapi('PortfolioSummaryResponse');

// ============== New Schemas (Chat + Actions + Blockers) ==============

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
}).openapi('ChatMessage');

const ActionShapeSchema = z.object({
  id: z.string(),
  actionType: z.enum(['move_issue', 'reassign', 'change_priority', 'change_state']),
  targetDocumentId: z.string(),
  targetDocumentTitle: z.string(),
  proposedChange: z.object({
    field: z.string(),
    old_value: z.unknown(),
    new_value: z.unknown(),
  }),
  description: z.string(),
  findingId: z.string(),
  status: z.enum(['pending', 'approved', 'dismissed', 'snoozed', 'expired', 'executed']),
  createdAt: z.string(),
}).openapi('ActionShape');

registry.register('ActionShape', ActionShapeSchema);

const ChatRequestSchema = z.object({
  workspaceId: z.string(),
  viewType: z.enum(['issue', 'week', 'project', 'program', 'person']),
  documentId: z.string().optional(),
  messages: z.array(ChatMessageSchema).max(10),
}).openapi('ChatRequest');

const SuggestedIssueSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  state: z.string(),
  priority: z.string(),
  reason: z.string().optional(),
}).openapi('SuggestedIssue');

const ChatResponseSchema = z.object({
  message: z.string(),
  findings: z.array(FindingSchema),
  proposedActions: z.array(ActionShapeSchema),
  suggestedIssues: z.array(SuggestedIssueSchema).optional(),
  degradationTier: z.enum(['full', 'partial', 'offline']),
  refetchedScope: z.boolean(),
}).openapi('ChatResponse');

const ActionDecideRequestSchema = z.object({
  decision: z.enum(['approve', 'dismiss', 'snooze']),
  snoozeHours: z.number().int().positive().optional(),
  comment: z.string().optional(),
  targetDocumentId: z.string().uuid().optional(),
}).openapi('ActionDecideRequest');

const ActionDecideResponseSchema = z.object({
  actionId: z.string(),
  status: z.enum(['approved', 'dismissed', 'snoozed']),
  executionResult: z.object({
    success: z.boolean(),
    documentId: z.string(),
    changeApplied: z.object({
      field: z.string(),
      old_value: z.unknown(),
      new_value: z.unknown(),
    }),
  }).optional(),
}).openapi('ActionDecideResponse');

const ActionListResponseSchema = z.object({
  actions: z.array(ActionShapeSchema),
}).openapi('ActionListResponse');

const CheckBlockersRequestSchema = z.object({
  workspaceId: z.string(),
}).openapi('CheckBlockersRequest');

const CheckBlockersResponseSchema = z.object({
  findings: z.array(FindingSchema),
  escalated: z.number().int(),
  skipped: z.number().int(),
}).openapi('CheckBlockersResponse');

const ExpireActionsRequestSchema = z.object({
  workspaceId: z.string(),
}).openapi('ExpireActionsRequest');

const ExpireActionsResponseSchema = z.object({
  expired: z.number().int(),
}).openapi('ExpireActionsResponse');

// ============== Endpoint Registration ==============

registry.registerPath({
  method: 'post',
  path: '/agent/contextual-guidance',
  tags: ['FleetGraph'],
  summary: 'Generate guidance for the current Ship view',
  request: {
    body: {
      content: { 'application/json': { schema: ContextualGuidanceRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Guidance generated successfully',
      content: { 'application/json': { schema: ContextualGuidanceResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/agent/proactive-findings',
  tags: ['FleetGraph'],
  summary: 'Run a proactive scan for week, project, or program risk',
  request: {
    body: {
      content: { 'application/json': { schema: ProactiveFindingsRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Findings generated successfully',
      content: { 'application/json': { schema: ProactiveFindingsResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/agent/drafts',
  tags: ['FleetGraph'],
  summary: 'Create an automated draft for standup, plan, or summary content',
  request: {
    body: {
      content: { 'application/json': { schema: CreateDraftRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Draft generated successfully',
      content: { 'application/json': { schema: CreateDraftResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/agent/recommendations/{recommendationId}/confirm',
  tags: ['FleetGraph'],
  summary: 'Confirm or reject a recommendation requiring human approval',
  request: {
    params: z.object({ recommendationId: z.string() }),
    body: {
      content: { 'application/json': { schema: RecommendationDecisionRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Decision recorded successfully',
      content: { 'application/json': { schema: RecommendationDecisionResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/agent/portfolio-summary',
  tags: ['FleetGraph'],
  summary: 'Generate a portfolio drift summary for leadership views',
  request: {
    body: {
      content: { 'application/json': { schema: PortfolioSummaryRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Portfolio summary generated successfully',
      content: { 'application/json': { schema: PortfolioSummaryResponseSchema } },
    },
  },
});

// New endpoint registrations

registry.registerPath({
  method: 'post',
  path: '/agent/chat',
  tags: ['FleetGraph'],
  summary: 'Multi-turn conversational chat with FleetGraph',
  request: {
    body: {
      content: { 'application/json': { schema: ChatRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Chat response generated',
      content: { 'application/json': { schema: ChatResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/agent/actions/{actionId}/decide',
  tags: ['FleetGraph'],
  summary: 'Approve, dismiss, or snooze a proposed action',
  request: {
    params: z.object({ actionId: z.string() }),
    body: {
      content: { 'application/json': { schema: ActionDecideRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Decision recorded',
      content: { 'application/json': { schema: ActionDecideResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/agent/actions',
  tags: ['FleetGraph'],
  summary: 'List pending actions for a workspace',
  request: {
    query: z.object({
      workspaceId: z.string(),
      status: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Actions listed',
      content: { 'application/json': { schema: ActionListResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/agent/check-blockers',
  tags: ['FleetGraph'],
  summary: 'Check for blocker escalation across workspace',
  request: {
    body: {
      content: { 'application/json': { schema: CheckBlockersRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Blocker check completed',
      content: { 'application/json': { schema: CheckBlockersResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/agent/expire-actions',
  tags: ['FleetGraph'],
  summary: 'Expire stale pending actions older than 48h',
  request: {
    body: {
      content: { 'application/json': { schema: ExpireActionsRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Actions expired',
      content: { 'application/json': { schema: ExpireActionsResponseSchema } },
    },
  },
});

// Export schemas for use in route validation
export {
  ContextualGuidanceRequestSchema,
  ContextualGuidanceResponseSchema,
  ProactiveFindingsRequestSchema,
  ProactiveFindingsResponseSchema,
  CreateDraftRequestSchema,
  CreateDraftResponseSchema,
  RecommendationDecisionRequestSchema,
  RecommendationDecisionResponseSchema,
  PortfolioSummaryRequestSchema,
  PortfolioSummaryResponseSchema,
  ChatRequestSchema,
  ChatResponseSchema,
  ActionDecideRequestSchema,
  ActionDecideResponseSchema,
  ActionListResponseSchema,
  CheckBlockersRequestSchema,
  CheckBlockersResponseSchema,
  ExpireActionsRequestSchema,
  ExpireActionsResponseSchema,
  FindingSchema,
  RecommendationSchema,
  DraftSchema,
  FallbackSchema,
  ProgramSummarySchema,
  ActionShapeSchema,
};
