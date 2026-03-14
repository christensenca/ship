import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Editor } from '@/components/Editor';
import { PropertiesPanel } from '@/components/sidebars/PropertiesPanel';
import { WeeklyReviewSubNav } from '@/components/review/WeeklyReviewSubNav';
import { useWeeklyReviewActions } from '@/hooks/useWeeklyReviewActions';
import type {
  PanelDocument,
  PanelSpecificProps,
  WikiPanelProps,
  IssuePanelProps,
  ProjectPanelProps,
  SprintPanelProps,
  ProgramPanelProps,
} from '@/components/sidebars/PropertiesPanel';
import { DocumentTypeSelector, getMissingRequiredFields } from '@/components/sidebars/DocumentTypeSelector';
import type { DocumentType as SelectableDocumentType } from '@/components/sidebars/DocumentTypeSelector';
import { useAuth } from '@/hooks/useAuth';
import { PlanQualityBanner, RetroQualityBanner } from '@/components/PlanQualityBanner';
import { useAutoSave } from '@/hooks/useAutoSave';
import type { Person } from '@/components/PersonCombobox';
import type { BelongsTo } from '@ship/shared';
import { getDocumentConversionPermission } from '@/lib/documentConversion';

export type DocumentType = 'wiki' | 'issue' | 'project' | 'sprint' | 'program' | 'person' | 'weekly_plan' | 'weekly_retro' | 'standup';

// Base document interface - common properties across all document types
interface BaseDocument {
  id: string;
  title: string;
  document_type: DocumentType;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  properties?: Record<string, unknown>;
}

interface ProgramDocument extends BaseDocument {
  document_type: 'program';
  color?: string;
  emoji?: string | null;
  owner_id?: string | null;
  accountable_id?: string | null;
  consulted_ids?: string[];
  informed_ids?: string[];
}

interface WeeklyDocumentProperties {
  [key: string]: unknown;
  person_id?: string;
  project_id?: string;
  week_number?: number;
}

interface WeeklyPlanDocument extends BaseDocument {
  document_type: 'weekly_plan';
  properties?: WeeklyDocumentProperties;
}

interface WeeklyRetroDocument extends BaseDocument {
  document_type: 'weekly_retro';
  properties?: WeeklyDocumentProperties;
}

interface PersonDocument extends BaseDocument {
  document_type: 'person';
}

interface StandupDocument extends BaseDocument {
  document_type: 'standup';
}

// Wiki document
interface WikiDocument extends BaseDocument {
  document_type: 'wiki';
  parent_id?: string | null;
  visibility?: 'private' | 'workspace';
}

// Issue document
interface IssueDocument extends BaseDocument {
  document_type: 'issue';
  state: string;
  priority: string;
  estimate: number | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_archived?: boolean;
  program_id: string | null;
  sprint_id: string | null;
  source?: 'internal' | 'external';
  rejection_reason?: string | null;
  converted_from_id?: string | null;
  display_id?: string;
  belongs_to?: BelongsTo[];
}

// Project document
interface ProjectDocument extends BaseDocument {
  document_type: 'project';
  impact: number | null;
  confidence: number | null;
  ease: number | null;
  ice_score?: number | null;
  color: string;
  emoji: string | null;
  program_id: string | null;
  owner?: { id: string; name: string; email: string } | null;
  owner_id?: string | null;
  // RACI fields
  accountable_id?: string | null;
  consulted_ids?: string[];
  informed_ids?: string[];
  sprint_count?: number;
  issue_count?: number;
  converted_from_id?: string | null;
  plan?: string | null;
  has_design_review?: boolean | null;
  design_review_notes?: string | null;
}

// Sprint document
interface SprintDocument extends BaseDocument {
  document_type: 'sprint';
  start_date: string;
  end_date: string;
  status: 'planning' | 'active' | 'completed';
  program_id: string | null;
  program_name?: string;
  issue_count?: number;
  completed_count?: number;
  plan?: string;
}

// Union type for all document types
export type UnifiedDocument =
  | WikiDocument
  | IssueDocument
  | ProjectDocument
  | SprintDocument
  | ProgramDocument
  | WeeklyPlanDocument
  | WeeklyRetroDocument
  | PersonDocument
  | StandupDocument;

// Sidebar data types
interface WikiSidebarData {
  kind: 'wiki';
  teamMembers: Person[];
}

interface IssueSidebarData {
  kind: 'issue';
  teamMembers: Array<{ id: string; user_id: string; name: string }>;
  programs: Array<{ id: string; name: string; color?: string }>;
  projects?: Array<{ id: string; title: string; color?: string }>;
  onConvert?: () => void;
  onUndoConversion?: () => void;
  onAccept?: () => Promise<void>;
  onReject?: (reason: string) => Promise<void>;
  isConverting?: boolean;
  isUndoing?: boolean;
  onAssociationChange?: () => void;
  canConvert?: boolean;
  conversionDisabledReason?: string;
}

interface ProjectSidebarData {
  kind: 'project';
  programs: Array<{ id: string; name: string; color: string; emoji?: string | null }>;
  people: Person[];
  onConvert?: () => void;
  onUndoConversion?: () => void;
  isConverting?: boolean;
  isUndoing?: boolean;
  canConvert?: boolean;
  conversionDisabledReason?: string;
}

interface SprintSidebarData {
  kind: 'sprint';
  people?: Array<{ id: string; user_id: string; name: string }>;
  existingSprints?: Array<{ owner?: { id: string; name: string; email: string } | null }>;
}

interface ProgramSidebarData {
  kind: 'program';
  people: Array<{ id: string; user_id: string; name: string; email: string }>;
}

interface EmptySidebarData {
  kind: 'empty';
}

export type SidebarData =
  | WikiSidebarData
  | IssueSidebarData
  | ProjectSidebarData
  | SprintSidebarData
  | ProgramSidebarData
  | EmptySidebarData;

interface UnifiedEditorProps {
  /** The document to edit */
  document: UnifiedDocument;
  /** Type-specific sidebar data */
  sidebarData?: SidebarData;
  /** Handler for document updates */
  onUpdate: (updates: Partial<UnifiedDocument>) => Promise<void>;
  /** Handler for back navigation */
  onBack?: () => void;
  /** Label for back button */
  backLabel?: string;
  /** Handler for document deletion */
  onDelete?: () => void;
  /** Room prefix for collaboration */
  roomPrefix?: string;
  /** Placeholder text for empty editor */
  placeholder?: string;
  /** Handler for creating sub-documents */
  onCreateSubDocument?: () => Promise<{ id: string; title: string } | null>;
  /** Handler for navigating to documents */
  onNavigateToDocument?: (docId: string) => void;
  /** Handler for document conversion events */
  onDocumentConverted?: (newDocId: string, newDocType: 'issue' | 'project') => void;
  /** Badge to show in header */
  headerBadge?: React.ReactNode;
  /** Whether to show the document type selector */
  showTypeSelector?: boolean;
  /** Handler for document type changes (if different from onUpdate) */
  onTypeChange?: (newType: DocumentType) => Promise<void>;
  /** Suffix displayed after the title in the header (e.g., author name) */
  titleSuffix?: string;
}

function isSelectableDocumentType(value: UnifiedDocument['document_type']): value is SelectableDocumentType {
  return value === 'wiki' || value === 'issue' || value === 'project' || value === 'sprint';
}

function getRequiredFieldSource(document: UnifiedDocument): Record<string, unknown> {
  switch (document.document_type) {
    case 'issue':
      return {
        ...document.properties,
        state: document.state,
        priority: document.priority,
      };
    case 'project':
      return {
        ...document.properties,
        impact: document.impact,
        confidence: document.confidence,
        ease: document.ease,
      };
    case 'sprint':
      return {
        ...document.properties,
        start_date: document.start_date,
        end_date: document.end_date,
        status: document.status,
      };
    default:
      return document.properties ?? {};
  }
}

/**
 * UnifiedEditor - Adaptive editor component that renders type-specific properties
 *
 * This component provides a unified editing experience for all document types
 * by adapting the properties sidebar based on document_type while using the
 * same TipTap editor for content.
 *
 * Usage:
 * ```tsx
 * <UnifiedEditor
 *   document={myDocument}
 *   sidebarData={typeSpecificData}
 *   onUpdate={handleUpdate}
 *   onBack={() => navigate(-1)}
 * />
 * ```
 */
export function UnifiedEditor({
  document,
  sidebarData = { kind: 'empty' },
  onUpdate,
  onBack,
  backLabel,
  onDelete,
  roomPrefix,
  placeholder,
  onCreateSubDocument,
  onNavigateToDocument,
  onDocumentConverted,
  headerBadge,
  showTypeSelector = false,
  onTypeChange,
  titleSuffix,
}: UnifiedEditorProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isChangingType, setIsChangingType] = useState(false);

  // Track missing required fields after type changes
  const missingFields = useMemo(() => {
    if (isSelectableDocumentType(document.document_type)) {
      return getMissingRequiredFields(document.document_type, getRequiredFieldSource(document));
    }
    return [];
  }, [document]);

  // Auto-save title changes
  const throttledTitleSave = useAutoSave({
    onSave: async (title: string) => {
      if (title) await onUpdate({ title });
    },
  });

  // Handle document type change
  const handleTypeChange = useCallback(async (newType: SelectableDocumentType) => {
    if (newType === document.document_type) return;

    setIsChangingType(true);
    try {
      if (onTypeChange) {
        await onTypeChange(newType);
      } else {
        await onUpdate({ document_type: newType });
      }
    } finally {
      setIsChangingType(false);
    }
  }, [document.document_type, onTypeChange, onUpdate]);

  // Navigate to document handler
  const handleNavigateToDocument = useCallback((docId: string) => {
    if (onNavigateToDocument) {
      onNavigateToDocument(docId);
    } else {
      navigate(`/documents/${docId}`);
    }
  }, [navigate, onNavigateToDocument]);

  // Handle plan change (for sprint and project documents)
  const handlePlanChange = useCallback(async (plan: string) => {
    if (document.document_type !== 'sprint' && document.document_type !== 'project') return;
    await onUpdate({ ...document, plan });
  }, [document.document_type, onUpdate]);

  // Determine room prefix based on document type if not provided
  const effectiveRoomPrefix = roomPrefix || document.document_type;

  // Determine placeholder based on document type if not provided
  const effectivePlaceholder = placeholder || getDefaultPlaceholder(document.document_type);

  // Weekly plans and retros have review-mode sub-nav controls
  const isWeeklyDoc = document.document_type === 'weekly_plan' || document.document_type === 'weekly_retro';

  const weeklyReviewState = useWeeklyReviewActions(
    isWeeklyDoc
      ? {
          id: document.id,
          document_type: document.document_type,
          properties: document.properties,
        }
      : null
  );

  // Check if this document type can have its type changed
  const canChangeType = isSelectableDocumentType(document.document_type);
  const conversionPermission = useMemo(() => getDocumentConversionPermission({
    documentType: document.document_type,
    createdBy: document.created_by,
    currentUserId: user?.id,
  }), [document.created_by, document.document_type, user?.id]);
  const disabledTypeHelperText = useMemo(() => {
    if (document.document_type !== 'issue' && document.document_type !== 'project') return undefined;
    return conversionPermission.reason;
  }, [conversionPermission.reason, document.document_type]);
  const disabledTypes = useMemo<SelectableDocumentType[]>(() => {
    if (document.document_type === 'issue' && !conversionPermission.canConvert) {
      return ['project'];
    }
    if (document.document_type === 'project' && !conversionPermission.canConvert) {
      return ['issue'];
    }
    return [];
  }, [conversionPermission.canConvert, document.document_type]);

  // Build panel-specific props from sidebarData
  const panelProps: PanelSpecificProps = useMemo(() => {
    if (document.document_type === 'wiki' && sidebarData.kind === 'wiki') {
      return {
        kind: 'wiki',
        teamMembers: sidebarData.teamMembers,
        currentUserId: user?.id,
      } satisfies WikiPanelProps;
    }
    if (document.document_type === 'issue' && sidebarData.kind === 'issue') {
      return {
        kind: 'issue',
        teamMembers: sidebarData.teamMembers,
        programs: sidebarData.programs,
        projects: sidebarData.projects,
        onConvert: sidebarData.onConvert,
        onUndoConversion: sidebarData.onUndoConversion,
        onAccept: sidebarData.onAccept,
        onReject: sidebarData.onReject,
        isConverting: sidebarData.isConverting,
        isUndoing: sidebarData.isUndoing,
        onAssociationChange: sidebarData.onAssociationChange,
        canConvert: sidebarData.canConvert,
        conversionDisabledReason: sidebarData.conversionDisabledReason,
      } satisfies IssuePanelProps;
    }
    if (document.document_type === 'project' && sidebarData.kind === 'project') {
      return {
        kind: 'project',
        programs: sidebarData.programs,
        people: sidebarData.people,
        onConvert: sidebarData.onConvert,
        onUndoConversion: sidebarData.onUndoConversion,
        isConverting: sidebarData.isConverting,
        isUndoing: sidebarData.isUndoing,
        canConvert: sidebarData.canConvert,
        conversionDisabledReason: sidebarData.conversionDisabledReason,
      } satisfies ProjectPanelProps;
    }
    if (document.document_type === 'sprint' && sidebarData.kind === 'sprint') {
      return {
        kind: 'sprint',
        people: sidebarData.people ?? [],
        existingSprints: sidebarData.existingSprints ?? [],
      } satisfies SprintPanelProps;
    }
    if (document.document_type === 'program' && sidebarData.kind === 'program') {
      return {
        kind: 'program',
        people: sidebarData.people,
      } satisfies ProgramPanelProps;
    }

    if (document.document_type === 'wiki') {
      return { kind: 'wiki', teamMembers: [], currentUserId: user?.id } satisfies WikiPanelProps;
    }
    if (document.document_type === 'issue') {
      return { kind: 'issue', teamMembers: [], programs: [], projects: [] } satisfies IssuePanelProps;
    }
    if (document.document_type === 'project') {
      return { kind: 'project', programs: [], people: [] } satisfies ProjectPanelProps;
    }
    if (document.document_type === 'sprint') {
      return { kind: 'sprint', people: [], existingSprints: [] } satisfies SprintPanelProps;
    }
    if (document.document_type === 'program') {
      return { kind: 'program', people: [] } satisfies ProgramPanelProps;
    }
    return null;
  }, [document.document_type, sidebarData, user?.id]);

  // Render the type-specific sidebar content via unified PropertiesPanel
  const typeSpecificSidebar = useMemo(() => {
    // Check if document type has a properties panel
    if (!['wiki', 'issue', 'project', 'sprint', 'program', 'weekly_plan', 'weekly_retro'].includes(document.document_type)) {
      return (
        <div className="p-4">
          <p className="text-xs text-muted">
            Document type: {document.document_type}
          </p>
        </div>
      );
    }

    if (document.document_type === 'person' || document.document_type === 'standup') {
      return null;
    }

    const handlePanelUpdate = (updates: Partial<PanelDocument>): Promise<void> => onUpdate(updates);

    return (
      <PropertiesPanel
        document={document}
        panelProps={panelProps}
        onUpdate={handlePanelUpdate}
        highlightedFields={missingFields}
        weeklyReviewState={weeklyReviewState}
      />
    );
  }, [document, panelProps, onUpdate, missingFields, weeklyReviewState]);

  // Compose full sidebar with type selector
  const sidebar = useMemo(() => {
    // If we're not showing the type selector, just return the type-specific sidebar
    if (!showTypeSelector || !canChangeType || !isSelectableDocumentType(document.document_type)) {
      return typeSpecificSidebar;
    }

    // Add type selector at the top
    return (
      <div className="flex flex-col h-full">
        {/* Type Selector */}
        <div className="p-4 border-b border-border">
          <DocumentTypeSelector
            value={document.document_type}
            onChange={handleTypeChange}
            disabled={isChangingType}
            disabledTypes={disabledTypes}
            helperText={disabledTypeHelperText}
          />
          {missingFields.length > 0 && (
            <p className="mt-2 text-xs text-amber-500">
              Please fill in required fields: {missingFields.join(', ')}
            </p>
          )}
        </div>
        {/* Type-specific sidebar */}
        <div className="flex-1 overflow-auto pb-20">
          {typeSpecificSidebar}
        </div>
      </div>
    );
  }, [showTypeSelector, canChangeType, typeSpecificSidebar, document.document_type, handleTypeChange, isChangingType, disabledTypes, disabledTypeHelperText, missingFields]);

  if (!user) {
    return null;
  }

  // Weekly plans and retros have computed titles (includes person name) - make read-only
  const isTitleReadOnly = document.document_type === 'weekly_plan' || document.document_type === 'weekly_retro';

  // AI quality banner — triggers analysis on content changes from the editor
  const [editorContent, setEditorContent] = useState<Record<string, unknown> | null>(null);
  const [aiScoringAnalysis, setAiScoringAnalysis] = useState<{ planAnalysis?: unknown; retroAnalysis?: unknown } | null>(null);

  // Prevent stale AI feedback from leaking when navigating to a different document.
  useEffect(() => {
    setEditorContent(null);
    setAiScoringAnalysis(null);
  }, [document.id]);

  const handlePlanAnalysisChange = useCallback((analysis: unknown) => {
    setAiScoringAnalysis(analysis ? { planAnalysis: analysis } : null);
  }, []);

  const handleRetroAnalysisChange = useCallback((analysis: unknown) => {
    setAiScoringAnalysis(analysis ? { retroAnalysis: analysis } : null);
  }, []);

  const qualityBanner = useMemo(() => {
    if (document.document_type === 'weekly_plan') {
      return <PlanQualityBanner documentId={document.id} editorContent={editorContent} onAnalysisChange={handlePlanAnalysisChange} />;
    }
    if (document.document_type === 'weekly_retro') {
      return <RetroQualityBanner documentId={document.id} editorContent={editorContent} planContent={null} onAnalysisChange={handleRetroAnalysisChange} />;
    }
    return undefined;
  }, [document.id, document.document_type, editorContent, handlePlanAnalysisChange, handleRetroAnalysisChange]);

  const secondaryHeader = useMemo(() => {
    if (!weeklyReviewState?.isReviewMode) return undefined;
    return <WeeklyReviewSubNav reviewState={weeklyReviewState} />;
  }, [weeklyReviewState]);

  return (
    <Editor
      documentId={document.id}
      userName={user.name}
      initialTitle={document.title}
      onTitleChange={isTitleReadOnly ? undefined : throttledTitleSave}
      titleReadOnly={isTitleReadOnly}
      onBack={onBack}
      backLabel={backLabel}
      onDelete={onDelete}
      roomPrefix={effectiveRoomPrefix}
      placeholder={effectivePlaceholder}
      onCreateSubDocument={onCreateSubDocument}
      onNavigateToDocument={handleNavigateToDocument}
      onDocumentConverted={onDocumentConverted}
      headerBadge={headerBadge}
      secondaryHeader={secondaryHeader}
      sidebar={sidebar}
      documentType={document.document_type}
      onPlanChange={document.document_type === 'sprint' || document.document_type === 'project' ? handlePlanChange : undefined}
      contentBanner={qualityBanner}
      onContentChange={isWeeklyDoc ? setEditorContent : undefined}
      aiScoringAnalysis={isWeeklyDoc ? aiScoringAnalysis : undefined}
      titleSuffix={titleSuffix}
    />
  );
}

/**
 * Get default placeholder text based on document type
 */
function getDefaultPlaceholder(documentType: DocumentType): string {
  switch (documentType) {
    case 'wiki':
      return 'Start writing...';
    case 'issue':
      return 'Add a description...';
    case 'project':
      return 'Describe this project...';
    case 'sprint':
      return 'Add week goals, notes, or description...';
    case 'program':
      return 'Describe this program...';
    case 'person':
      return 'Add notes about this person...';
    case 'standup':
      return 'Add standup notes...';
    default:
      return 'Start writing...';
  }
}

// Re-export PropertiesPanel as the unified entry point for sidebars
export { PropertiesPanel } from '@/components/sidebars/PropertiesPanel';
export type {
  PanelDocument,
  PanelDocumentType,
  WikiPanelProps,
  IssuePanelProps,
  ProjectPanelProps,
  SprintPanelProps,
} from '@/components/sidebars/PropertiesPanel';
