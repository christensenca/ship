import { IssuesList } from '@/components/IssuesList';
import { getBelongsToId, type DocumentTabProps } from '@/lib/document-tabs';

/**
 * ProjectIssuesTab - Shows issues associated with a project
 *
 * This is the "Issues" tab content when viewing a project document.
 */
export default function ProjectIssuesTab({ documentId, document }: DocumentTabProps) {
  const programId = getBelongsToId(document, 'program');

  return (
    <IssuesList
      lockedProjectId={documentId}
      showProgramFilter={false}
      showProjectFilter={false}
      enableKeyboardNavigation={false}
      showBacklogPicker={true}
      showCreateButton={true}
      allowShowAllIssues={true}
      inheritedContext={{
        projectId: documentId,
        programId,
      }}
    />
  );
}
