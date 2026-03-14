import { useQuery, useMutation, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

export interface WikiDocument {
  id: string;
  title: string;
  document_type: string;
  parent_id: string | null;
  position: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  properties?: Record<string, unknown>;
  visibility: 'private' | 'workspace';
}

export type WikiListVariant = 'full' | 'tree';

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
  previousTreeDocs?: WikiDocument[];
  previousFullDocs?: WikiDocument[];
  optimisticId: string;
}

interface UpdateDocumentInput {
  id: string;
  updates: Partial<WikiDocument>;
}

interface MutationContext {
  previousTreeDocs?: WikiDocument[];
  previousFullDocs?: WikiDocument[];
}

const allDocumentKey: readonly ['documents'] = ['documents'];

function createHttpError(message: string, status: number): HttpError {
  return Object.assign(new Error(message), { status });
}

function setWikiListData(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (old: WikiDocument[] | undefined) => WikiDocument[]
): void {
  queryClient.setQueryData<WikiDocument[]>(documentKeys.wikiList('tree'), updater);
  queryClient.setQueryData<WikiDocument[]>(documentKeys.wikiList('full'), updater);
}

// Query keys
export const documentKeys = {
  all: allDocumentKey,
  lists: (): readonly ['documents', 'list'] => ['documents', 'list'],
  list: (type: string): readonly ['documents', 'list', string] => ['documents', 'list', type],
  wikiList: (variant: WikiListVariant = 'full'): readonly ['documents', 'wiki', WikiListVariant] => ['documents', 'wiki', variant],
  details: (): readonly ['documents', 'detail'] => ['documents', 'detail'],
  detail: (id: string): readonly ['documents', 'detail', string] => ['documents', 'detail', id],
};

// Fetch documents
async function fetchDocuments(type: string = 'wiki', variant: WikiListVariant = 'full'): Promise<WikiDocument[]> {
  const params = new URLSearchParams({ type });
  if (type === 'wiki' && variant === 'tree') {
    params.set('view', 'tree');
  }

  const res = await apiGet(`/api/documents?${params.toString()}`);
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
export function useDocumentsQuery(type: string = 'wiki', variant: WikiListVariant = 'full'): UseQueryResult<WikiDocument[], HttpError> {
  const queryKey = type === 'wiki' ? documentKeys.wikiList(variant) : documentKeys.list(type);
  return useQuery({
    queryKey,
    queryFn: (): Promise<WikiDocument[]> => fetchDocuments(type, variant),
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
      const previousTreeDocs = queryClient.getQueryData<WikiDocument[]>(documentKeys.wikiList('tree'));
      const previousFullDocs = queryClient.getQueryData<WikiDocument[]>(documentKeys.wikiList('full'));

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

      setWikiListData(
        queryClient,
        (old: WikiDocument[] | undefined): WikiDocument[] => [optimisticDoc, ...(old ?? [])]
      );

      return { previousTreeDocs, previousFullDocs, optimisticId: optimisticDoc.id };
    },
    onError: (_err: HttpError, _newDoc: CreateDocumentInput, context: CreateDocumentContext | undefined): void => {
      if (context?.previousTreeDocs) queryClient.setQueryData(documentKeys.wikiList('tree'), context.previousTreeDocs);
      if (context?.previousFullDocs) queryClient.setQueryData(documentKeys.wikiList('full'), context.previousFullDocs);
    },
    onSuccess: (data: WikiDocument, _variables: CreateDocumentInput, context: CreateDocumentContext | undefined): void => {
      if (context?.optimisticId) {
        setWikiListData(
          queryClient,
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
      const previousTreeDocs = queryClient.getQueryData<WikiDocument[]>(documentKeys.wikiList('tree'));
      const previousFullDocs = queryClient.getQueryData<WikiDocument[]>(documentKeys.wikiList('full'));

      setWikiListData(
        queryClient,
        (old: WikiDocument[] | undefined): WikiDocument[] =>
          old?.map((document: WikiDocument): WikiDocument => (
            document.id === id ? { ...document, ...updates } : document
          )) ?? []
      );

      return { previousTreeDocs, previousFullDocs };
    },
    onError: (_err: HttpError, _variables: UpdateDocumentInput, context: MutationContext | undefined): void => {
      if (context?.previousTreeDocs) queryClient.setQueryData(documentKeys.wikiList('tree'), context.previousTreeDocs);
      if (context?.previousFullDocs) queryClient.setQueryData(documentKeys.wikiList('full'), context.previousFullDocs);
    },
    onSuccess: (data: WikiDocument, { id }: UpdateDocumentInput): void => {
      setWikiListData(
        queryClient,
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
      const previousTreeDocs = queryClient.getQueryData<WikiDocument[]>(documentKeys.wikiList('tree'));
      const previousFullDocs = queryClient.getQueryData<WikiDocument[]>(documentKeys.wikiList('full'));

      setWikiListData(
        queryClient,
        (old: WikiDocument[] | undefined): WikiDocument[] =>
          old?.filter((document: WikiDocument): boolean => document.id !== id) ?? []
      );

      return { previousTreeDocs, previousFullDocs };
    },
    onError: (_err: HttpError, _id: string, context: MutationContext | undefined): void => {
      if (context?.previousTreeDocs) queryClient.setQueryData(documentKeys.wikiList('tree'), context.previousTreeDocs);
      if (context?.previousFullDocs) queryClient.setQueryData(documentKeys.wikiList('full'), context.previousFullDocs);
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
  const { data: documents = [], isLoading: loading, refetch } = useDocumentsQuery('wiki', 'tree');
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
