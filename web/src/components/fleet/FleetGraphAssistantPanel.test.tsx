import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FleetGraphAssistantPanel } from './FleetGraphAssistantPanel';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('FleetGraphAssistantPanel', () => {
  it('renders the simplified chat entry point', () => {
    renderWithProviders(
      <FleetGraphAssistantPanel
        viewType="issue"
        documentId="doc-001"
        workspaceId="ws-001"
      />,
    );

    expect(screen.getByPlaceholderText(/what to work on next/i)).toBeInTheDocument();
    expect(screen.getByText(/^send$/i)).toBeInTheDocument();
  });
});
