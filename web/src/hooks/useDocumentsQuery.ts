import { useQuery, useMutation, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

export interface WikiDocument {
  id: string;
  title: string;
  document_type: string;
  parent_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  properties?: Record<string, unknown>;
  visibility: 'private' | 'workspace';
}

interface HttpError extends Error {
  status: number;
}

interface CreateDocumentInput {
  title?: string;
  document_type?: string;
  parent_id?: string | null;
  visibility?: 'private' | 'workspace';
}

interface CreateDocumentContext {
  previousDocs?: WikiDocument[];
  optimisticId: string;
}

interface UpdateDocumentInput {
  id: string;
  updates: Partial<WikiDocument>;
}

interface MutationContext {
  previousDocs?: WikiDocument[];
}

function createHttpError(message: string, status: number): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

// Query keys
export const documentKeys = {
  all: ['documents'] as const,
  lists: (): readonly ['documents', 'list'] => [...documentKeys.all, 'list'] as const,
  list: (type: string): readonly ['documents', 'list', string] => [...documentKeys.lists(), type] as const,
  wikiList: (): readonly ['documents', 'wiki'] => [...documentKeys.all, 'wiki'] as const,
  details: (): readonly ['documents', 'detail'] => [...documentKeys.all, 'detail'] as const,
  detail: (id: string): readonly ['documents', 'detail', string] => [...documentKeys.details(), id] as const,
};

// Fetch documents
async function fetchDocuments(type: string = 'wiki'): Promise<WikiDocument[]> {
  const res = await apiGet(`/api/documents?type=${type}`);
  if (!res.ok) {
    throw createHttpError('Failed to fetch documents', res.status);
  }
  return res.json();
}

// Create document
async function createDocumentApi(data: { title: string; document_type: string; parent_id?: string | null }): Promise<WikiDocument> {
  const res = await apiPost('/api/documents', data);
  if (!res.ok) {
    throw createHttpError('Failed to create document', res.status);
  }
  return res.json();
}

// Update document
async function updateDocumentApi(id: string, updates: Partial<WikiDocument>): Promise<WikiDocument> {
  const res = await apiPatch(`/api/documents/${id}`, updates);
  if (!res.ok) {
    throw createHttpError('Failed to update document', res.status);
  }
  return res.json();
}

// Delete document
async function deleteDocumentApi(id: string): Promise<void> {
  const res = await apiDelete(`/api/documents/${id}`);
  if (!res.ok) {
    throw createHttpError('Failed to delete document', res.status);
  }
}

// Hook to get documents
export function useDocumentsQuery(type: string = 'wiki'): UseQueryResult<WikiDocument[], HttpError> {
  const queryKey = type === 'wiki' ? documentKeys.wikiList() : documentKeys.list(type);
  return useQuery({
    queryKey,
    queryFn: (): Promise<WikiDocument[]> => fetchDocuments(type),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnMount: 'always',
  });
}

// Hook to create document with optimistic update
export function useCreateDocument(): UseMutationResult<WikiDocument, HttpError, CreateDocumentInput, CreateDocumentContext> {
  const queryClient = useQueryClient();

  return useMutation<WikiDocument, HttpError, CreateDocumentInput, CreateDocumentContext>({
    mutationFn: (data: CreateDocumentInput): Promise<WikiDocument> =>
      createDocumentApi({
        title: data.title ?? 'Untitled',
        document_type: data.document_type ?? 'wiki',
        parent_id: data.parent_id ?? null,
      }),
    onMutate: async (newDoc: CreateDocumentInput): Promise<CreateDocumentContext> => {
      await queryClient.cancelQueries({ queryKey: documentKeys.lists() });
      const previousDocs = queryClient.getQueryData<WikiDocument[]>(documentKeys.wikiList());

      const optimisticDoc: WikiDocument = {
        id: `temp-${crypto.randomUUID()}`,
        title: newDoc.title ?? 'Untitled',
        document_type: newDoc.document_type ?? 'wiki',
        parent_id: newDoc.parent_id ?? null,
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        visibility: newDoc.visibility ?? 'workspace',
      };

      queryClient.setQueryData<WikiDocument[]>(
        documentKeys.wikiList(),
        (old: WikiDocument[] | undefined): WikiDocument[] => [optimisticDoc, ...(old ?? [])]
      );

      return { previousDocs, optimisticId: optimisticDoc.id };
    },
    onError: (_err: HttpError, _newDoc: CreateDocumentInput, context: CreateDocumentContext | undefined): void => {
      if (context?.previousDocs) {
        queryClient.setQueryData(documentKeys.wikiList(), context.previousDocs);
      }
    },
    onSuccess: (data: WikiDocument, _variables: CreateDocumentInput, context: CreateDocumentContext | undefined): void => {
      if (context?.optimisticId) {
        queryClient.setQueryData<WikiDocument[]>(
          documentKeys.wikiList(),
          (old: WikiDocument[] | undefined): WikiDocument[] =>
            old?.map((document: WikiDocument): WikiDocument => (
              document.id === context.optimisticId ? data : document
            )) ?? [data]
        );
      }
    },
    onSettled: (): void => {
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

// Hook to update document with optimistic update
export function useUpdateDocument(): UseMutationResult<WikiDocument, HttpError, UpdateDocumentInput, MutationContext> {
  const queryClient = useQueryClient();

  return useMutation<WikiDocument, HttpError, UpdateDocumentInput, MutationContext>({
    mutationFn: ({ id, updates }: UpdateDocumentInput): Promise<WikiDocument> =>
      updateDocumentApi(id, updates),
    onMutate: async ({ id, updates }: UpdateDocumentInput): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey: documentKeys.lists() });
      const previousDocs = queryClient.getQueryData<WikiDocument[]>(documentKeys.wikiList());

      queryClient.setQueryData<WikiDocument[]>(
        documentKeys.wikiList(),
        (old: WikiDocument[] | undefined): WikiDocument[] =>
          old?.map((document: WikiDocument): WikiDocument => (
            document.id === id ? { ...document, ...updates } : document
          )) ?? []
      );

      return { previousDocs };
    },
    onError: (_err: HttpError, _variables: UpdateDocumentInput, context: MutationContext | undefined): void => {
      if (context?.previousDocs) {
        queryClient.setQueryData(documentKeys.wikiList(), context.previousDocs);
      }
    },
    onSuccess: (data: WikiDocument, { id }: UpdateDocumentInput): void => {
      queryClient.setQueryData<WikiDocument[]>(
        documentKeys.wikiList(),
        (old: WikiDocument[] | undefined): WikiDocument[] =>
          old?.map((document: WikiDocument): WikiDocument => (
            document.id === id ? data : document
          )) ?? []
      );
    },
    onSettled: (): void => {
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

// Hook to delete document with optimistic update
export function useDeleteDocument(): UseMutationResult<void, HttpError, string, MutationContext> {
  const queryClient = useQueryClient();

  return useMutation<void, HttpError, string, MutationContext>({
    mutationFn: (id: string): Promise<void> => deleteDocumentApi(id),
    onMutate: async (id: string): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey: documentKeys.lists() });
      const previousDocs = queryClient.getQueryData<WikiDocument[]>(documentKeys.wikiList());

      queryClient.setQueryData<WikiDocument[]>(
        documentKeys.wikiList(),
        (old: WikiDocument[] | undefined): WikiDocument[] =>
          old?.filter((document: WikiDocument): boolean => document.id !== id) ?? []
      );

      return { previousDocs };
    },
    onError: (_err: HttpError, _id: string, context: MutationContext | undefined): void => {
      if (context?.previousDocs) {
        queryClient.setQueryData(documentKeys.wikiList(), context.previousDocs);
      }
    },
    onSettled: (): void => {
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

// Compatibility hook that matches the old useDocuments interface
export function useDocuments(): {
  documents: WikiDocument[];
  loading: boolean;
  createDocument: (parentId?: string) => Promise<WikiDocument | null>;
  updateDocument: (id: string, updates: Partial<WikiDocument>) => Promise<WikiDocument | null>;
  deleteDocument: (id: string) => Promise<boolean>;
  refreshDocuments: () => Promise<void>;
} {
  const { data: documents = [], isLoading: loading, refetch } = useDocumentsQuery('wiki');
  const createMutation = useCreateDocument();
  const updateMutation = useUpdateDocument();
  const deleteMutation = useDeleteDocument();

  const createDocument = async (parentId?: string): Promise<WikiDocument | null> => {
    try {
      return await createMutation.mutateAsync({ parent_id: parentId });
    } catch {
      return null;
    }
  };

  const updateDocument = async (id: string, updates: Partial<WikiDocument>): Promise<WikiDocument | null> => {
    try {
      return await updateMutation.mutateAsync({ id, updates });
    } catch {
      return null;
    }
  };

  const deleteDocument = async (id: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  };

  const refreshDocuments = async (): Promise<void> => {
    await refetch();
  };

  return {
    documents,
    loading,
    createDocument,
    updateDocument,
    deleteDocument,
    refreshDocuments,
  };
}
