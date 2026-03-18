import type { FleetGraphStateType } from '../graph.js';
import { logFleetGraph } from '../observability.js';
import type { PreparedIssueCandidate } from '../state.js';
import type { ShipIssue } from '../ship-api-client.js';

type ScopedIssue = ShipIssue & { _scope?: string };

export async function candidateNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  if (state.invocation.mode !== 'chat') {
    return { preparedCandidates: [] };
  }

  const actorUserId = state.invocation.actorUserId;
  if (!actorUserId) {
    return { preparedCandidates: [] };
  }

  const preferredScope = getPreferredScopeName(state.invocation.viewType);
  const issues = state.fetchedResources
    .filter((resource): resource is ScopedIssue => resource.document_type === 'issue')
    .filter((issue) => !['done', 'cancelled'].includes(String(issue.properties?.state ?? '')));

  const candidates = issues
    .flatMap((issue) => buildCandidatesForIssue(issue, actorUserId))
    .sort((a, b) => compareCandidates(a, b, preferredScope))
    .slice(0, 8);

  logFleetGraph({
    level: 'info',
    correlationId: state.invocation.correlationId,
    action: 'candidate-prep',
    message: 'Prepared issue candidates',
    metadata: {
      preferredScope: preferredScope ?? null,
      candidates: candidates.map((candidate) => ({
        issueId: candidate.issueId,
        title: candidate.title,
        scope: candidate.scope,
        state: candidate.state,
        priority: candidate.priority,
        recommendationKind: candidate.recommendationKind,
      })),
    },
  });

  return {
    preparedCandidates: candidates,
  };
}

function buildCandidatesForIssue(issue: ScopedIssue, actorUserId: string): PreparedIssueCandidate[] {
  const scope = normalizeScope(issue._scope);
  const state = String(issue.properties?.state ?? 'unknown');
  const priority = String(issue.properties?.priority ?? 'medium');
  const assigneeId = String(issue.properties?.assignee_id ?? '') || null;

  if (assigneeId === actorUserId) {
    return [{
      issueId: issue.id,
      title: issue.title ?? 'Untitled',
      state,
      priority,
      assigneeId,
      scope,
      recommendationKind: 'continue',
      rationale: `You already own this ${scope}-scoped issue and it is currently ${state}.`,
    }];
  }

  if (!assigneeId) {
    return [{
      issueId: issue.id,
      title: issue.title ?? 'Untitled',
      state,
      priority,
      assigneeId: null,
      scope,
      recommendationKind: 'assign_to_me',
      rationale: `This ${scope}-scoped issue is unassigned and available to pick up.`,
    }];
  }

  return [];
}

function compareCandidates(a: PreparedIssueCandidate, b: PreparedIssueCandidate, preferredScope?: PreparedIssueCandidate['scope']): number {
  const aScope = preferredScope && a.scope === preferredScope ? 0 : 1;
  const bScope = preferredScope && b.scope === preferredScope ? 0 : 1;
  if (aScope !== bScope) return aScope - bScope;

  const kindScore: Record<PreparedIssueCandidate['recommendationKind'], number> = {
    assign_to_me: preferredScope ? 0 : 1,
    continue: preferredScope ? 1 : 0,
  };
  if (kindScore[a.recommendationKind] !== kindScore[b.recommendationKind]) {
    return kindScore[a.recommendationKind] - kindScore[b.recommendationKind];
  }

  const stateScore: Record<string, number> = { in_progress: 0, in_review: 1, todo: 2, triage: 3, backlog: 4 };
  const priorityScore: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const aState = stateScore[a.state] ?? 5;
  const bState = stateScore[b.state] ?? 5;
  if (aState !== bState) return aState - bState;

  const aPriority = priorityScore[a.priority] ?? 4;
  const bPriority = priorityScore[b.priority] ?? 4;
  return aPriority - bPriority;
}

function normalizeScope(scope?: string): PreparedIssueCandidate['scope'] {
  if (scope === 'project') return 'project';
  if (scope === 'week') return 'week';
  if (scope === 'person') return 'person';
  if (scope === 'actor') return 'actor';
  return 'workspace';
}

function getPreferredScopeName(viewType: string): PreparedIssueCandidate['scope'] | undefined {
  if (viewType === 'project' || viewType === 'issue') return 'project';
  if (viewType === 'week') return 'week';
  if (viewType === 'person') return 'person';
  return undefined;
}
