import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import type { CascadeWarning, IncompleteChild, BelongsTo, BelongsToType } from '@ship/shared';

type ApiError = Error & { status: number };
type IssuesQueryKey = QueryKey;
type IssuesAllKey = readonly ['issues'];
type IssuesListKey = readonly ['issues', 'list'];
type IssuesFilteredListKey = readonly ['issues', 'list', IssueFilters | undefined];
type IssuesDetailsKey = readonly ['issues', 'detail'];
type IssuesDetailKey = readonly ['issues', 'detail', string];
const allIssueKey: IssuesAllKey = ['issues'];

interface CreateIssueContext {
  previousIssues?: Issue[];
  optimisticId?: string;
}

interface UpdateIssueMutationData {
  id: string;
  updates: Partial<Issue>;
}

interface UpdateIssueContext {
  previousIssues?: Issue[];
}

interface BulkUpdateContext {
  previousIssues?: Issue[];
}

interface UseIssuesResult {
  issues: Issue[];
  loading: boolean;
  createIssue: (options?: CreateIssueOptions) => Promise<Issue | null>;
  updateIssue: (id: string, updates: Partial<Issue>) => Promise<Issue | null>;
  refreshIssues: () => Promise<void>;
}

// Custom error type for cascade warning (409 response)
export class CascadeWarningError extends Error {
  status = 409;
  warning: CascadeWarning;

  constructor(warning: CascadeWarning) {
    super(warning.message);
    this.name = 'CascadeWarningError';
    this.warning = warning;
  }
}

// Type guard for CascadeWarningError
export function isCascadeWarningError(error: unknown): error is CascadeWarningError {
  return error instanceof CascadeWarningError;
}

// Re-export for convenience
export type { CascadeWarning, IncompleteChild, BelongsTo, BelongsToType };

export interface Issue {
  id: string;
  title: string;
  state: string;
  priority: string;
  ticket_number: number;
  display_id: string;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_archived?: boolean;
  estimate: number | null;
  // belongs_to array contains all associations (program, sprint, project, parent)
  belongs_to: BelongsTo[];
  source: 'internal' | 'external';
  rejection_reason: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  reopened_at?: string | null;
  converted_from_id?: string | null;
}

// Helper to extract association ID by type
export function getAssociationId(issue: Issue, type: BelongsToType): string | null {
  const association = issue.belongs_to?.find((a: BelongsTo): boolean => a.type === type);
  return association?.id ?? null;
}

// Helper to get program ID from belongs_to
export function getProgramId(issue: Issue): string | null {
  return getAssociationId(issue, 'program');
}

// Helper to get sprint ID from belongs_to
export function getSprintId(issue: Issue): string | null {
  return getAssociationId(issue, 'sprint');
}

// Helper to get project ID from belongs_to
export function getProjectId(issue: Issue): string | null {
  return getAssociationId(issue, 'project');
}

// Helper to get association title by type (e.g., program name)
export function getAssociationTitle(issue: Issue, type: BelongsToType): string | null {
  const association = issue.belongs_to?.find((a: BelongsTo): boolean => a.type === type);
  return association?.title ?? null;
}

// Helper to get program title from belongs_to
export function getProgramTitle(issue: Issue): string | null {
  return getAssociationTitle(issue, 'program');
}

// Helper to get project title from belongs_to
export function getProjectTitle(issue: Issue): string | null {
  return getAssociationTitle(issue, 'project');
}

// Helper to get sprint title from belongs_to
export function getSprintTitle(issue: Issue): string | null {
  return getAssociationTitle(issue, 'sprint');
}

// Filter interface for locked context
export interface IssueFilters {
  programId?: string;
  projectId?: string;
  sprintId?: string;
}

interface ApiIssueShape extends Omit<Issue, 'belongs_to'> {
  belongs_to?: BelongsTo[];
}

interface CascadeWarningResponse {
  error?: string;
  message?: string;
  incomplete_children?: IncompleteChild[];
  confirm_action?: string;
}

function createApiError(message: string, status: number): ApiError {
  return Object.assign(new Error(message), { status });
}

function isCascadeWarningResponse(value: CascadeWarningResponse): value is CascadeWarning {
  return (
    value.error === 'incomplete_children' &&
    typeof value.message === 'string' &&
    Array.isArray(value.incomplete_children) &&
    typeof value.confirm_action === 'string'
  );
}

// Query keys
export const issueKeys = {
  all: allIssueKey,
  lists: (): IssuesListKey => ['issues', 'list'],
  list: (filters?: IssueFilters): IssuesFilteredListKey => ['issues', 'list', filters],
  details: (): IssuesDetailsKey => ['issues', 'detail'],
  detail: (id: string): IssuesDetailKey => ['issues', 'detail', id],
};

// Transform API issue response to Issue type
function transformIssue(apiIssue: ApiIssueShape): Issue {
  const belongs_to = apiIssue.belongs_to ?? [];
  return {
    ...apiIssue,
    belongs_to,
  };
}

// Fetch issues with optional filters
async function fetchIssues(filters?: IssueFilters): Promise<Issue[]> {
  const params = new URLSearchParams();
  if (filters?.programId) params.append('program_id', filters.programId);
  if (filters?.sprintId) params.append('sprint_id', filters.sprintId);
  // Note: projectId filtering is done client-side via belongs_to array

  const queryString = params.toString();
  const url = queryString ? `/api/issues?${queryString}` : '/api/issues';

  const res = await apiGet(url);
  if (!res.ok) {
    throw createApiError('Failed to fetch issues', res.status);
  }
  const data: ApiIssueShape[] = await res.json();
  let issues = data.map(transformIssue);

  // Client-side filter for projectId (API doesn't support direct project_id param)
  if (filters?.projectId) {
    issues = issues.filter((issue: Issue): boolean => {
      const projectAssoc = issue.belongs_to?.find((a: BelongsTo): boolean => a.type === 'project');
      return projectAssoc?.id === filters.projectId;
    });
  }

  return issues;
}

// Create issue
interface CreateIssueData {
  title?: string;
  belongs_to?: BelongsTo[];
}

async function createIssueApi(data: CreateIssueData): Promise<Issue> {
  const apiData: Record<string, unknown> = { title: data.title ?? 'Untitled' };
  if (data.belongs_to && data.belongs_to.length > 0) {
    apiData.belongs_to = data.belongs_to;
  }

  const res = await apiPost('/api/issues', apiData);
  if (!res.ok) {
    throw createApiError('Failed to create issue', res.status);
  }
  const apiIssue: ApiIssueShape = await res.json();
  return transformIssue(apiIssue);
}

// Update issue
async function updateIssueApi(id: string, updates: Partial<Issue>): Promise<Issue> {
  // API accepts belongs_to directly - no conversion needed
  const res = await apiPatch(`/api/issues/${id}`, updates);
  if (!res.ok) {
    // Check for cascade warning (409 with incomplete_children)
    if (res.status === 409) {
      const body: CascadeWarningResponse = await res.json();
      if (isCascadeWarningResponse(body)) {
        throw new CascadeWarningError(body);
      }
    }
    throw createApiError('Failed to update issue', res.status);
  }
  const apiIssue: ApiIssueShape = await res.json();
  return transformIssue(apiIssue);
}

// Hook to get issues with optional filters
export interface UseIssuesQueryOptions {
  /** Whether the query should execute. Default: true */
  enabled?: boolean;
}

export function useIssuesQuery(filters?: IssueFilters, options?: UseIssuesQueryOptions): UseQueryResult<Issue[], ApiError> {
  const { enabled = true } = options ?? {};
  return useQuery({
    queryKey: issueKeys.list(filters),
    queryFn: (): Promise<Issue[]> => fetchIssues(filters),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });
}

// Hook to create issue with optimistic update
export function useCreateIssue(): UseMutationResult<Issue, ApiError, CreateIssueData | undefined, CreateIssueContext | undefined> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: CreateIssueData): Promise<Issue> => createIssueApi(data || {}),
    onMutate: async (newIssue: CreateIssueData | undefined): Promise<CreateIssueContext> => {
      await queryClient.cancelQueries({ queryKey: issueKeys.lists() });
      const previousIssues = queryClient.getQueryData<Issue[]>(issueKeys.lists());

      // Use belongs_to directly from input
      const belongs_to: BelongsTo[] = newIssue?.belongs_to || [];

      const optimisticIssue: Issue = {
        id: `temp-${crypto.randomUUID()}`,
        title: newIssue?.title ?? 'Untitled',
        state: 'backlog',
        priority: 'none',
        ticket_number: -1,
        display_id: 'PENDING',
        assignee_id: null,
        assignee_name: null,
        estimate: null,
        belongs_to,
        source: 'internal',
        rejection_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Issue[]>(
        issueKeys.lists(),
        (old: Issue[] | undefined): Issue[] => [optimisticIssue, ...(old || [])]
      );

      return { previousIssues, optimisticId: optimisticIssue.id };
    },
    onError: (_err: ApiError, _newIssue: CreateIssueData | undefined, context: CreateIssueContext | undefined): void => {
      if (context?.previousIssues) {
        queryClient.setQueryData(issueKeys.lists(), context.previousIssues);
      }
    },
    onSuccess: (data: Issue, _variables: CreateIssueData | undefined, context: CreateIssueContext | undefined): void => {
      if (context?.optimisticId) {
        queryClient.setQueryData<Issue[]>(
          issueKeys.lists(),
          (old: Issue[] | undefined): Issue[] => old?.map((i: Issue): Issue => i.id === context.optimisticId ? data : i) || [data]
        );
      }
    },
    onSettled: (): void => {
      queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
    },
  });
}

// Hook to update issue with optimistic update
export function useUpdateIssue(): UseMutationResult<Issue, ApiError, UpdateIssueMutationData, UpdateIssueContext> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: UpdateIssueMutationData): Promise<Issue> =>
      updateIssueApi(id, updates),
    onMutate: async ({ id, updates }: UpdateIssueMutationData): Promise<UpdateIssueContext> => {
      await queryClient.cancelQueries({ queryKey: issueKeys.lists() });
      const previousIssues = queryClient.getQueryData<Issue[]>(issueKeys.lists());

      queryClient.setQueryData<Issue[]>(
        issueKeys.lists(),
        (old: Issue[] | undefined): Issue[] => old?.map((i: Issue): Issue => {
          if (i.id !== id) return i;

          // Merge belongs_to: if updates contains belongs_to, use it; otherwise keep existing
          const newBelongsTo = updates.belongs_to ?? i.belongs_to ?? [];

          return { ...i, ...updates, belongs_to: newBelongsTo };
        }) || []
      );

      return { previousIssues };
    },
    onError: (_err: ApiError, _variables: UpdateIssueMutationData, context: UpdateIssueContext | undefined): void => {
      if (context?.previousIssues) {
        queryClient.setQueryData(issueKeys.lists(), context.previousIssues);
      }
    },
    onSuccess: (data: Issue, { id }: UpdateIssueMutationData): void => {
      queryClient.setQueryData<Issue[]>(
        issueKeys.lists(),
        (old: Issue[] | undefined): Issue[] => old?.map((i: Issue): Issue => i.id === id ? data : i) || []
      );
    },
    onSettled: (): void => {
      queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
    },
  });
}

// Bulk update issues
interface BulkUpdateRequest {
  ids: string[];
  action: 'archive' | 'delete' | 'restore' | 'update';
  updates?: {
    state?: string;
    assignee_id?: string | null;
    sprint_id?: string | null;
    project_id?: string | null;
  };
}

interface BulkUpdateResponse {
  updated: Issue[];
  failed: { id: string; error: string }[];
}

async function bulkUpdateIssuesApi(data: BulkUpdateRequest): Promise<BulkUpdateResponse> {
  const res = await apiPost('/api/issues/bulk', data);
  if (!res.ok) {
    throw createApiError('Failed to bulk update issues', res.status);
  }
  return res.json();
}

// Hook for bulk updates
export function useBulkUpdateIssues(): UseMutationResult<BulkUpdateResponse, ApiError, BulkUpdateRequest, BulkUpdateContext> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkUpdateRequest): Promise<BulkUpdateResponse> => bulkUpdateIssuesApi(data),
    onMutate: async ({ ids, action, updates }: BulkUpdateRequest): Promise<BulkUpdateContext> => {
      await queryClient.cancelQueries({ queryKey: issueKeys.lists() });
      const previousIssues = queryClient.getQueryData<Issue[]>(issueKeys.lists());

      queryClient.setQueryData<Issue[]>(issueKeys.lists(), (old: Issue[] | undefined): Issue[] | undefined => {
        if (!old) return old;

        if (action === 'archive' || action === 'delete') {
          return old.filter((i: Issue): boolean => !ids.includes(i.id));
        }

        if (action === 'update' && updates) {
          return old.map((i: Issue): Issue => {
            if (!ids.includes(i.id)) return i;

            // Start with existing belongs_to
            let newBelongsTo = [...(i.belongs_to || [])];

            // Handle project_id update: update or add project association
            if ('project_id' in updates) {
              newBelongsTo = newBelongsTo.filter((a: BelongsTo): boolean => a.type !== 'project');
              if (updates.project_id) {
                newBelongsTo.push({ id: updates.project_id, type: 'project' });
              }
            }

            // Handle sprint_id update: update or add sprint association
            if ('sprint_id' in updates) {
              newBelongsTo = newBelongsTo.filter((a: BelongsTo): boolean => a.type !== 'sprint');
              if (updates.sprint_id) {
                newBelongsTo.push({ id: updates.sprint_id, type: 'sprint' });
              }
            }

            // Apply state and assignee_id updates directly
            const { project_id: _p, sprint_id: _s, ...directUpdates } = updates;
            return { ...i, ...directUpdates, belongs_to: newBelongsTo };
          });
        }

        return old;
      });

      return { previousIssues };
    },
    onError: (_err: ApiError, _variables: BulkUpdateRequest, context: BulkUpdateContext | undefined): void => {
      if (context?.previousIssues) {
        queryClient.setQueryData(issueKeys.lists(), context.previousIssues);
      }
    },
    onSettled: (): void => {
      queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
    },
  });
}

// Options for creating an issue
export interface CreateIssueOptions {
  belongs_to?: BelongsTo[];
}

// Compatibility hook that matches the old useIssues interface
export function useIssues(): UseIssuesResult {
  const { data: issues = [], isLoading: loading, refetch } = useIssuesQuery();
  const createMutation = useCreateIssue();
  const updateMutation = useUpdateIssue();

  const createIssue = async (options?: CreateIssueOptions): Promise<Issue | null> => {
    try {
      return await createMutation.mutateAsync(options || {});
    } catch {
      return null;
    }
  };

  const updateIssue = async (id: string, updates: Partial<Issue>): Promise<Issue | null> => {
    try {
      return await updateMutation.mutateAsync({ id, updates });
    } catch (error) {
      // Re-throw CascadeWarningError so UI can handle it (show confirmation dialog)
      if (isCascadeWarningError(error)) {
        throw error;
      }
      return null;
    }
  };

  const refreshIssues = async (): Promise<void> => {
    await refetch();
  };

  return {
    issues,
    loading,
    createIssue,
    updateIssue,
    refreshIssues,
  };
}
