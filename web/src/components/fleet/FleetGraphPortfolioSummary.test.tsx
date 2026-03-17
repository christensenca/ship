/**
 * T033: Portfolio summary UI coverage
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FleetGraphPortfolioSummary } from './FleetGraphPortfolioSummary';

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

describe('FleetGraphPortfolioSummary', () => {
  it('renders loading state', () => {
    renderWithProviders(
      <FleetGraphPortfolioSummary workspaceId="ws-001" />
    );

    expect(screen.getByText(/loading portfolio/i)).toBeInTheDocument();
  });

  it('renders empty state', () => {
    renderWithProviders(
      <FleetGraphPortfolioSummary
        workspaceId="ws-001"
        programs={[]}
        summary="No programs found."
      />
    );

    expect(screen.getByText(/no programs found/i)).toBeInTheDocument();
  });

  it('renders program cards with status', () => {
    const programs = [
      {
        programId: 'p1',
        status: 'on_track' as const,
        headline: 'Alpha is progressing well',
        blockers: 0,
        silentDays: 0,
      },
      {
        programId: 'p2',
        status: 'at_risk' as const,
        headline: 'Beta has 3 blockers',
        blockers: 3,
        silentDays: 2,
      },
      {
        programId: 'p3',
        status: 'stalled' as const,
        headline: 'Gamma has had no activity for 10 days',
        blockers: 1,
        silentDays: 10,
      },
    ];

    renderWithProviders(
      <FleetGraphPortfolioSummary
        workspaceId="ws-001"
        programs={programs}
        summary="3 programs analyzed."
      />
    );

    expect(screen.getByText('Alpha is progressing well')).toBeInTheDocument();
    expect(screen.getByText('Beta has 3 blockers')).toBeInTheDocument();
    expect(screen.getByText('Gamma has had no activity for 10 days')).toBeInTheDocument();
  });

  it('shows status indicators', () => {
    const programs = [
      {
        programId: 'p1',
        status: 'on_track' as const,
        headline: 'Good',
      },
    ];

    renderWithProviders(
      <FleetGraphPortfolioSummary
        workspaceId="ws-001"
        programs={programs}
        summary="1 program."
      />
    );

    expect(screen.getByText(/on track/i)).toBeInTheDocument();
  });
});
