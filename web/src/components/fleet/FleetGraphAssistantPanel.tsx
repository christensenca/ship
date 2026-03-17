/**
 * T029: Assistant panel for contextual guidance and draft actions.
 */

import React from 'react';
import type { FleetGraphRecommendation, FleetGraphViewType } from '@ship/shared';
import { useContextualGuidance, useGenerateDraft } from '../../hooks/useFleetGraphGuidance';

interface FleetGraphAssistantPanelProps {
  viewType: FleetGraphViewType;
  documentId?: string;
  workspaceId: string;
  guidanceSummary?: string;
  recommendations?: FleetGraphRecommendation[];
}

export function FleetGraphAssistantPanel({
  viewType,
  documentId,
  workspaceId,
  guidanceSummary: propSummary,
  recommendations: propRecommendations,
}: FleetGraphAssistantPanelProps) {
  const guidanceMutation = useContextualGuidance();
  const draftMutation = useGenerateDraft();

  const summary = propSummary ?? guidanceMutation.data?.summary;
  const recommendations = propRecommendations ?? guidanceMutation.data?.recommendations ?? [];

  const handleGetGuidance = () => {
    guidanceMutation.mutate({
      workspaceId,
      viewType,
      documentId,
    });
  };

  const handleDraftStandup = () => {
    draftMutation.mutate({
      workspaceId,
      draftType: 'standup',
      sourceContext: documentId ? { personId: documentId } : {},
    });
  };

  return (
    <div style={{ padding: '12px 16px', fontSize: '13px' }}>
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '12px',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={handleGetGuidance}
          disabled={guidanceMutation.isPending}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: '#fff',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          {guidanceMutation.isPending ? 'Loading...' : 'Get Guidance'}
        </button>

        {(viewType === 'person' || viewType === 'week') && (
          <button
            onClick={handleDraftStandup}
            disabled={draftMutation.isPending}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {draftMutation.isPending ? 'Generating...' : 'Draft Standup'}
          </button>
        )}
      </div>

      {summary && (
        <div style={{
          padding: '10px 12px',
          borderRadius: '6px',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          marginBottom: '8px',
        }}>
          {summary}
        </div>
      )}

      {recommendations.length > 0 && (
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#6b7280',
            marginBottom: '6px',
          }}>
            Recommendations
          </div>
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                marginBottom: '4px',
                backgroundColor: '#fff',
              }}
            >
              <div style={{ fontWeight: 500, fontSize: '12px' }}>{rec.reason}</div>
              <div style={{ color: '#6b7280', fontSize: '11px', marginTop: '2px' }}>
                Impact: {rec.expectedImpact}
              </div>
            </div>
          ))}
        </div>
      )}

      {draftMutation.data && (
        <div style={{
          marginTop: '8px',
          padding: '10px 12px',
          borderRadius: '6px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8', marginBottom: '4px' }}>
            Draft Generated (automated)
          </div>
          <pre style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: '12px',
            margin: 0,
          }}>
            {draftMutation.data.draft.body}
          </pre>
        </div>
      )}
    </div>
  );
}
