export const DOCUMENT_CREATOR_CONVERSION_REASON = 'Only the document creator can convert this document.';

interface DocumentConversionPermissionInput {
  documentType: string;
  createdBy?: string | null;
  currentUserId?: string | null;
}

interface DocumentConversionPermission {
  canConvert: boolean;
  reason?: string;
}

export function getDocumentConversionPermission({
  documentType,
  createdBy,
  currentUserId,
}: DocumentConversionPermissionInput): DocumentConversionPermission {
  const isConvertibleType = documentType === 'issue' || documentType === 'project';
  if (!isConvertibleType) {
    return { canConvert: false };
  }

  if (!createdBy || !currentUserId || createdBy !== currentUserId) {
    return {
      canConvert: false,
      reason: DOCUMENT_CREATOR_CONVERSION_REASON,
    };
  }

  return { canConvert: true };
}

export function getDocumentConversionErrorMessage(
  errorMessage: string | undefined,
  status?: number
): string {
  if (status === 403) {
    return DOCUMENT_CREATOR_CONVERSION_REASON;
  }

  return errorMessage || 'Failed to convert document';
}
