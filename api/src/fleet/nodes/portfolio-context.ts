/**
 * T034: Portfolio scope context and aggregation nodes.
 */

import type { FleetGraphStateType } from '../graph.js';
import { ShipAPIClient } from '../ship-api-client.js';
import { getFleetGraphConfig } from '../runtime.js';

/**
 * Context node for portfolio: builds summary of programs.
 */
export async function portfolioContextNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  try {
    const programs = await client.listPrograms();
    return {
      contextSummary: `Portfolio: ${programs.length} programs`,
      fetchedResources: programs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      errors: [`Failed to fetch portfolio context: ${message}`],
      contextSummary: 'Portfolio context unavailable.',
    };
  }
}

/**
 * Fetch node for portfolio: enriches with project-level data.
 */
export async function portfolioFetchNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  try {
    const projects = await client.listProjects();
    return {
      fetchedResources: [...state.fetchedResources, ...projects],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      errors: [`Failed to fetch portfolio projects: ${message}`],
    };
  }
}
