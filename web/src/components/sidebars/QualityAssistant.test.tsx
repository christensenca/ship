import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RetroQualityAssistant } from './QualityAssistant';

const realFetch = global.fetch;

function jsonResponse(data: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe('RetroQualityAssistant', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows an unavailable notice when AI is unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/api/ai/status')) {
        return jsonResponse({ available: false });
      }

      throw new Error(`Unexpected fetch call: GET ${url}`);
    });

    global.fetch = fetchMock as typeof fetch;

    render(
      <RetroQualityAssistant
        documentId="doc-1"
        content={{ type: 'doc', content: [] }}
        planContent={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plan item' }] }] }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('AI feedback is temporarily unavailable. You can still write and submit your retro normally.')).toBeInTheDocument();
    });
  });

  it('keeps the no-plan state distinct from unavailable AI', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/api/ai/status')) {
        return jsonResponse({ available: true });
      }

      throw new Error(`Unexpected fetch call: GET ${url}`);
    });

    global.fetch = fetchMock as typeof fetch;

    render(
      <RetroQualityAssistant
        documentId="doc-2"
        content={{ type: 'doc', content: [] }}
        planContent={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No plan found for comparison.')).toBeInTheDocument();
    });
  });
});
