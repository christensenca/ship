/**
 * Ship API Client - REST-only helpers for FleetGraph agent runtime.
 *
 * All agent data access goes through Ship REST endpoints.
 * No direct database queries from the agent.
 */

import type {
  FleetGraphViewType,
} from '@ship/shared';

export interface ShipAPIClientConfig {
  baseUrl: string;
  sessionCookie?: string;
  apiToken?: string;
}

export interface FetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Lightweight REST client for Ship API.
 * Used by FleetGraph nodes to read documents, issues, weeks, etc.
 */
export class ShipAPIClient {
  private baseUrl: string;
  private authHeader: Record<string, string>;

  constructor(config: ShipAPIClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.authHeader = config.apiToken
      ? { Authorization: `Bearer ${config.apiToken}` }
      : config.sessionCookie
        ? { Cookie: config.sessionCookie }
        : {};
  }

  private async request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeader,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ShipAPIError(res.status, `Ship API ${options.method ?? 'GET'} ${path} failed: ${res.status}`, text);
    }

    return res.json() as Promise<T>;
  }

  // === Document Reads ===

  async getDocument(id: string): Promise<ShipDocument> {
    return this.request<ShipDocument>(`/api/documents/${id}`);
  }

  async listDocumentsByType(type: string, workspaceId?: string): Promise<ShipDocument[]> {
    const params = new URLSearchParams({ document_type: type });
    if (workspaceId) params.set('workspace_id', workspaceId);
    return this.request<ShipDocument[]>(`/api/documents?${params}`);
  }

  // === Issues ===

  async listIssues(filters?: Record<string, string>): Promise<ShipIssue[]> {
    const params = filters ? new URLSearchParams(filters) : '';
    return this.request<ShipIssue[]>(`/api/issues${params ? `?${params}` : ''}`);
  }

  async getIssue(id: string): Promise<ShipIssue> {
    return this.request<ShipIssue>(`/api/issues/${id}`);
  }

  // === Weeks ===

  async listWeeks(): Promise<ShipWeek[]> {
    return this.request<ShipWeek[]>('/api/weeks');
  }

  async getWeek(id: string): Promise<ShipWeek> {
    return this.request<ShipWeek>(`/api/weeks/${id}`);
  }

  async getWeekIssues(weekId: string): Promise<ShipIssue[]> {
    return this.request<ShipIssue[]>(`/api/weeks/${weekId}/issues`);
  }

  // === Programs ===

  async listPrograms(): Promise<ShipProgram[]> {
    return this.request<ShipProgram[]>('/api/programs');
  }

  async getProgram(id: string): Promise<ShipProgram> {
    return this.request<ShipProgram>(`/api/programs/${id}`);
  }

  // === Projects ===

  async listProjects(): Promise<ShipProject[]> {
    return this.request<ShipProject[]>('/api/projects');
  }

  // === Team ===

  async listTeam(): Promise<ShipPerson[]> {
    return this.request<ShipPerson[]>('/api/team');
  }

  // === Activity ===

  async getRecentActivity(documentId?: string): Promise<ShipActivity[]> {
    const params = documentId ? `?document_id=${documentId}` : '';
    return this.request<ShipActivity[]>(`/api/activity${params}`);
  }

  // === View Context Helper ===

  async getViewContext(viewType: FleetGraphViewType, documentId?: string): Promise<ViewContext> {
    const context: ViewContext = { viewType, documentId };

    if (documentId) {
      context.document = await this.getDocument(documentId).catch(() => undefined);
    }

    return context;
  }
}

// === Error Class ===

export class ShipAPIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public responseBody?: string,
  ) {
    super(message);
    this.name = 'ShipAPIError';
  }
}

// === Lightweight response types (mirror API responses) ===

export interface ShipDocument {
  id: string;
  workspace_id: string;
  document_type: string;
  title: string;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  belongs_to?: Array<{ id: string; type: string; title?: string }>;
}

export interface ShipIssue extends ShipDocument {
  document_type: 'issue';
  ticket_number: number;
  properties: {
    state: string;
    priority: string;
    assignee_id?: string | null;
    estimate?: number | null;
    due_date?: string | null;
    [key: string]: unknown;
  };
}

export interface ShipWeek extends ShipDocument {
  document_type: 'sprint';
  properties: {
    sprint_number: number;
    owner_id: string;
    status?: string;
    plan_approval?: { state: string | null } | null;
    [key: string]: unknown;
  };
}

export interface ShipProgram extends ShipDocument {
  document_type: 'program';
}

export interface ShipProject extends ShipDocument {
  document_type: 'project';
}

export interface ShipPerson extends ShipDocument {
  document_type: 'person';
  properties: {
    email?: string | null;
    role?: string | null;
    capacity_hours?: number | null;
    [key: string]: unknown;
  };
}

export interface ShipActivity {
  id: string;
  document_id: string;
  action: string;
  created_at: string;
  user_id?: string;
  details?: Record<string, unknown>;
}

export interface ViewContext {
  viewType: FleetGraphViewType;
  documentId?: string;
  document?: ShipDocument;
}
