/**
 * Reusable FleetGraph test fixtures and API mocks.
 */

import type {
  FleetGraphFinding,
  FleetGraphRecommendation,
  FleetGraphDraft,
  FleetGraphProgramSummary,
  ContextualGuidanceRequest,
  ProactiveFindingsRequest,
  CreateDraftRequest,
  PortfolioSummaryRequest,
  AgentInvocationContext,
} from '@ship/shared';

// === Invocation Contexts ===

export function createWeekInvocationContext(overrides?: Partial<AgentInvocationContext>): AgentInvocationContext {
  return {
    mode: 'chat',
    triggerType: 'on_demand',
    viewType: 'week',
    workspaceId: 'ws-test-001',
    documentId: 'week-test-001',
    actorUserId: 'user-test-001',
    correlationId: `corr-${Date.now()}`,
    ...overrides,
  };
}

export function createIssueInvocationContext(overrides?: Partial<AgentInvocationContext>): AgentInvocationContext {
  return {
    mode: 'chat',
    triggerType: 'on_demand',
    viewType: 'issue',
    workspaceId: 'ws-test-001',
    documentId: 'issue-test-001',
    actorUserId: 'user-test-001',
    correlationId: `corr-${Date.now()}`,
    ...overrides,
  };
}

// === Findings ===

export function createBlockerFinding(overrides?: Partial<FleetGraphFinding>): FleetGraphFinding {
  return {
    id: `finding-blocker-${Date.now()}`,
    category: 'blocker',
    severity: 'critical',
    headline: 'Issue #42 is blocked with no recent activity',
    rationale: 'This issue has been in blocked state for 3 days with no updates.',
    evidence: ['Blocked since 2026-03-13', 'No comments or state changes since blocking'],
    relatedDocumentIds: ['issue-42'],
    recommendedAudience: ['user-pm-001'],
    requiresHumanAction: true,
    confidence: 0.9,
    ...overrides,
  };
}

export function createStaleFinding(overrides?: Partial<FleetGraphFinding>): FleetGraphFinding {
  return {
    id: `finding-stale-${Date.now()}`,
    category: 'stale_work',
    severity: 'high',
    headline: 'Issue #55 has been in progress for 5 days without updates',
    rationale: 'Expected progress update within 2 days based on team cadence.',
    evidence: ['Last update: 2026-03-11', 'State: in_progress since 2026-03-10'],
    relatedDocumentIds: ['issue-55'],
    recommendedAudience: ['user-dev-001'],
    requiresHumanAction: true,
    confidence: 0.85,
    ...overrides,
  };
}

export function createSlippingFinding(overrides?: Partial<FleetGraphFinding>): FleetGraphFinding {
  return {
    id: `finding-slip-${Date.now()}`,
    category: 'slipping_scope',
    severity: 'high',
    headline: 'Week 12 has 60% of issues not started with 2 days remaining',
    rationale: 'At current velocity, planned scope is unlikely to complete.',
    evidence: ['6 of 10 issues in todo state', 'Week ends 2026-03-18'],
    relatedDocumentIds: ['week-12'],
    recommendedAudience: ['user-pm-001', 'user-lead-001'],
    requiresHumanAction: true,
    confidence: 0.8,
    ...overrides,
  };
}

// === Recommendations ===

export function createEscalateRecommendation(overrides?: Partial<FleetGraphRecommendation>): FleetGraphRecommendation {
  return {
    id: `rec-escalate-${Date.now()}`,
    type: 'escalate',
    reason: 'Blocker has persisted beyond SLA without resolution.',
    expectedImpact: 'Unblocks downstream work for 2 team members.',
    approvalStatus: 'pending',
    affectedDocumentIds: ['issue-42'],
    ...overrides,
  };
}

export function createRescopeRecommendation(overrides?: Partial<FleetGraphRecommendation>): FleetGraphRecommendation {
  return {
    id: `rec-rescope-${Date.now()}`,
    type: 'rescope',
    reason: 'Week is unlikely to complete planned scope at current velocity.',
    expectedImpact: 'Reduces week scope to achievable level, avoids full spillover.',
    approvalStatus: 'pending',
    affectedDocumentIds: ['week-12'],
    ...overrides,
  };
}

// === Drafts ===

export function createStandupDraft(overrides?: Partial<FleetGraphDraft>): FleetGraphDraft {
  return {
    type: 'standup',
    title: 'Untitled',
    body: '**Done**: Completed API endpoint for user search.\n**Doing**: Working on FleetGraph integration.\n**Blockers**: None.',
    status: 'draft',
    automated: true,
    ...overrides,
  };
}

// === Program Summaries ===

export function createProgramSummary(overrides?: Partial<FleetGraphProgramSummary>): FleetGraphProgramSummary {
  return {
    programId: 'program-test-001',
    status: 'on_track',
    headline: 'All projects progressing within expected timeline.',
    blockers: 0,
    silentDays: 0,
    ...overrides,
  };
}

// === API Request Payloads ===

export function createGuidanceRequestPayload(overrides?: Partial<ContextualGuidanceRequest>): ContextualGuidanceRequest {
  return {
    workspaceId: 'ws-test-001',
    viewType: 'week',
    documentId: 'week-test-001',
    ...overrides,
  };
}

export function createProactiveFindingsPayload(overrides?: Partial<ProactiveFindingsRequest>): ProactiveFindingsRequest {
  return {
    workspaceId: 'ws-test-001',
    scopeType: 'week',
    scopeId: 'week-test-001',
    ...overrides,
  };
}

export function createDraftRequestPayload(overrides?: Partial<CreateDraftRequest>): CreateDraftRequest {
  return {
    workspaceId: 'ws-test-001',
    draftType: 'standup',
    sourceContext: { personId: 'person-test-001' },
    ...overrides,
  };
}

export function createPortfolioSummaryPayload(overrides?: Partial<PortfolioSummaryRequest>): PortfolioSummaryRequest {
  return {
    workspaceId: 'ws-test-001',
    ...overrides,
  };
}
