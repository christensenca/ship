/**
 * T021: Week risk summary panel UI.
 *
 * Displays proactive findings for a week with severity badges
 * and recommendation confirmation actions.
 */

import React from 'react';
import type { FleetGraphFinding, FleetGraphRecommendation } from '@ship/shared';
import { useWeekFindingsQuery } from '../../hooks/useFleetGraphWeekQuery';

interface FleetGraphWeekPanelProps {
  weekId: string;
  workspaceId: string;
  /** Override findings for testing / SSR */
  findings?: FleetGraphFinding[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#65a30d',
};

const SEVERITY_BG: Record<string, string> = {
  critical: '#fef2f2',
  high: '#fff7ed',
  medium: '#fefce8',
  low: '#f7fee7',
};

export function FleetGraphWeekPanel({ weekId, workspaceId, findings: propFindings }: FleetGraphWeekPanelProps) {
  const { data, isLoading } = useWeekFindingsQuery(weekId, workspaceId);

  const findings = propFindings ?? data?.findings ?? [];

  if (isLoading && !propFindings) {
    return (
      <div style={{ padding: '12px 16px', color: '#6b7280', fontSize: '13px' }}>
        Analyzing week health...
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div style={{ padding: '12px 16px', color: '#6b7280', fontSize: '13px' }}>
        No risks detected for this week.
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{
        padding: '8px 16px',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#6b7280',
      }}>
        Week Health ({findings.length} finding{findings.length !== 1 ? 's' : ''})
      </div>

      {findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </div>
  );
}

function FindingCard({ finding }: { finding: FleetGraphFinding }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      style={{
        margin: '4px 12px',
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
        backgroundColor: '#fff',
        fontSize: '13px',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <SeverityBadge severity={finding.severity} />
        <span style={{ fontWeight: 500, flex: 1 }}>{finding.headline}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: '8px', color: '#4b5563', fontSize: '12px' }}>
          <p style={{ margin: '0 0 4px' }}>{finding.rationale}</p>
          {finding.evidence.length > 0 && (
            <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
              {finding.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        color: SEVERITY_COLORS[severity] ?? '#6b7280',
        backgroundColor: SEVERITY_BG[severity] ?? '#f3f4f6',
        textTransform: 'uppercase',
      }}
    >
      {severity}
    </span>
  );
}
