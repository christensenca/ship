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
  FindingSchema,
  RecommendationSchema,
  DraftSchema,
  FallbackSchema,
  ProgramSummarySchema,
};
