/**
 * T024: Assistant panel UI coverage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FleetGraphAssistantPanel } from './FleetGraphAssistantPanel';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('FleetGraphAssistantPanel', () => {
  it('renders with guidance action button', () => {
    renderWithProviders(
      <FleetGraphAssistantPanel
        viewType="issue"
        documentId="doc-001"
        workspaceId="ws-001"
      />
    );

    expect(screen.getByText(/get guidance/i)).toBeInTheDocument();
  });

  it('renders standup draft button for person view', () => {
    renderWithProviders(
      <FleetGraphAssistantPanel
        viewType="person"
        documentId="person-001"
        workspaceId="ws-001"
      />
    );

    expect(screen.getByText(/draft standup/i)).toBeInTheDocument();
  });

  it('shows guidance summary when provided', () => {
    renderWithProviders(
      <FleetGraphAssistantPanel
        viewType="issue"
        documentId="doc-001"
        workspaceId="ws-001"
        guidanceSummary="Focus on resolving the blocker first."
      />
    );

    expect(screen.getByText(/resolving the blocker/i)).toBeInTheDocument();
  });

  it('renders recommendation list when provided', () => {
    const recommendations = [
      {
        id: 'rec-1',
        type: 'escalate' as const,
        reason: 'Blocker needs manager attention',
        expectedImpact: 'Unblocks 2 people',
        approvalStatus: 'pending' as const,
        affectedDocumentIds: [],
      },
    ];

    renderWithProviders(
      <FleetGraphAssistantPanel
        viewType="issue"
        documentId="doc-001"
        workspaceId="ws-001"
        recommendations={recommendations}
      />
    );

    expect(screen.getByText(/Blocker needs manager attention/i)).toBeInTheDocument();
  });
});
