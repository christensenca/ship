import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type DocumentType = 'wiki' | 'issue' | 'project' | 'program' | 'sprint' | 'person' | 'weekly_plan' | 'weekly_retro' | 'standup' | null;

interface CurrentDocumentContextValue {
  currentDocumentType: DocumentType;
  currentDocumentId: string | null;
  currentDocumentTitle: string | null;
  currentDocumentProjectId: string | null;
  setCurrentDocument: (id: string | null, type: DocumentType, projectId?: string | null, title?: string | null) => void;
  clearCurrentDocument: () => void;
}

const CurrentDocumentContext = createContext<CurrentDocumentContextValue | undefined>(undefined);

export function CurrentDocumentProvider({ children }: { children: ReactNode }) {
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [currentDocumentType, setCurrentDocumentType] = useState<DocumentType>(null);
  const [currentDocumentTitle, setCurrentDocumentTitle] = useState<string | null>(null);
  const [currentDocumentProjectId, setCurrentDocumentProjectId] = useState<string | null>(null);

  const setCurrentDocument = useCallback((id: string | null, type: DocumentType, projectId?: string | null, title?: string | null) => {
    setCurrentDocumentId(id);
    setCurrentDocumentType(type);
    setCurrentDocumentTitle(title ?? null);
    setCurrentDocumentProjectId(projectId ?? null);
  }, []);

  const clearCurrentDocument = useCallback(() => {
    setCurrentDocumentId(null);
    setCurrentDocumentType(null);
    setCurrentDocumentTitle(null);
    setCurrentDocumentProjectId(null);
  }, []);

  return (
    <CurrentDocumentContext.Provider
      value={{
        currentDocumentType,
        currentDocumentId,
        currentDocumentTitle,
        currentDocumentProjectId,
        setCurrentDocument,
        clearCurrentDocument,
      }}
    >
      {children}
    </CurrentDocumentContext.Provider>
  );
}

export function useCurrentDocument() {
  const context = useContext(CurrentDocumentContext);
  if (!context) {
    throw new Error('useCurrentDocument must be used within a CurrentDocumentProvider');
  }
  return context;
}

/**
 * Hook to get the current document type without throwing.
 * Returns null if not in a CurrentDocumentProvider context.
 * Useful for optional context usage.
 */
export function useCurrentDocumentType(): DocumentType {
  const context = useContext(CurrentDocumentContext);
  return context?.currentDocumentType ?? null;
}
