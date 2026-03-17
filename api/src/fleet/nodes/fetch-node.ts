/**
 * Parallel fetch node — uses Promise.all to fetch issues, week, people, iterations.
 * Per-fetch try/catch for error isolation. Writes to fetchedResources and errors.
 */

import type { FleetGraphStateType } from '../graph.js';
import { ShipAPIClient, type ShipDocument, type ShipIssue, type ShipWeek } from '../ship-api-client.js';
import { getFleetGraphConfig } from '../runtime.js';
import type { DegradationTier } from '@ship/shared';

/**
 * Normalize flat API responses into the shapes expected by detectors.
 * Ship REST endpoints return flat objects, but detectors expect nested properties.
 */

function normalizeIssue(raw: any): ShipIssue {
  if (raw.document_type === 'issue' && raw.properties?.state) {
    return raw as ShipIssue;
  }
  return {
    ...raw,
    document_type: 'issue',
    workspace_id: raw.workspace_id ?? '',
    properties: {
      state: raw.state ?? 'unknown',
      priority: raw.priority ?? 'medium',
      assignee_id: raw.assignee_id ?? null,
      estimate: raw.estimate ?? null,
      due_date: raw.due_date ?? null,
    },
  } as ShipIssue;
}

function normalizeIssues(raws: any[]): ShipIssue[] {
  return raws.map(normalizeIssue);
}

function normalizeWeek(raw: any): ShipWeek {
  if (raw.document_type === 'sprint' && raw.properties?.sprint_number != null) {
    return raw as ShipWeek;
  }
  return {
    ...raw,
    document_type: 'sprint',
    title: raw.title ?? raw.name ?? `Week ${raw.sprint_number ?? '?'}`,
    workspace_id: raw.workspace_id ?? '',
    properties: {
      sprint_number: raw.sprint_number ?? 0,
      owner_id: raw.owner ?? '',
      status: raw.status ?? undefined,
      plan_approval: raw.has_plan ? { state: 'approved' } : null,
    },
  } as ShipWeek;
}

function createClient(): ShipAPIClient {
  const config = getFleetGraphConfig();
  return new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });
}

export async function fetchNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { invocation } = state;
  const client = createClient();

  const resources: ShipDocument[] = [];
  const errors: string[] = [];

  const fetchers: Array<{ name: string; fn: () => Promise<ShipDocument[]> }> = [];

  // Determine what to fetch based on view type and context
  if (invocation.viewType === 'week' && invocation.documentId) {
    fetchers.push({
      name: 'week',
      fn: async () => {
        const week = await client.getWeek(invocation.documentId!);
        return [normalizeWeek(week)];
      },
    });
    fetchers.push({
      name: 'week-issues',
      fn: async () => {
        const issues = await client.getWeekIssues(invocation.documentId!);
        return normalizeIssues(issues);
      },
    });
    fetchers.push({
      name: 'team',
      fn: async () => {
        const team = await client.listTeam();
        return team;
      },
    });
  } else if (invocation.viewType === 'issue' && invocation.documentId) {
    fetchers.push({
      name: 'issue',
      fn: async () => {
        // Use /documents/:id to get full document shape (with document_type, properties)
        const doc = await client.getDocument(invocation.documentId!);
        return [doc];
      },
    });
  } else if (invocation.viewType === 'person' && invocation.documentId) {
    fetchers.push({
      name: 'person',
      fn: async () => {
        const person = await client.getDocument(invocation.documentId!);
        return [person];
      },
    });
    fetchers.push({
      name: 'person-issues',
      fn: async () => {
        const issues = await client.listIssues({ assignee_id: invocation.documentId! });
        return normalizeIssues(issues);
      },
    });
  } else if (invocation.viewType === 'workspace' || !invocation.documentId) {
    // Workspace-wide: fetch all active weeks and their issues
    fetchers.push({
      name: 'weeks',
      fn: async () => {
        const weeks = await client.listWeeks();
        return weeks;
      },
    });
    fetchers.push({
      name: 'team',
      fn: async () => {
        const team = await client.listTeam();
        return team;
      },
    });
  } else if (invocation.viewType === 'project' && invocation.documentId) {
    fetchers.push({
      name: 'project',
      fn: async () => {
        const project = await client.getDocument(invocation.documentId!);
        return [project];
      },
    });
    // Also fetch project issues for richer context
    fetchers.push({
      name: 'project-issues',
      fn: async () => {
        const issues = await client.listIssues({ project_id: invocation.documentId! });
        return normalizeIssues(issues);
      },
    });
  } else if (invocation.viewType === 'program' && invocation.documentId) {
    fetchers.push({
      name: 'program',
      fn: async () => {
        const program = await client.getProgram(invocation.documentId!);
        return [program];
      },
    });
  }

  // Execute all fetches in parallel with per-fetch error isolation
  const results = await Promise.all(
    fetchers.map(async ({ name, fn }) => {
      try {
        return await fn();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Fetch ${name} failed: ${message}`);
        return [];
      }
    }),
  );

  for (const docs of results) {
    resources.push(...docs);
  }

  // Determine degradation tier based on fetch results
  let degradationTier: DegradationTier = 'full';
  if (errors.length > 0 && resources.length > 0) {
    degradationTier = 'partial';
  } else if (errors.length > 0 && resources.length === 0) {
    degradationTier = 'offline';
  }

  return {
    fetchedResources: resources,
    errors,
    degradationTier,
  };
}
