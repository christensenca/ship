import { v4 as uuid } from 'uuid';
import type { FleetGraphFinding } from '@ship/shared';
import type { FleetGraphStateType } from '../graph.js';
import type { CandidateAction, PreparedIssueCandidate } from '../state.js';
import { logFleetGraph } from '../observability.js';
import { isLLMAvailable } from '../runtime.js';
import type { ShipDocument, ShipIssue } from '../ship-api-client.js';
import { synthesizeUnifiedReasoning } from '../llm/synthesis.js';

interface CapacitySnapshot {
  personId: string;
  name: string;
  capacity: number;
  workload: number;
}

export async function reasoningNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { invocation, fetchedResources } = state;

  if (invocation.mode === 'event' && invocation.eventType === 'assignment_changed' && invocation.eventPayload) {
    return reasonAssignmentEvent(state, fetchedResources);
  }

  return reasonChat(state);
}

async function reasonChat(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const actorUserId = state.invocation.actorUserId;
  const actorName = state.invocation.actorName;
  const latestMessage = state.chatMessages?.[state.chatMessages.length - 1]?.content ?? '';
  const candidates = state.preparedCandidates;
  const intent = detectChatIntent(state.invocation.viewType, latestMessage);

  if (/\bwho am i\b|\bwhoami\b|\bwhat is my name\b/i.test(latestMessage)) {
    return {
      llmSummary: actorName ? `You are ${actorName}.` : 'You are the currently signed-in Ship user.',
      detectedFindings: [],
    };
  }

  if (!actorUserId || candidates.length === 0) {
    const noContextSummary = intent.assignmentSeeking && state.invocation.viewType === 'project'
      ? 'I could not find an assignable issue in this project yet.'
      : 'I could not find enough assignment context to suggest work yet.';

    logFleetGraph({
      level: 'info',
      correlationId: state.invocation.correlationId,
      action: 'reasoning',
      message: 'No candidate context available',
      metadata: {
        llmAvailable: isLLMAvailable(),
        latestMessage,
        assignmentSeeking: intent.assignmentSeeking,
        currentScopeOnly: intent.currentScopeOnly,
      },
    });

    return {
      llmSummary: noContextSummary,
      detectedFindings: [],
    };
  }

  const llm = await synthesizeUnifiedReasoning({
    mode: 'chat',
    contextSummary: state.contextSummary,
    resources: state.fetchedResources,
    findings: [],
    messages: state.chatMessages,
    candidates: candidates.map((candidate) => ({
      issueId: candidate.issueId,
      title: candidate.title,
      scope: candidate.scope,
      state: candidate.state,
      priority: candidate.priority,
      recommendationKind: candidate.recommendationKind,
      rationale: candidate.rationale,
    })),
  }).catch(() => null);

  const chosen = chooseCandidate(candidates, llm?.chosenIssueId, intent);
  const summary = summarizeChosenCandidate(chosen, llm, intent);

  logFleetGraph({
    level: 'info',
    correlationId: state.invocation.correlationId,
    action: 'reasoning',
    message: 'Completed FleetGraph chat reasoning',
    metadata: {
      llmAvailable: isLLMAvailable(),
      latestMessage,
      assignmentSeeking: intent.assignmentSeeking,
      currentScopeOnly: intent.currentScopeOnly,
      llmDecision: llm ?? null,
      chosenCandidate: chosen
        ? {
          issueId: chosen.issueId,
          title: chosen.title,
          scope: chosen.scope,
          recommendationKind: chosen.recommendationKind,
        }
        : null,
      summary,
    },
  });

  if (!chosen) {
    return {
      llmSummary: summary,
      detectedFindings: [],
    };
  }

  let findings: FleetGraphFinding[] = [];
  let candidateAction: CandidateAction | undefined;

  if (chosen.recommendationKind === 'assign_to_me') {
    const finding = createFinding({
      category: 'assignment_risk',
      severity: 'medium',
      headline: `A next best issue is ready for assignment: ${chosen.title}`,
      rationale: chosen.rationale,
      relatedDocumentIds: [chosen.issueId],
    });
    findings = [finding];
    candidateAction = {
      actionType: 'reassign',
      targetDocumentId: chosen.issueId,
      targetDocumentTitle: chosen.title,
      proposedChange: {
        field: 'assignee_id',
        old_value: chosen.assigneeId ?? null,
        new_value: actorUserId,
      },
      description: `Assign "${chosen.title}" to you`,
      findingId: finding.id,
    };
  }

  return {
    detectedFindings: findings,
    candidateAction,
    llmSummary: summary,
  };
}

function chooseCandidate(
  candidates: PreparedIssueCandidate[],
  chosenIssueId: string | null | undefined,
  intent: ChatIntent,
): PreparedIssueCandidate | undefined {
  if (chosenIssueId) {
    const chosen = candidates.find((candidate) => candidate.issueId === chosenIssueId);
    if (chosen && isCandidateAllowedForIntent(chosen, intent)) {
      return chosen;
    }
  }

  if (intent.assignmentSeeking) {
    const scopedAssignable = candidates.find((candidate) =>
      candidate.recommendationKind === 'assign_to_me' &&
      (!intent.currentScopeOnly || candidate.scope === intent.preferredScope));
    if (scopedAssignable) return scopedAssignable;

    if (intent.currentScopeOnly) {
      return undefined;
    }

    return candidates.find((candidate) => candidate.recommendationKind === 'assign_to_me') ?? undefined;
  }

  return candidates[0];
}

function summarizeChosenCandidate(
  candidate: PreparedIssueCandidate | undefined,
  llmDecision: Awaited<ReturnType<typeof synthesizeUnifiedReasoning>> | null,
  intent: ChatIntent,
): string {
  if (!candidate) {
    if (intent.assignmentSeeking && intent.currentScopeOnly && intent.preferredScope === 'project') {
      return 'I could not find an unassigned issue in this project right now.';
    }
    return llmDecision?.summary ?? 'I could not find a good next issue right now.';
  }

  if (isUsableLlmSummary(candidate, llmDecision)) {
    return llmDecision!.summary;
  }

  return fallbackSummaryForCandidate(candidate, intent);
}

function isUsableLlmSummary(
  candidate: PreparedIssueCandidate,
  llmDecision: Awaited<ReturnType<typeof synthesizeUnifiedReasoning>> | null,
): boolean {
  if (!llmDecision?.summary) return false;
  if (llmDecision.chosenIssueId !== candidate.issueId) return false;
  if (!llmDecision.summary.includes(candidate.title)) return false;

  const expectedDecisionType = candidate.recommendationKind === 'assign_to_me' ? 'assign_to_me' : 'continue';
  if (llmDecision.decisionType && llmDecision.decisionType !== expectedDecisionType) {
    return false;
  }

  const normalized = llmDecision.summary.toLowerCase();
  if (candidate.recommendationKind === 'assign_to_me') {
    return !/\bcontinue working on\b|\byou already own\b|\byou are the assignee\b/.test(normalized);
  }

  return !/\bassign you\b|\bassign yourself\b|\bunassigned and available\b|\bpick up\b/.test(normalized);
}

function fallbackSummaryForCandidate(candidate: PreparedIssueCandidate, intent: ChatIntent): string {
  return candidate.recommendationKind === 'assign_to_me'
    ? intent.currentScopeOnly && candidate.scope === 'project'
      ? `You should assign yourself "${candidate.title}" from this project.`
      : `You should assign "${candidate.title}" to yourself as the next step.`
    : `Your best next issue is "${candidate.title}".`;
}

type ChatIntent = {
  assignmentSeeking: boolean;
  currentScopeOnly: boolean;
  preferredScope?: PreparedIssueCandidate['scope'];
};

function detectChatIntent(viewType: FleetGraphStateType['invocation']['viewType'], latestMessage: string): ChatIntent {
  const assignmentSeeking = /\b(assign|pick up|unassigned|available|open work|something to work on|find me|give me something)\b/i.test(latestMessage);
  const mentionsCurrentContainer = /\b(this|current)\s+(project|week|person)\b|\bin\s+this\s+(project|week)\b/i.test(latestMessage);

  if (viewType === 'project') {
    return {
      assignmentSeeking,
      currentScopeOnly: assignmentSeeking && mentionsCurrentContainer,
      preferredScope: 'project',
    };
  }

  if (viewType === 'week') {
    return {
      assignmentSeeking,
      currentScopeOnly: assignmentSeeking && mentionsCurrentContainer,
      preferredScope: 'week',
    };
  }

  if (viewType === 'person') {
    return {
      assignmentSeeking,
      currentScopeOnly: assignmentSeeking && mentionsCurrentContainer,
      preferredScope: 'person',
    };
  }

  return {
    assignmentSeeking,
    currentScopeOnly: false,
    preferredScope: undefined,
  };
}

function isCandidateAllowedForIntent(candidate: PreparedIssueCandidate, intent: ChatIntent): boolean {
  if (!intent.assignmentSeeking) return true;
  if (candidate.recommendationKind !== 'assign_to_me') return false;
  if (!intent.currentScopeOnly) return true;
  return candidate.scope === intent.preferredScope;
}

async function reasonAssignmentEvent(
  state: FleetGraphStateType,
  resources: ShipDocument[],
): Promise<Partial<FleetGraphStateType>> {
  const payload = state.invocation.eventPayload!;
  const issue = resources.find((resource) => resource.id === payload.issueId && resource.document_type === 'issue') as ShipIssue | undefined;
  if (!issue) {
    return {
      errors: ['Issue context missing for assignment_changed event'],
    };
  }

  const people = resources.filter((resource) => resource.document_type === 'person');
  const candidatePeople = people.map((person) => {
    const workload = sumWorkload(resources.filter((resource) =>
      resource.document_type === 'issue' &&
      String(resource.properties?.assignee_id ?? '') === String(person.properties?.user_id ?? '') &&
      !['done', 'cancelled'].includes(String(resource.properties?.state ?? '')),
    ) as ShipIssue[]);
    return {
      personId: String(person.properties?.user_id ?? person.id),
      name: person.title ?? 'Unknown',
      capacity: Number(person.properties?.capacity_hours ?? 0),
      workload,
    } satisfies CapacitySnapshot;
  });

  const newAssignee = candidatePeople.find((person) => person.personId === payload.newAssigneeId);
  const bestAlternative = pickBestAlternative(candidatePeople, payload.newAssigneeId);

  const overloaded = !!newAssignee && newAssignee.capacity > 0 && newAssignee.workload > newAssignee.capacity;
  if (!overloaded || !bestAlternative) {
    const llm = await synthesizeUnifiedReasoning({
      mode: 'event',
      contextSummary: state.contextSummary,
      resources,
      findings: [],
    }).catch(() => null);

    return {
      detectedFindings: [],
      llmSummary: llm?.summary ?? `The assignment change for "${issue.title}" does not currently require a FleetGraph action.`,
    };
  }

  const finding = createFinding({
    category: 'capacity_risk',
    severity: newAssignee.workload >= newAssignee.capacity * 1.25 ? 'high' : 'medium',
    headline: `${newAssignee.name} is now overloaded after "${issue.title}" was reassigned`,
    rationale: `${newAssignee.name} is carrying ${newAssignee.workload}h against ${newAssignee.capacity}h capacity. ${bestAlternative.name} is a better fit at ${bestAlternative.workload}h / ${bestAlternative.capacity}h.`,
    relatedDocumentIds: [issue.id],
  });

  const candidateAction: CandidateAction = {
    actionType: 'reassign',
    targetDocumentId: issue.id,
    targetDocumentTitle: issue.title ?? 'Untitled',
    proposedChange: {
      field: 'assignee_id',
      old_value: payload.newAssigneeId ?? null,
      new_value: bestAlternative.personId,
    },
    description: `Move "${issue.title}" from ${newAssignee.name} to ${bestAlternative.name}`,
    findingId: finding.id,
  };

  const llm = await synthesizeUnifiedReasoning({
    mode: 'event',
    contextSummary: state.contextSummary,
    resources,
    findings: [finding],
    candidateActionDescription: candidateAction.description,
  }).catch(() => null);

  return {
    detectedFindings: [finding],
    candidateAction,
    llmSummary: llm?.summary ?? `This assignment change overloaded ${newAssignee.name}; FleetGraph recommends moving "${issue.title}" to ${bestAlternative.name}.`,
  };
}

function sumWorkload(issues: ShipIssue[]): number {
  return issues.reduce((total, issue) => total + Number(issue.properties.estimate ?? 0), 0);
}

function pickBestAlternative(people: CapacitySnapshot[], excludePersonId?: string | null): CapacitySnapshot | undefined {
  return [...people]
    .filter((person) => person.personId !== excludePersonId && person.capacity > 0)
    .sort((a, b) => {
      const aUtilization = a.workload / a.capacity;
      const bUtilization = b.workload / b.capacity;
      return aUtilization - bUtilization;
    })[0];
}

function createFinding(params: {
  category: FleetGraphFinding['category'];
  severity: FleetGraphFinding['severity'];
  headline: string;
  rationale: string;
  relatedDocumentIds: string[];
}): FleetGraphFinding {
  return {
    id: `finding-${uuid()}`,
    category: params.category,
    severity: params.severity,
    headline: params.headline,
    rationale: params.rationale,
    evidence: [],
    relatedDocumentIds: params.relatedDocumentIds,
    recommendedAudience: [],
    requiresHumanAction: true,
    confidence: 0.82,
  };
}
