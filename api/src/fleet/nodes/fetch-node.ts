import type { DegradationTier } from '@ship/shared';
import type { FleetGraphStateType } from '../graph.js';
import { logFleetGraph } from '../observability.js';
import { getFleetGraphConfig } from '../runtime.js';
import { ShipAPIClient, type ShipDocument, type ShipIssue, type ShipWeek } from '../ship-api-client.js';

function createClient(): ShipAPIClient {
  const config = getFleetGraphConfig();
  return new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });
}

function normalizeIssue(raw: any): ShipIssue {
  if (raw.document_type === 'issue' && raw.properties?.state) {
    return raw as ShipIssue;
  }
  return {
    ...raw,
    document_type: 'issue',
    workspace_id: raw.workspace_id ?? '',
    title: raw.title ?? 'Untitled',
    properties: {
      state: raw.state ?? 'unknown',
      priority: raw.priority ?? 'medium',
      assignee_id: raw.assignee_id ?? null,
      estimate: raw.estimate ?? null,
      due_date: raw.due_date ?? null,
    },
  } as ShipIssue;
}

function normalizeWeek(raw: any): ShipWeek {
  if (raw.document_type === 'sprint' && raw.properties?.sprint_number != null) {
    return raw as ShipWeek;
  }
  return {
    ...raw,
    document_type: 'sprint',
    title: raw.title ?? raw.name ?? 'Untitled',
    workspace_id: raw.workspace_id ?? '',
    properties: {
      sprint_number: raw.sprint_number ?? 0,
      owner_id: raw.owner_id ?? '',
      status: raw.status ?? undefined,
      plan_approval: raw.plan_approval ?? null,
    },
  } as ShipWeek;
}

async function runFetch(
  name: string,
  fn: () => Promise<ShipDocument[]>,
  errors: string[],
): Promise<ShipDocument[]> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Fetch ${name} failed: ${message}`);
    return [];
  }
}

function dedupeResources(resources: ShipDocument[]): ShipDocument[] {
  const merged = new Map<string, ShipDocument>();

  for (const [index, resource] of resources.entries()) {
    if (!resource.id) {
      merged.set(`missing-id-${index}`, resource);
      continue;
    }

    const existing = merged.get(resource.id);
    if (!existing) {
      merged.set(resource.id, resource);
      continue;
    }

    const existingScope = getScopePriority((existing as any)._scope);
    const incomingScope = getScopePriority((resource as any)._scope);

    if (incomingScope > existingScope) {
      merged.set(resource.id, { ...existing, ...resource });
      continue;
    }

    merged.set(resource.id, { ...resource, ...existing });
  }

  return Array.from(merged.values());
}

function getScopePriority(scope?: string): number {
  switch (scope) {
    case 'project':
      return 5;
    case 'week':
      return 4;
    case 'person':
      return 3;
    case 'actor':
      return 2;
    case 'workspace-unassigned':
      return 1;
    default:
      return 0;
  }
}

export async function fetchNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const client = createClient();
  const { invocation } = state;
  const errors: string[] = [];
  let resources: ShipDocument[] = [];

  if (invocation.mode === 'event' && invocation.eventType === 'assignment_changed' && invocation.eventPayload) {
    const { issueId, projectId, oldAssigneeId, newAssigneeId } = invocation.eventPayload;

    const fetches = await Promise.all([
      runFetch('issue', async () => [await client.getDocument(issueId)], errors),
      runFetch('project', async () => projectId ? [await client.getDocument(projectId)] : [], errors),
      runFetch('project-issues', async () => {
        if (!projectId) return [];
        return (await client.listIssues({ project_id: projectId })).map(normalizeIssue);
      }, errors),
      runFetch('new-assignee-issues', async () => {
        if (!newAssigneeId) return [];
        return (await client.listIssues({ assignee_id: newAssigneeId })).map(issue => ({ ...normalizeIssue(issue), _scope: 'new-assignee' } as any));
      }, errors),
      runFetch('old-assignee-issues', async () => {
        if (!oldAssigneeId) return [];
        return (await client.listIssues({ assignee_id: oldAssigneeId })).map(issue => ({ ...normalizeIssue(issue), _scope: 'old-assignee' } as any));
      }, errors),
      runFetch('team', async () => await client.listTeam(), errors),
    ]);

    resources = fetches.flat();
  } else {
    const fetchers: Array<Promise<ShipDocument[]>> = [];
    const shouldFetchWorkspaceUnassigned = invocation.mode === 'chat';

    if (invocation.actorUserId) {
      fetchers.push(runFetch('actor-issues', async () => {
        const issues = await client.listIssues({ assignee_id: invocation.actorUserId! });
        return issues.map(issue => ({ ...normalizeIssue(issue), _scope: 'actor' } as any));
      }, errors));
    }

    if (shouldFetchWorkspaceUnassigned) {
      fetchers.push(runFetch('workspace-unassigned-issues', async () => {
        const issues = await client.listIssues({ assignee_id: 'unassigned' });
        return issues.map(issue => ({ ...normalizeIssue(issue), _scope: 'workspace-unassigned' } as any));
      }, errors));
    }

    if (invocation.actorPersonId) {
      fetchers.push(runFetch('actor', async () => [await client.getDocument(invocation.actorPersonId!)], errors));
    }

    if (invocation.viewType === 'project' && invocation.documentId) {
      fetchers.push(runFetch('project', async () => [await client.getDocument(invocation.documentId!)], errors));
      fetchers.push(runFetch('project-issues', async () =>
        (await client.listIssues({ project_id: invocation.documentId! }))
          .map(issue => ({ ...normalizeIssue(issue), _scope: 'project' } as any)), errors));
    } else if (invocation.viewType === 'week' && invocation.documentId) {
      fetchers.push(runFetch('week', async () => [normalizeWeek(await client.getWeek(invocation.documentId!))], errors));
      fetchers.push(runFetch('week-issues', async () =>
        (await client.getWeekIssues(invocation.documentId!))
          .map(issue => ({ ...normalizeIssue(issue), _scope: 'week' } as any)), errors));
    } else if (invocation.viewType === 'issue' && invocation.documentId) {
      const issueDocs = await runFetch('issue', async () => [await client.getDocument(invocation.documentId!)], errors);
      resources.push(...issueDocs);
      const issue = issueDocs[0];
      const projectId = issue?.belongs_to?.find((assoc) => assoc.type === 'project')?.id;
      const siblingFetches = await Promise.all([
        runFetch('issue-project', async () => projectId ? [await client.getDocument(projectId)] : [], errors),
        runFetch('issue-project-siblings', async () => projectId
          ? (await client.listIssues({ project_id: projectId }))
            .map(issue => ({ ...normalizeIssue(issue), _scope: 'project' } as any))
          : [], errors),
      ]);
      resources.push(...siblingFetches.flat());
    } else if (invocation.viewType === 'person' && invocation.documentId) {
      const personDocs = await runFetch('person', async () => [await client.getDocument(invocation.documentId!)], errors);
      resources.push(...personDocs);
      const personUserId = String(personDocs[0]?.properties?.user_id ?? '');
      if (personUserId) {
        fetchers.push(runFetch('person-issues', async () => {
          const issues = await client.listIssues({ assignee_id: personUserId });
          return issues.map(issue => ({ ...normalizeIssue(issue), _scope: 'person' } as any));
        }, errors));
      }
    }

    const fetched = await Promise.all(fetchers);
    resources.push(...fetched.flat());
  }

  resources = dedupeResources(resources);

  let degradationTier: DegradationTier = 'full';
  if (errors.length > 0 && resources.length > 0) {
    degradationTier = 'partial';
  } else if (errors.length > 0) {
    degradationTier = 'offline';
  }

  logFleetGraph({
    level: 'info',
    correlationId: invocation.correlationId,
    action: 'fetch',
    message: 'Fetched FleetGraph resources',
    metadata: {
      viewType: invocation.viewType,
      documentId: invocation.documentId ?? null,
      fetchedIssues: resources
        .filter((resource) => resource.document_type === 'issue')
        .map((resource: any) => ({
          id: resource.id,
          title: resource.title,
          scope: resource._scope ?? 'workspace',
          state: resource.properties?.state ?? null,
          priority: resource.properties?.priority ?? null,
          assigneeId: resource.properties?.assignee_id ?? null,
        })),
      totalResources: resources.length,
      errors,
    },
  });

  return {
    fetchedResources: resources,
    degradationTier,
    errors,
  };
}
