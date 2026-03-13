import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiPost, clearCsrfToken } from './api';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiPost', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    clearCsrfToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('does not retry generic 403 responses that are not CSRF errors', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/api/csrf-token')) {
        return jsonResponse({ token: 'token-1' });
      }
      return jsonResponse({ error: 'Only the document creator can convert it' }, 403);
    });

    global.fetch = fetchMock as typeof fetch;

    const response = await apiPost('/api/documents/doc-1/convert', { target_type: 'project' });

    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
