/**
 * T038: Portfolio summary component.
 */

import React from 'react';
import type { FleetGraphProgramSummary } from '@ship/shared';
import { usePortfolioSummary } from '../../hooks/useFleetGraphPortfolioQuery';

interface FleetGraphPortfolioSummaryProps {
  workspaceId: string;
  programs?: FleetGraphProgramSummary[];
  summary?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  on_track: { bg: '#f0fdf4', text: '#166534', dot: '#22c55e' },
  at_risk: { bg: '#fffbeb', text: '#92400e', dot: '#f59e0b' },
  stalled: { bg: '#fef2f2', text: '#991b1b', dot: '#ef4444' },
};

const STATUS_LABELS: Record<string, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  stalled: 'Stalled',
};

export function FleetGraphPortfolioSummary({
  workspaceId,
  programs: propPrograms,
  summary: propSummary,
}: FleetGraphPortfolioSummaryProps) {
  const portfolioMutation = usePortfolioSummary();

  const programs = propPrograms ?? portfolioMutation.data?.programs;
  const summary = propSummary ?? portfolioMutation.data?.summary;

  const handleRefresh = () => {
    portfolioMutation.mutate({ workspaceId });
  };

  // Auto-fetch if no prop data
  React.useEffect(() => {
    if (!propPrograms && !portfolioMutation.data && !portfolioMutation.isPending) {
      portfolioMutation.mutate({ workspaceId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  if (portfolioMutation.isPending && !propPrograms) {
    return (
      <div style={{ padding: '16px', color: '#6b7280', fontSize: '13px' }}>
        Loading portfolio summary...
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      {summary && (
        <div style={{
          fontSize: '13px',
          color: '#374151',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{summary}</span>
          <button
            onClick={handleRefresh}
            disabled={portfolioMutation.isPending}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            {portfolioMutation.isPending ? '...' : 'Refresh'}
          </button>
        </div>
      )}

      {programs && programs.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {programs.map((program) => (
            <ProgramCard key={program.programId} program={program} />
          ))}
        </div>
      ) : (
        !portfolioMutation.isPending && (
          <div style={{ color: '#6b7280', fontSize: '13px' }}>
            No program data available.
          </div>
        )
      )}
    </div>
  );
}

function ProgramCard({ program }: { program: FleetGraphProgramSummary }) {
  const colors = STATUS_COLORS[program.status] ?? STATUS_COLORS.on_track;
  const label = STATUS_LABELS[program.status] ?? program.status;

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
        backgroundColor: '#fff',
        fontSize: '13px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '1px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: colors.bg,
            color: colors.text,
          }}
        >
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: colors.dot,
          }} />
          {label}
        </span>

        {program.blockers !== undefined && program.blockers > 0 && (
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            {program.blockers} blocker{program.blockers !== 1 ? 's' : ''}
          </span>
        )}

        {program.silentDays !== undefined && program.silentDays > 7 && (
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            {program.silentDays}d silent
          </span>
        )}
      </div>

      <div style={{ color: '#374151' }}>{program.headline}</div>
    </div>
  );
}
