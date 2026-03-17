/**
 * T025: Issue, week, and person guidance context nodes.
 *
 * Fetches contextual data for on-demand guidance requests.
 */

import type { FleetGraphStateType } from '../graph.js';
import { ShipAPIClient } from '../ship-api-client.js';
import { getFleetGraphConfig } from '../runtime.js';

/**
 * Context node for guidance: builds summary based on view type.
 */
export async function guidanceContextNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { invocation } = state;
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  try {
    const { viewType, documentId } = invocation;

    switch (viewType) {
      case 'issue':
        return await buildIssueContext(client, documentId);
      case 'week':
        return await buildWeekContext(client, documentId);
      case 'person':
        return await buildPersonContext(client, documentId);
      case 'project':
        return await buildProjectContext(client, documentId);
      case 'program':
        return await buildProgramContext(client, documentId);
      default:
        return {
          contextSummary: `Guidance for ${viewType} view.`,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      errors: [`Failed to build guidance context: ${message}`],
      contextSummary: 'Context unavailable.',
    };
  }
}

async function buildIssueContext(client: ShipAPIClient, documentId?: string): Promise<Partial<FleetGraphStateType>> {
  if (!documentId) {
    return { contextSummary: 'No issue specified for guidance.' };
  }

  const issue = await client.getIssue(documentId);
  return {
    contextSummary: `Issue: ${issue.title} (#${issue.ticket_number}), state: ${issue.properties.state}, priority: ${issue.properties.priority}`,
    fetchedResources: [issue],
  };
}

async function buildWeekContext(client: ShipAPIClient, documentId?: string): Promise<Partial<FleetGraphStateType>> {
  if (!documentId) {
    return { contextSummary: 'No week specified for guidance.' };
  }

  const [week, issues] = await Promise.all([
    client.getWeek(documentId),
    client.getWeekIssues(documentId),
  ]);

  const inProgress = issues.filter(i => i.properties.state === 'in_progress').length;
  const done = issues.filter(i => i.properties.state === 'done').length;

  return {
    contextSummary: `Week ${week.properties.sprint_number}: ${issues.length} issues (${done} done, ${inProgress} in progress)`,
    fetchedResources: [week, ...issues],
  };
}

async function buildPersonContext(client: ShipAPIClient, documentId?: string): Promise<Partial<FleetGraphStateType>> {
  if (!documentId) {
    return { contextSummary: 'No person specified for guidance.' };
  }

  const person = await client.getDocument(documentId);
  const issues = await client.listIssues({ assignee_id: documentId });
  const activeIssues = issues.filter(i =>
    (i.properties as any).state === 'in_progress' || (i.properties as any).state === 'in_review'
  );

  return {
    contextSummary: `${person.title}: ${activeIssues.length} active issues, ${issues.length} total assigned`,
    fetchedResources: [person, ...issues],
  };
}

async function buildProjectContext(client: ShipAPIClient, documentId?: string): Promise<Partial<FleetGraphStateType>> {
  if (!documentId) {
    return { contextSummary: 'No project specified for guidance.' };
  }

  const project = await client.getDocument(documentId);
  return {
    contextSummary: `Project: ${project.title}`,
    fetchedResources: [project],
  };
}

async function buildProgramContext(client: ShipAPIClient, documentId?: string): Promise<Partial<FleetGraphStateType>> {
  if (!documentId) {
    return { contextSummary: 'No program specified for guidance.' };
  }

  const program = await client.getProgram(documentId);
  return {
    contextSummary: `Program: ${program.title}`,
    fetchedResources: [program],
  };
}

/**
 * Fetch node for guidance: enriches context with additional data.
 */
export async function guidanceFetchNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  // For now, the context node already fetches what we need.
  // This node exists as a graph hook for future enrichment.
  return {};
}
