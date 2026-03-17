/**
 * T026: Next-work ranking and standup draft generation.
 */

import { v4 as uuid } from 'uuid';
import type {
  FleetGraphFinding,
  FleetGraphRecommendation,
  FleetGraphDraft,
  ContextualGuidanceRequest,
  ContextualGuidanceResponse,
  CreateDraftRequest,
  CreateDraftResponse,
} from '@ship/shared';
import { ShipAPIClient, type ShipIssue } from '../ship-api-client.js';
import { getFleetGraphConfig } from '../runtime.js';
import { resolveActor } from './resolve-actor.js';

/**
 * Generate contextual guidance based on the current view.
 */
export async function generateContextualGuidance(
  request: ContextualGuidanceRequest,
  userId?: string,
): Promise<ContextualGuidanceResponse> {
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  try {
    const { viewType, documentId } = request;

    // Resolve the current user's person document for personalized guidance
    const actor = userId ? await resolveActor(userId, request.workspaceId) : null;

    if (viewType === 'issue' && documentId) {
      return await generateIssueGuidance(client, documentId, actor?.personId);
    }

    if (viewType === 'week' && documentId) {
      return await generateWeekGuidance(client, documentId);
    }

    if (viewType === 'person' && documentId) {
      return await generatePersonGuidance(client, documentId);
    }

    return {
      summary: `Guidance for ${viewType} view is available. Select a specific document for detailed recommendations.`,
      findings: [],
      recommendations: [],
    };
  } catch (err) {
    console.error('Contextual guidance generation failed:', err);
    return {
      summary: 'Unable to generate guidance at this time.',
      findings: [],
      recommendations: [],
      fallback: { message: 'Guidance generation encountered an error.', retryable: true },
    };
  }
}

async function generateIssueGuidance(
  client: ShipAPIClient,
  issueId: string,
  _actorPersonId?: string,
): Promise<ContextualGuidanceResponse> {
  const issue = await client.getIssue(issueId);
  const findings: FleetGraphFinding[] = [];
  const recommendations: FleetGraphRecommendation[] = [];

  const state = issue.properties.state;
  const daysSinceUpdate = (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24);

  if (state === 'in_progress' && daysSinceUpdate > 3) {
    findings.push({
      id: `finding-${uuid()}`,
      category: 'stale_work',
      severity: 'medium',
      headline: `This issue hasn't been updated in ${Math.floor(daysSinceUpdate)} days`,
      rationale: 'Consider posting a progress update or re-evaluating the approach.',
      evidence: [`Last updated: ${issue.updated_at}`],
      relatedDocumentIds: [issueId],
      recommendedAudience: issue.properties.assignee_id ? [issue.properties.assignee_id] : [],
      requiresHumanAction: true,
      confidence: 0.8,
    });
  }

  return {
    summary: `Issue "${issue.title}" is ${state}${issue.properties.assignee_id ? '' : ' (unassigned)'}.`,
    findings,
    recommendations,
  };
}

async function generateWeekGuidance(
  client: ShipAPIClient,
  weekId: string,
): Promise<ContextualGuidanceResponse> {
  const [week, issues] = await Promise.all([
    client.getWeek(weekId),
    client.getWeekIssues(weekId),
  ]);

  const done = issues.filter(i => i.properties.state === 'done').length;
  const inProgress = issues.filter(i => i.properties.state === 'in_progress').length;
  const total = issues.length;

  return {
    summary: `Week ${week.properties.sprint_number}: ${done}/${total} done, ${inProgress} in progress.`,
    findings: [],
    recommendations: [],
  };
}

async function generatePersonGuidance(
  client: ShipAPIClient,
  personId: string,
): Promise<ContextualGuidanceResponse> {
  const person = await client.getDocument(personId);
  const issues = await client.listIssues({ assignee_id: personId });

  const ranked = rankNextWork(issues as ShipIssue[]);
  const recommendations: FleetGraphRecommendation[] = ranked.slice(0, 3).map((issue, index) => ({
    id: `rec-next-${uuid()}`,
    type: 'escalate' as const,
    reason: `Priority ${index + 1}: ${issue.title} (${issue.properties.state}, ${issue.properties.priority})`,
    expectedImpact: 'Progresses highest-priority active work.',
    approvalStatus: 'not_required' as const,
    affectedDocumentIds: [issue.id],
  }));

  return {
    summary: `${person.title} has ${issues.length} assigned issues. Top recommendations based on priority and state.`,
    findings: [],
    recommendations,
  };
}

/**
 * Rank issues by priority for next-work recommendations.
 */
function rankNextWork(issues: ShipIssue[]): ShipIssue[] {
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const stateOrder: Record<string, number> = {
    in_progress: 0,  // Continue what's started
    in_review: 1,    // Finish what's almost done
    todo: 2,         // Start new work
    triage: 3,
    backlog: 4,
  };

  return [...issues]
    .filter(i => !['done', 'cancelled'].includes(i.properties.state))
    .sort((a, b) => {
      const stateA = stateOrder[a.properties.state] ?? 5;
      const stateB = stateOrder[b.properties.state] ?? 5;
      if (stateA !== stateB) return stateA - stateB;

      const prioA = priorityOrder[a.properties.priority] ?? 4;
      const prioB = priorityOrder[b.properties.priority] ?? 4;
      return prioA - prioB;
    });
}

/**
 * Generate an automated draft (standup, weekly plan, etc.).
 */
export async function generateDraft(
  request: CreateDraftRequest,
): Promise<CreateDraftResponse> {
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  try {
    const { draftType, sourceContext } = request;

    if (draftType === 'standup') {
      return await generateStandupDraft(client, sourceContext);
    }

    if (draftType === 'weekly_plan') {
      return await generateWeeklyPlanDraft(client, sourceContext);
    }

    return {
      draft: {
        type: draftType,
        title: 'Untitled',
        body: '',
        status: 'draft',
        automated: true,
      },
    };
  } catch (err) {
    console.error('Draft generation failed:', err);
    return {
      draft: {
        type: request.draftType,
        title: 'Untitled',
        body: 'Draft generation encountered an error. Please try again.',
        status: 'draft',
        automated: true,
      },
    };
  }
}

async function generateStandupDraft(
  client: ShipAPIClient,
  sourceContext: Record<string, unknown>,
): Promise<CreateDraftResponse> {
  const personId = sourceContext.personId as string | undefined;

  let body = '';
  if (personId) {
    const issues = await client.listIssues({ assignee_id: personId });
    const inProgress = issues.filter(i => i.properties.state === 'in_progress');
    const done = issues.filter(i => i.properties.state === 'done');
    const blocked = issues.filter(i => i.properties.state === 'in_review'); // approximate

    body = [
      '**Done**:',
      done.length > 0 ? done.map(i => `- ${i.title}`).join('\n') : '- (none)',
      '',
      '**In Progress**:',
      inProgress.length > 0 ? inProgress.map(i => `- ${i.title}`).join('\n') : '- (none)',
      '',
      '**Blockers**:',
      blocked.length > 0 ? blocked.map(i => `- ${i.title}`).join('\n') : '- None',
    ].join('\n');
  }

  return {
    draft: {
      type: 'standup',
      title: 'Untitled',
      body,
      status: 'draft',
      automated: true,
    },
  };
}

async function generateWeeklyPlanDraft(
  client: ShipAPIClient,
  sourceContext: Record<string, unknown>,
): Promise<CreateDraftResponse> {
  const weekId = sourceContext.weekId as string | undefined;

  let body = '';
  if (weekId) {
    const issues = await client.getWeekIssues(weekId);
    const todo = issues.filter(i => i.properties.state === 'todo' || i.properties.state === 'backlog');

    body = [
      '**Planned Work**:',
      todo.length > 0 ? todo.map(i => `- ${i.title} (${i.properties.priority})`).join('\n') : '- (no planned issues)',
      '',
      '**Goals**:',
      '- ',
      '',
      '**Risks**:',
      '- ',
    ].join('\n');
  }

  return {
    draft: {
      type: 'weekly_plan',
      title: 'Untitled',
      body,
      status: 'draft',
      automated: true,
    },
  };
}
