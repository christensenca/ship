import { describe, expect, it, vi } from 'vitest';
import { reasoningNode } from './reasoning-node.js';
import type { FleetGraphStateType } from '../graph.js';
import * as synthesis from '../llm/synthesis.js';

vi.mock('../llm/synthesis.js', async () => {
  const actual = await vi.importActual<typeof import('../llm/synthesis.js')>('../llm/synthesis.js');
  return {
    ...actual,
    synthesizeUnifiedReasoning: vi.fn(actual.synthesizeUnifiedReasoning),
  };
});

function baseState(overrides: Partial<FleetGraphStateType>): FleetGraphStateType {
  return {
    invocation: {
      mode: 'chat',
      triggerType: 'on_demand',
      workspaceId: 'ws-001',
      viewType: 'project',
      correlationId: 'corr-001',
    },
    contextSummary: 'test',
    fetchedResources: [],
    detectedFindings: [],
    recommendedActions: [],
    chatMessages: undefined,
    llmSummary: undefined,
    preparedCandidates: [],
    candidateAction: undefined,
    approvalRequirements: [],
    surfacedActions: [],
    degradationTier: 'full',
    errors: [],
    fallbackStatus: [],
    fallback: undefined,
    ...overrides,
  };
}

describe('reasoningNode', () => {
  it('does not reuse a contradictory llm summary for assign-to-me results', async () => {
    vi.mocked(synthesis.synthesizeUnifiedReasoning).mockResolvedValueOnce({
      summary: 'You should continue working on **Implement analytics**, which is currently in progress and you are the assignee.',
      decisionType: 'assign_to_me',
      chosenIssueId: 'issue-project-unassigned',
      finding: null,
      recommendation: null,
    });

    const result = await reasoningNode(baseState({
      invocation: {
        mode: 'chat',
        triggerType: 'on_demand',
        workspaceId: 'ws-001',
        viewType: 'project',
        documentId: 'project-001',
        actorUserId: 'user-001',
        actorPersonId: 'person-001',
        actorName: 'Alex',
        correlationId: 'corr-chat-contradictory-summary',
      },
      chatMessages: [{ role: 'user', content: 'assign me something in this project' }],
      preparedCandidates: [
        {
          issueId: 'issue-project-unassigned',
          title: 'Implement analytics',
          state: 'backlog',
          priority: 'low',
          assigneeId: null,
          scope: 'project',
          recommendationKind: 'assign_to_me',
          rationale: 'This issue is available in the current project.',
        },
      ],
    }));

    expect(result.candidateAction?.targetDocumentId).toBe('issue-project-unassigned');
    expect(result.llmSummary).toBe('You should assign yourself "Implement analytics" from this project.');
  });

  it('answers current-work prompts with the actor-owned top issue', async () => {
    const result = await reasoningNode(baseState({
      invocation: {
        mode: 'chat',
        triggerType: 'on_demand',
        workspaceId: 'ws-001',
        viewType: 'project',
        documentId: 'project-001',
        actorUserId: 'user-001',
        actorPersonId: 'person-001',
        actorName: 'Alex',
        correlationId: 'corr-chat',
      },
      chatMessages: [{ role: 'user', content: 'What should I work on next?' }],
      fetchedResources: [
        {
          id: 'issue-1',
          workspace_id: 'ws-001',
          document_type: 'issue',
          title: 'AUTH-12',
          created_at: '',
          updated_at: '',
          properties: { state: 'in_progress', priority: 'high', assignee_id: 'user-001', estimate: 3 },
        },
        {
          id: 'issue-2',
          workspace_id: 'ws-001',
          document_type: 'issue',
          title: 'AUTH-18',
          created_at: '',
          updated_at: '',
          properties: { state: 'todo', priority: 'high', assignee_id: null, estimate: 3 },
        },
        {
          id: 'person-001',
          workspace_id: 'ws-001',
          document_type: 'person',
          title: 'Alex',
          created_at: '',
          updated_at: '',
          properties: { capacity_hours: 8, user_id: 'user-001' },
        },
      ],
      preparedCandidates: [
        {
          issueId: 'issue-1',
          title: 'AUTH-12',
          state: 'in_progress',
          priority: 'high',
          assigneeId: 'user-001',
          scope: 'actor',
          recommendationKind: 'continue',
          rationale: 'You already own this issue.',
        },
        {
          issueId: 'issue-2',
          title: 'AUTH-18',
          state: 'todo',
          priority: 'high',
          assigneeId: null,
          scope: 'project',
          recommendationKind: 'assign_to_me',
          rationale: 'This issue is available in the current project.',
        },
      ],
    }));

    expect(result.llmSummary).toBe('Your best next issue is "AUTH-12".');
    expect(result.candidateAction).toBeUndefined();
  });

  it('prefers scoped project work over unrelated personal work for next-step prompts', async () => {
    const result = await reasoningNode(baseState({
      invocation: {
        mode: 'chat',
        triggerType: 'on_demand',
        workspaceId: 'ws-001',
        viewType: 'project',
        documentId: 'project-001',
        actorUserId: 'user-001',
        actorPersonId: 'person-001',
        actorName: 'Alex',
        correlationId: 'corr-chat-project-scope',
      },
      chatMessages: [{ role: 'user', content: 'What should I do next?' }],
      fetchedResources: [
        {
          id: 'issue-owned-global',
          workspace_id: 'ws-001',
          document_type: 'issue',
          title: 'Global maintenance',
          created_at: '',
          updated_at: '',
          properties: { state: 'in_progress', priority: 'high', assignee_id: 'user-001', estimate: 3 },
          _scope: 'actor',
        } as any,
        {
          id: 'issue-project-unassigned',
          workspace_id: 'ws-001',
          document_type: 'issue',
          title: 'Project onboarding',
          created_at: '',
          updated_at: '',
          properties: { state: 'todo', priority: 'medium', assignee_id: null, estimate: 2 },
          _scope: 'project',
        } as any,
        {
          id: 'person-001',
          workspace_id: 'ws-001',
          document_type: 'person',
          title: 'Alex',
          created_at: '',
          updated_at: '',
          properties: { capacity_hours: 8, user_id: 'user-001' },
        },
      ],
      preparedCandidates: [
        {
          issueId: 'issue-project-unassigned',
          title: 'Project onboarding',
          state: 'todo',
          priority: 'medium',
          assigneeId: null,
          scope: 'project',
          recommendationKind: 'assign_to_me',
          rationale: 'This issue is available in the current project.',
        },
        {
          issueId: 'issue-owned-global',
          title: 'Global maintenance',
          state: 'in_progress',
          priority: 'high',
          assigneeId: 'user-001',
          scope: 'actor',
          recommendationKind: 'continue',
          rationale: 'You already own this issue.',
        },
      ],
    }));

    expect(result.llmSummary).toBe('You should assign "Project onboarding" to yourself as the next step.');
    expect(result.candidateAction?.targetDocumentId).toBe('issue-project-unassigned');
  });

  it('treats unassigned-work prompts as assignment help', async () => {
    const result = await reasoningNode(baseState({
      invocation: {
        mode: 'chat',
        triggerType: 'on_demand',
        workspaceId: 'ws-001',
        viewType: 'project',
        actorUserId: 'user-001',
        actorPersonId: 'person-001',
        actorName: 'Alex',
        correlationId: 'corr-chat-unassigned',
      },
      chatMessages: [{ role: 'user', content: 'Are there any unassigned issues?' }],
      fetchedResources: [
        {
          id: 'issue-2',
          workspace_id: 'ws-001',
          document_type: 'issue',
          title: 'Add export functionality',
          created_at: '',
          updated_at: '',
          properties: { state: 'in_progress', priority: 'low', assignee_id: null, estimate: 2 },
        },
        {
          id: 'person-001',
          workspace_id: 'ws-001',
          document_type: 'person',
          title: 'Alex',
          created_at: '',
          updated_at: '',
          properties: { capacity_hours: 8, user_id: 'user-001' },
        },
      ],
      preparedCandidates: [
        {
          issueId: 'issue-2',
          title: 'Add export functionality',
          state: 'in_progress',
          priority: 'low',
          assigneeId: null,
          scope: 'workspace',
          recommendationKind: 'assign_to_me',
          rationale: 'This issue is unassigned and available to pick up.',
        },
      ],
    }));

    expect(result.candidateAction?.actionType).toBe('reassign');
    expect(result.candidateAction?.targetDocumentId).toBe('issue-2');
    expect(result.candidateAction?.proposedChange.new_value).toBe('user-001');
    expect(result.llmSummary).toBe('You should assign "Add export functionality" to yourself as the next step.');
  });

  it('keeps project assignment prompts scoped to project-local assignable work', async () => {
    const result = await reasoningNode(baseState({
      invocation: {
        mode: 'chat',
        triggerType: 'on_demand',
        workspaceId: 'ws-001',
        viewType: 'project',
        documentId: 'project-001',
        actorUserId: 'user-001',
        actorPersonId: 'person-001',
        actorName: 'Alex',
        correlationId: 'corr-chat-project-assign',
      },
      chatMessages: [{ role: 'user', content: 'assign me something in this project' }],
      fetchedResources: [
        {
          id: 'issue-owned-global',
          workspace_id: 'ws-001',
          document_type: 'issue',
          title: 'Create capacity planning',
          created_at: '',
          updated_at: '',
          properties: { state: 'todo', priority: 'high', assignee_id: 'user-001', estimate: 3 },
          _scope: 'actor',
        } as any,
        {
          id: 'issue-project-unassigned',
          workspace_id: 'ws-001',
          document_type: 'issue',
          title: 'Implement analytics',
          created_at: '',
          updated_at: '',
          properties: { state: 'backlog', priority: 'low', assignee_id: null, estimate: 6 },
          _scope: 'project',
        } as any,
      ],
      preparedCandidates: [
        {
          issueId: 'issue-owned-global',
          title: 'Create capacity planning',
          state: 'todo',
          priority: 'high',
          assigneeId: 'user-001',
          scope: 'actor',
          recommendationKind: 'continue',
          rationale: 'You already own this issue.',
        },
        {
          issueId: 'issue-project-unassigned',
          title: 'Implement analytics',
          state: 'backlog',
          priority: 'low',
          assigneeId: null,
          scope: 'project',
          recommendationKind: 'assign_to_me',
          rationale: 'This issue is available in the current project.',
        },
      ],
    }));

    expect(result.candidateAction?.targetDocumentId).toBe('issue-project-unassigned');
    expect(result.llmSummary).toBe('You should assign yourself "Implement analytics" from this project.');
  });

  it('does not fall back to unrelated continue work when the project has nothing assignable', async () => {
    const result = await reasoningNode(baseState({
      invocation: {
        mode: 'chat',
        triggerType: 'on_demand',
        workspaceId: 'ws-001',
        viewType: 'project',
        documentId: 'project-001',
        actorUserId: 'user-001',
        actorPersonId: 'person-001',
        actorName: 'Alex',
        correlationId: 'corr-chat-project-none',
      },
      chatMessages: [{ role: 'user', content: 'assign me something in this project' }],
      preparedCandidates: [
        {
          issueId: 'issue-owned-global',
          title: 'Create capacity planning',
          state: 'todo',
          priority: 'high',
          assigneeId: 'user-001',
          scope: 'actor',
          recommendationKind: 'continue',
          rationale: 'You already own this issue.',
        },
      ],
    }));

    expect(result.candidateAction).toBeUndefined();
    expect(result.llmSummary).toBe('I could not find an unassigned issue in this project right now.');
  });

  it('answers identity prompts from actor context', async () => {
    const result = await reasoningNode(baseState({
      invocation: {
        mode: 'chat',
        triggerType: 'on_demand',
        workspaceId: 'ws-001',
        viewType: 'issue',
        actorUserId: 'user-001',
        actorPersonId: 'person-001',
        actorName: 'Alex',
        correlationId: 'corr-chat-identity',
      },
      chatMessages: [{ role: 'user', content: 'who am i' }],
      fetchedResources: [],
    }));

    expect(result.llmSummary).toBe('You are Alex.');
    expect(result.detectedFindings).toEqual([]);
    expect(result.candidateAction).toBeUndefined();
  });

  it('proposes a rebalance action when an assignment change overloads the new assignee', async () => {
    const result = await reasoningNode(baseState({
      invocation: {
        mode: 'event',
        triggerType: 'event',
        workspaceId: 'ws-001',
        viewType: 'project',
        documentId: 'issue-2',
        eventType: 'assignment_changed',
        eventPayload: {
          workspaceId: 'ws-001',
          issueId: 'issue-2',
          projectId: 'project-001',
          oldAssigneeId: 'user-old',
          newAssigneeId: 'user-new',
          changedAt: new Date().toISOString(),
        },
        correlationId: 'corr-event',
      },
      fetchedResources: [
        {
          id: 'issue-2',
          workspace_id: 'ws-001',
          document_type: 'issue',
          title: 'AUTH-25',
          created_at: '',
          updated_at: '',
          properties: { state: 'todo', priority: 'high', assignee_id: 'user-new', estimate: 4 },
        },
        {
          id: 'issue-3',
          workspace_id: 'ws-001',
          document_type: 'issue',
          title: 'AUTH-26',
          created_at: '',
          updated_at: '',
          properties: { state: 'in_progress', priority: 'medium', assignee_id: 'user-new', estimate: 6 },
        },
        {
          id: 'person-new',
          workspace_id: 'ws-001',
          document_type: 'person',
          title: 'Taylor',
          created_at: '',
          updated_at: '',
          properties: { capacity_hours: 8, user_id: 'user-new' },
        },
        {
          id: 'person-old',
          workspace_id: 'ws-001',
          document_type: 'person',
          title: 'Jordan',
          created_at: '',
          updated_at: '',
          properties: { capacity_hours: 8, user_id: 'user-old' },
        },
      ],
    }));

    expect(result.detectedFindings).toHaveLength(1);
    expect(result.candidateAction?.targetDocumentId).toBe('issue-2');
    expect(result.candidateAction?.proposedChange.new_value).toBe('user-old');
  });
});
