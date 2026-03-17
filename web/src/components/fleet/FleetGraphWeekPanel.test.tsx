/**
 * T015: Week risk panel UI coverage
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FleetGraphWeekPanel } from './FleetGraphWeekPanel';

// Wrap component in required providers
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

describe('FleetGraphWeekPanel', () => {
  it('renders loading state initially', () => {
    renderWithProviders(
      <FleetGraphWeekPanel weekId="week-001" workspaceId="ws-001" />
    );

    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
  });

  it('renders empty state when no findings', () => {
    renderWithProviders(
      <FleetGraphWeekPanel
        weekId="week-001"
        workspaceId="ws-001"
        findings={[]}
      />
    );

    expect(screen.getByText(/no risks detected/i)).toBeInTheDocument();
  });

  it('renders findings when provided', () => {
    const findings = [
      {
        id: 'f1',
        category: 'blocker' as const,
        severity: 'critical' as const,
        headline: 'Issue #42 is blocked',
        rationale: 'Blocked for 3 days',
        evidence: [],
        relatedDocumentIds: [],
        recommendedAudience: [],
        requiresHumanAction: true,
        confidence: 0.9,
      },
    ];

    renderWithProviders(
      <FleetGraphWeekPanel
        weekId="week-001"
        workspaceId="ws-001"
        findings={findings}
      />
    );

    expect(screen.getByText('Issue #42 is blocked')).toBeInTheDocument();
  });

  it('shows severity badges', () => {
    const findings = [
      {
        id: 'f1',
        category: 'blocker' as const,
        severity: 'critical' as const,
        headline: 'Critical blocker',
        rationale: 'Test',
        evidence: [],
        relatedDocumentIds: [],
        recommendedAudience: [],
        requiresHumanAction: true,
        confidence: 0.9,
      },
      {
        id: 'f2',
        category: 'stale_work' as const,
        severity: 'high' as const,
        headline: 'Stale issue',
        rationale: 'Test',
        evidence: [],
        relatedDocumentIds: [],
        recommendedAudience: [],
        requiresHumanAction: true,
        confidence: 0.8,
      },
    ];

    renderWithProviders(
      <FleetGraphWeekPanel
        weekId="week-001"
        workspaceId="ws-001"
        findings={findings}
      />
    );

    expect(screen.getByText(/critical/i)).toBeInTheDocument();
    expect(screen.getByText(/high/i)).toBeInTheDocument();
  });
});
