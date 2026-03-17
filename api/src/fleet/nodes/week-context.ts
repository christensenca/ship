/**
 * T016: Week-scope context and fetch nodes for proactive findings.
 *
 * These LangGraph nodes fetch the week document and its associated issues
 * to build context for risk detection.
 */

import type { FleetGraphStateType } from '../graph.js';
import { ShipAPIClient } from '../ship-api-client.js';
import { getFleetGraphConfig } from '../runtime.js';

/**
 * Context node: Builds a summary of the current week scope.
 */
export async function weekContextNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { invocation } = state;
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  try {
    const weekId = invocation.documentId;
    if (!weekId) {
      return {
        errors: ['No document ID provided for week context'],
        contextSummary: 'Unable to determine week scope.',
      };
    }

    const week = await client.getWeek(weekId);
    const sprintNumber = week.properties.sprint_number;
    const ownerName = week.properties.owner_id ?? 'unassigned';
    const planApproval = week.properties.plan_approval?.state ?? 'none';

    return {
      contextSummary: `Week ${sprintNumber} (owner: ${ownerName}, plan approval: ${planApproval})`,
      fetchedResources: [week],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      errors: [`Failed to fetch week context: ${message}`],
      contextSummary: 'Week context unavailable.',
    };
  }
}

/**
 * Fetch node: Retrieves all issues associated with the current week.
 */
export async function weekFetchNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { invocation, fetchedResources } = state;
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  try {
    const weekId = invocation.documentId;
    if (!weekId) {
      return { errors: ['No week document ID for issue fetch'] };
    }

    const issues = await client.getWeekIssues(weekId);
    return {
      fetchedResources: [...fetchedResources, ...issues],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      errors: [`Failed to fetch week issues: ${message}`],
    };
  }
}
