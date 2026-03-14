import { useCallback, useMemo, useEffect, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UnifiedEditor } from '@/components/UnifiedEditor';
import type { UnifiedDocument, SidebarData } from '@/components/UnifiedEditor';
import { useAuth } from '@/hooks/useAuth';
import { useAssignableMembersQuery } from '@/hooks/useTeamMembersQuery';
import { useProgramsQuery } from '@/hooks/useProgramsQuery';
import { useProjectsQuery } from '@/hooks/useProjectsQuery';
import { useDocumentConversion } from '@/hooks/useDocumentConversion';
import { apiGet, apiPatch, apiDelete, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { issueKeys } from '@/hooks/useIssuesQuery';
import { projectKeys, useProjectWeeksQuery } from '@/hooks/useProjectsQuery';
import { TabBar } from '@/components/ui/TabBar';
import { useCurrentDocument } from '@/contexts/CurrentDocumentContext';
import { useRealtimeEvent } from '@/hooks/useRealtimeEvents';
import {
  getDocumentConversionErrorMessage,
  getDocumentConversionPermission,
} from '@/lib/documentConversion';
import {
  getTabsForDocument,
  documentTypeHasTabs,
  resolveTabLabels,
  type DocumentResponse,
  type TabCounts,
} from '@/lib/document-tabs';

type UnifiedPageDocumentType =
  | 'wiki'
  | 'issue'
  | 'project'
  | 'program'
  | 'sprint'
  | 'person'
  | 'weekly_plan'
  | 'weekly_retro'
  | 'standup';

type BelongsToAssociation = {
  id: string;
  type: 'program' | 'project' | 'sprint' | 'parent';
  title?: string;
  color?: string;
};

function isUnifiedPageDocumentType(value: string): value is UnifiedPageDocumentType {
  return [
    'wiki',
    'issue',
    'project',
    'program',
    'sprint',
    'person',
    'weekly_plan',
    'weekly_retro',
    'standup',
  ].includes(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getNullableString(value: unknown): string | null | undefined {
  return typeof value === 'string' ? value : value === null ? null : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function getNullableNumber(value: unknown): number | null | undefined {
  return typeof value === 'number' ? value : value === null ? null : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

function getOwner(
  value: unknown
): { id: string; name: string; email: string } | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;

  const id = getString((value as Record<string, unknown>).id);
  const name = getString((value as Record<string, unknown>).name);
  const email = getString((value as Record<string, unknown>).email);

  return id && name && email ? { id, name, email } : undefined;
}

function getBelongsToAssociations(value: unknown): BelongsToAssociation[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((association) => {
    if (!association || typeof association !== 'object') return [];
    const record = association as Record<string, unknown>;
    const id = getString(record.id);
    const type = getString(record.type);
    if (!id || (type !== 'program' && type !== 'project' && type !== 'sprint' && type !== 'parent')) return [];

    return [{
      id,
      type,
      title: getString(record.title),
      color: getString(record.color),
    }];
  });
}

function getProgramAndSprintIds(belongsTo: BelongsToAssociation[] | undefined): {
  programId?: string;
  sprintId?: string;
} {
  return {
    programId: belongsTo?.find((association) => association.type === 'program')?.id,
    sprintId: belongsTo?.find((association) => association.type === 'sprint')?.id,
  };
}

/**
 * UnifiedDocumentPage - Renders any document type via /documents/:id route
 *
 * This page fetches a document by ID regardless of type and renders it
 * using the UnifiedEditor component with the appropriate sidebar data.
 * Document types with tabs (projects, programs) get a tabbed interface.
 */
export function UnifiedDocumentPage(): JSX.Element | null {
  const { id, '*': wildcardPath } = useParams<{ id: string; '*'?: string }>();
  const navigate = useNavigate();

  // Parse wildcard path into tab and nested path
  // Example: /documents/abc/sprints/xyz -> wildcardPath = "sprints/xyz" -> tab = "sprints", nestedPath = "xyz"
  const pathSegments = wildcardPath ? wildcardPath.split('/').filter(Boolean) : [];
  const urlTab = pathSegments[0] || undefined;
  const nestedPath = pathSegments.length > 1 ? pathSegments.slice(1).join('/') : undefined;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { setCurrentDocument, clearCurrentDocument } = useCurrentDocument();

  const handleRealtimeDocumentUpdate = useCallback((event: { data: Record<string, unknown> }): void => {
    if (!id) return;
    if (event.data.documentId !== id) return;

    queryClient.setQueryData<DocumentResponse | undefined>(['document', id], (current) => {
      if (!current) return current;

      return {
        ...current,
        ...(typeof event.data.title === 'string' ? { title: event.data.title } : {}),
        updated_at: new Date().toISOString(),
      };
    });
  }, [id, queryClient]);

  useRealtimeEvent('document:updated', handleRealtimeDocumentUpdate);

  // Fetch the document by ID
  const { data: document, isLoading, error } = useQuery<DocumentResponse>({
    queryKey: ['document', id],
    queryFn: async () => {
      const response = await apiGet(`/api/documents/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Document not found');
        }
        throw new Error('Failed to fetch document');
      }
      return response.json();
    },
    enabled: !!id,
    retry: false,
  });

  // Sync current document context for rail highlighting
  useEffect(() => {
    if (document && id) {
      if (!isUnifiedPageDocumentType(document.document_type)) return;

      // Extract projectId for weekly documents
      const projectId = (document.document_type === 'weekly_plan' || document.document_type === 'weekly_retro')
        ? getString(document.properties?.project_id) ?? null
        : null;
      setCurrentDocument(id, document.document_type, projectId);
    }
    return () => {
      clearCurrentDocument();
    };
  }, [document, id, setCurrentDocument, clearCurrentDocument]);



  // Set default active tab when document loads (status-aware for sprints)
  const tabConfig = document ? getTabsForDocument(document) : [];
  const hasTabs = document ? documentTypeHasTabs(document.document_type) : false;

  // Derive activeTab from URL - if valid tab in URL, use it; otherwise default to first tab
  const activeTab = useMemo((): string => {
    if (urlTab && tabConfig.some((tab): boolean => tab.id === urlTab)) {
      return urlTab;
    }
    return tabConfig[0]?.id || '';
  }, [urlTab, tabConfig]);

  // Redirect to clean URL if tab is invalid (prevents broken bookmarks and typos)
  useEffect(() => {
    if (!document || !id) return;

    // If URL has a tab but it's not valid for this document type, redirect to base URL
    const isValidTab = tabConfig.some(t => t.id === urlTab);
    if (urlTab && !isValidTab) {
      console.warn(`Invalid tab "${urlTab}" for document type "${document.document_type}", redirecting to base URL`);
      navigate(`/documents/${id}`, { replace: true });
    }
  }, [document, id, urlTab, tabConfig, navigate]);

  // Fetch team members for sidebar data
  const { data: teamMembersData = [] } = useAssignableMembersQuery();
  const teamMembers = useMemo(() => teamMembersData.map((member): { id: string; user_id: string; name: string; email: string } => ({
    id: member.id,
    user_id: member.user_id,
    name: member.name,
    email: member.email || '',
  })), [teamMembersData]);

  // Fetch programs for sidebar data
  const { data: programsData = [] } = useProgramsQuery();
  const programs = useMemo(() => programsData.map((program): { id: string; name: string; color: string; emoji?: string | null } => ({
    id: program.id,
    name: program.name,
    color: program.color || '#6366f1',
    emoji: program.emoji,
  })), [programsData]);

  // Fetch projects for issue sidebar (multi-association)
  const { data: projectsData = [] } = useProjectsQuery();
  const projects = useMemo(() => projectsData.map((project): { id: string; title: string; color?: string } => ({
    id: project.id,
    title: project.title,
    color: project.color,
  })), [projectsData]);

  // Fetch counts for tabs (project weeks, etc.)
  const isProject = document?.document_type === 'project';
  const isProgram = document?.document_type === 'program';
  const { data: projectWeeks = [] } = useProjectWeeksQuery(isProject ? id : undefined);

  // Compute tab counts based on document type
  const tabCounts: TabCounts = useMemo(() => {
    if (isProject) {
      const issueCount = getNumber(document?.issue_count) ?? 0;
      return {
        issues: issueCount,
        weeks: projectWeeks.length,
      };
    }
    if (isProgram) {
      // For programs, counts will be loaded by the tab components themselves
      return {};
    }
    return {};
  }, [document, isProject, isProgram, projectWeeks.length]);

  // Handler for when associations change (invalidate document query to refetch)
  const handleAssociationChange = useCallback((): void => {
    queryClient.invalidateQueries({ queryKey: ['document', id] });
  }, [queryClient, id]);

  // Document conversion (issue <-> project)
  const { convert, isConverting } = useDocumentConversion({
    navigateAfterConvert: true,
  });
  const conversionPermission = useMemo(() => getDocumentConversionPermission({
    documentType: document?.document_type ?? '',
    createdBy: document?.created_by,
    currentUserId: user?.id,
  }), [document?.created_by, document?.document_type, user?.id]);

  // Conversion callbacks that use the current document
  const handleConvert = useCallback((): void => {
    if (!document || !id) return;
    if (!conversionPermission.canConvert) {
      showToast(conversionPermission.reason || 'Failed to convert document', 'error');
      return;
    }
    if (document.document_type === 'issue' || document.document_type === 'project') {
      convert(id, document.document_type, document.title);
    }
  }, [conversionPermission.canConvert, conversionPermission.reason, convert, document, id, showToast]);

  const handleUndoConversion = useCallback(async (): Promise<void> => {
    if (!document || !id) return;

    try {
      const res = await apiPost(`/api/documents/${id}/undo-conversion`, {});

      if (res.ok) {
        // Invalidate caches to refresh the UI
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: issueKeys.lists() }),
          queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
          queryClient.invalidateQueries({ queryKey: ['document', id] }),
        ]);
        showToast('Conversion undone successfully', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || 'Failed to undo conversion', 'error');
      }
    } catch (_err) {
      showToast('Failed to undo conversion', 'error');
    }
  }, [document, id, queryClient, showToast]);

  // Handle document type change via DocumentTypeSelector
  const handleTypeChange = useCallback(async (newType: string): Promise<void> => {
    if (!document || !id) return;

    const currentType = document.document_type;

    // Only issue <-> project conversions are supported
    const isValidConversion =
      (currentType === 'issue' && newType === 'project') ||
      (currentType === 'project' && newType === 'issue');

    if (!isValidConversion) {
      showToast(`Converting ${currentType} to ${newType} is not supported`, 'error');
      return;
    }
    if (!conversionPermission.canConvert) {
      showToast(conversionPermission.reason || 'Failed to convert document', 'error');
      return;
    }

    try {
      const res = await apiPost(`/api/documents/${id}/convert`, { target_type: newType });

      if (res.ok) {
        const data = await res.json();

        // Invalidate caches
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: issueKeys.lists() }),
          queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
          queryClient.invalidateQueries({ queryKey: ['document', id] }),
        ]);

        // Navigate to the new document
        navigate(`/documents/${data.id}`, { replace: true });
      } else {
        const error = await res.json();
        showToast(getDocumentConversionErrorMessage(error.error, res.status), 'error');
      }
    } catch (_err) {
      showToast('Failed to convert document', 'error');
    }
  }, [conversionPermission.canConvert, conversionPermission.reason, document, id, navigate, queryClient, showToast]);

  // Handle WebSocket notification that document was converted
  const handleDocumentConverted = useCallback((newDocId: string): void => {
    navigate(`/documents/${newDocId}`, { replace: true });
  }, [navigate]);

  interface UpdateMutationVariables {
    documentId: string;
    updates: Partial<UnifiedDocument>;
  }

  interface UpdateMutationContext {
    previousDocument?: Record<string, unknown>;
    documentId: string;
  }

  const isTitleOnlyUpdate = useCallback((updates: Partial<UnifiedDocument>): boolean => {
    const keys = Object.keys(updates);
    return keys.length === 1 && keys[0] === 'title';
  }, []);

  // Update mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: async ({ documentId, updates }: UpdateMutationVariables): Promise<DocumentResponse> => {
      const response = await apiPatch(`/api/documents/${documentId}`, updates);
      if (!response.ok) {
        throw new Error('Failed to update document');
      }
      return response.json();
    },
    onMutate: async ({ documentId, updates }: UpdateMutationVariables): Promise<UpdateMutationContext> => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['document', documentId] });

      // Snapshot the previous value
      const previousDocument = queryClient.getQueryData<Record<string, unknown>>(['document', documentId]);

      // Optimistically update the document cache
      if (previousDocument) {
        queryClient.setQueryData(['document', documentId], { ...previousDocument, ...updates });
      }

      // Return context with the previous value for rollback
      return { previousDocument, documentId };
    },
    onError: (_err: Error, _variables: UpdateMutationVariables, context: UpdateMutationContext | undefined): void => {
      // Rollback to the previous value on error
      if (context?.previousDocument && context?.documentId) {
        queryClient.setQueryData(['document', context.documentId], context.previousDocument);
      }
    },
    onSuccess: (data: DocumentResponse, { documentId, updates }: UpdateMutationVariables): void => {
      if (isTitleOnlyUpdate(updates)) {
        queryClient.setQueryData(['document', documentId], data);
      } else {
        queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      }
      // Also invalidate type-specific queries for list views
      if (document?.document_type) {
        queryClient.invalidateQueries({ queryKey: [document.document_type + 's', 'list'] });
        if (document.document_type === 'wiki') {
          queryClient.invalidateQueries({ queryKey: ['documents', 'wiki'] });
        }
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (documentId: string): Promise<void> => {
      const response = await apiDelete(`/api/documents/${documentId}`);
      if (!response.ok) {
        throw new Error('Failed to delete document');
      }
    },
    onSuccess: (): void => {
      navigate('/docs');
    },
  });

  // Handle update
  const handleUpdate = useCallback(async (updates: Partial<UnifiedDocument>): Promise<void> => {
    if (!id) return;
    await updateMutation.mutateAsync({ documentId: id, updates });
  }, [updateMutation, id]);

  // Handle delete
  const handleDelete = useCallback(async (): Promise<void> => {
    if (!id) return;
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    await deleteMutation.mutateAsync(id);
  }, [deleteMutation, id]);

  const isWeeklyDoc = document?.document_type === 'weekly_plan' || document?.document_type === 'weekly_retro';
  const isStandup = document?.document_type === 'standup';
  const hideBackButton = isWeeklyDoc || isStandup;

  // Resolve standup author name for title suffix
  const standupAuthorName = useMemo((): string | undefined => {
    if (!isStandup) return undefined;
    const authorId = getString(document?.properties?.author_id);
    if (!authorId) return undefined;
    return teamMembersData.find((member): boolean => member.user_id === authorId)?.name;
  }, [isStandup, document?.properties?.author_id, teamMembersData]);

  // Handle back navigation
  const handleBack = useCallback((): void => {
    // Navigate to type-specific list or docs
    if (document?.document_type === 'issue') {
      navigate('/issues');
    } else if (document?.document_type === 'project') {
      navigate('/projects');
    } else if (document?.document_type === 'sprint') {
      navigate('/sprints');
    } else if (document?.document_type === 'program') {
      navigate('/programs');
    } else {
      navigate('/docs');
    }
  }, [document, navigate]);

  // Compute back label based on document type (just the noun - Editor adds "Back to")
  // Weekly plans/retros don't show a back button
  const backLabel = useMemo((): string => {
    switch (document?.document_type) {
      case 'issue': return 'issues';
      case 'project': return 'projects';
      case 'sprint': return 'weeks';
      case 'program': return 'programs';
      default: return 'docs';
    }
  }, [document?.document_type]);

  // Build sidebar data based on document type
  const sidebarData: SidebarData = useMemo(() => {
    if (!document) return { kind: 'empty' };

    switch (document.document_type) {
      case 'wiki':
        return {
          kind: 'wiki',
          teamMembers,
        };
      case 'issue':
        return {
          kind: 'issue',
          teamMembers,
          programs,
          projects,
          onAssociationChange: handleAssociationChange,
          onConvert: handleConvert,
          onUndoConversion: handleUndoConversion,
          isConverting,
          isUndoing: isConverting,
          canConvert: conversionPermission.canConvert,
          conversionDisabledReason: conversionPermission.reason,
        };
      case 'project':
        return {
          kind: 'project',
          programs,
          people: teamMembers,
          onConvert: handleConvert,
          onUndoConversion: handleUndoConversion,
          isConverting,
          isUndoing: isConverting,
          canConvert: conversionPermission.canConvert,
          conversionDisabledReason: conversionPermission.reason,
        };
      case 'sprint':
        return { kind: 'sprint' };
      case 'program':
        return {
          kind: 'program',
          people: teamMembers,
        };
      default:
        return { kind: 'empty' };
    }
  }, [document, teamMembers, programs, projects, handleAssociationChange, handleConvert, handleUndoConversion, isConverting, conversionPermission.canConvert, conversionPermission.reason]);

  // Transform API response to UnifiedDocument format
  const unifiedDocument: UnifiedDocument | null = useMemo(() => {
    if (!document) return null;

    if (!isUnifiedPageDocumentType(document.document_type)) {
      return null;
    }

    const baseDocument = {
      id: document.id,
      title: document.title,
      document_type: document.document_type,
      created_at: document.created_at,
      updated_at: document.updated_at,
      created_by: document.created_by ?? undefined,
      properties: document.properties,
    };

    const belongsTo = getBelongsToAssociations(document.belongs_to);
    const { programId, sprintId } = getProgramAndSprintIds(belongsTo);

    switch (document.document_type) {
      case 'issue':
        return {
          ...baseDocument,
          document_type: 'issue',
          state: getString(document.state) ?? 'backlog',
          priority: getString(document.priority) ?? 'medium',
          estimate: getNullableNumber(document.estimate) ?? null,
          assignee_id: getNullableString(document.assignee_id) ?? null,
          assignee_name: getNullableString(document.assignee_name) ?? null,
          program_id: programId ?? null,
          sprint_id: sprintId ?? null,
          source: document.source === 'internal' || document.source === 'external' ? document.source : undefined,
          converted_from_id: getNullableString(document.converted_from_id) ?? null,
          display_id: getNumber(document.ticket_number) ? `#${document.ticket_number}` : undefined,
          belongs_to: belongsTo,
        };
      case 'project':
        return {
          ...baseDocument,
          document_type: 'project',
          impact: getNullableNumber(document.impact) ?? null,
          confidence: getNullableNumber(document.confidence) ?? null,
          ease: getNullableNumber(document.ease) ?? null,
          color: getString(document.color) ?? '#3b82f6',
          emoji: getNullableString(document.emoji) ?? null,
          program_id: programId ?? null,
          owner: getOwner(document.owner) ?? null,
          owner_id: getNullableString(document.owner_id) ?? null,
          accountable_id: getNullableString(document.accountable_id) ?? null,
          consulted_ids: getStringArray(document.consulted_ids),
          informed_ids: getStringArray(document.informed_ids),
          converted_from_id: getNullableString(document.converted_from_id) ?? null,
        };
      case 'sprint': {
        const status = getString(document.status);
        return {
          ...baseDocument,
          document_type: 'sprint',
          start_date: getString(document.start_date) ?? '',
          end_date: getString(document.end_date) ?? '',
          status: status === 'active' || status === 'completed' ? status : 'planning',
          program_id: programId ?? null,
          plan: getString(document.plan) ?? '',
        };
      }
      case 'wiki':
        return {
          ...baseDocument,
          document_type: 'wiki',
          parent_id: getNullableString(document.parent_id) ?? null,
          visibility: document.visibility === 'private' || document.visibility === 'workspace' ? document.visibility : undefined,
        };
      case 'program':
        return {
          ...baseDocument,
          document_type: 'program',
          color: getString(document.color),
          emoji: getNullableString(document.emoji),
          owner_id: getNullableString(document.owner_id) ?? null,
          accountable_id: getNullableString(document.accountable_id) ?? null,
          consulted_ids: getStringArray(document.consulted_ids),
          informed_ids: getStringArray(document.informed_ids),
        };
      case 'weekly_plan':
      case 'weekly_retro':
        return {
          ...baseDocument,
          document_type: document.document_type,
          properties: document.properties,
        };
      case 'person':
        return {
          ...baseDocument,
          document_type: 'person',
        };
      case 'standup':
        return {
          ...baseDocument,
          document_type: 'standup',
        };
    }
  }, [document]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  // Error state
  if (error || !document) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-muted">
          {error?.message || 'Document not found'}
        </div>
        <button
          onClick={() => navigate('/docs')}
          className="text-sm text-accent hover:underline"
        >
          Go to Documents
        </button>
      </div>
    );
  }

  if (!user || !unifiedDocument) {
    return null;
  }

  if (!id) {
    return null;
  }

  // Documents with tabs get a tabbed interface
  if (hasTabs && tabConfig.length > 0) {
    const tabs = resolveTabLabels(tabConfig, document, tabCounts);
    const currentTabConfig = tabConfig.find((tab): boolean => tab.id === activeTab) || tabConfig[0];
    const TabComponent = currentTabConfig?.component;

    return (
      <div className="flex h-full flex-col">
        {/* Tab bar */}
        <div className="border-b border-border px-4">
          <TabBar
            tabs={tabs}
            activeTab={activeTab || tabs[0]?.id}
            onTabChange={(tab: string): void => {
              // Navigate to new URL - first tab gets clean URL, others get tab suffix
              if (tab === tabConfig[0]?.id) {
                navigate(`/documents/${id}`);
              } else {
                navigate(`/documents/${id}/${tab}`);
              }
            }}
          />
        </div>

        {/* Content area with lazy-loaded tab component */}
        <div className="flex-1 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="text-muted">Loading...</div>
              </div>
            }
          >
            {TabComponent && (
              <TabComponent documentId={id} document={document} nestedPath={nestedPath} />
            )}
          </Suspense>
        </div>
      </div>
    );
  }

  // Non-tabbed documents render directly in editor
  return (
    <UnifiedEditor
      document={unifiedDocument}
      sidebarData={sidebarData}
      onUpdate={handleUpdate}
      onTypeChange={handleTypeChange}
      onDocumentConverted={handleDocumentConverted}
      onBack={hideBackButton ? undefined : handleBack}
      backLabel={hideBackButton ? undefined : backLabel}
      onDelete={handleDelete}
      showTypeSelector={true}
      titleSuffix={standupAuthorName}
    />
  );
}
