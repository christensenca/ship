import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IssueSidebar } from './IssueSidebar';

const realFetch = global.fetch;

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('IssueSidebar conversion affordance', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/workspaces/current')) {
        return jsonResponse({ sprint_start_date: '2026-01-05' });
      }
      return jsonResponse([]);
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  const baseProps = {
    issue: {
      id: 'issue-1',
      state: 'todo',
      priority: 'high',
      estimate: 4,
      assignee_id: null,
      source: 'internal' as const,
      belongs_to: [],
    },
    teamMembers: [],
    programs: [],
    projects: [],
    onUpdate: vi.fn(async () => {}),
    onConvert: vi.fn(),
  };

  it('disables conversion and shows the creator-only explanation when conversion is forbidden', async () => {
    render(
      <IssueSidebar
        {...baseProps}
        canConvert={false}
        conversionDisabledReason="Only the document creator can convert this document."
      />
    );

    expect(screen.getByRole('button', { name: /Promote to Project/i })).toBeDisabled();
    expect(screen.getByText('Only the document creator can convert this document.')).toBeInTheDocument();
  });

  it('keeps conversion enabled for allowed users', async () => {
    render(
      <IssueSidebar
        {...baseProps}
        canConvert
      />
    );

    expect(screen.getByRole('button', { name: /Promote to Project/i })).toBeEnabled();
    expect(screen.getByText('Convert this issue into a project')).toBeInTheDocument();
  });
});
