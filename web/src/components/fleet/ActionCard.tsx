/**
 * ActionCard — reusable approve/dismiss/snooze component for proposed actions.
 * Uses dark theme to match the app's color scheme.
 */

import React from 'react';
import type { ActionShape } from '@ship/shared';
import { useActionDecide } from '../../hooks/useFleetGraphActions';

interface ActionCardProps {
  action: ActionShape;
}

export function ActionCard({ action }: ActionCardProps) {
  const decideMutation = useActionDecide();
  const [snoozeHours, setSnoozeHours] = React.useState(24);

  const isPending = decideMutation.isPending;

  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: '6px',
      border: '1px solid #333',
      backgroundColor: '#1a1a1a',
      marginBottom: '6px',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 500, color: '#f5f5f5', marginBottom: '4px' }}>
        {action.description}
      </div>

      {action.targetDocumentTitle && (
        <div style={{ fontSize: '11px', color: '#8a8a8a', marginBottom: '4px' }}>
          Target: {action.targetDocumentTitle}
        </div>
      )}

      <div style={{ fontSize: '11px', color: '#8a8a8a', marginBottom: '8px' }}>
        Change: <code style={{ fontSize: '10px', backgroundColor: '#262626', color: '#ccc', padding: '1px 4px', borderRadius: '3px' }}>
          {action.proposedChange.field}: {String(action.proposedChange.old_value ?? '(none)')} → {String(action.proposedChange.new_value)}
        </code>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          onClick={() => decideMutation.mutate({ actionId: action.id, decision: 'approve' })}
          disabled={isPending}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid #16a34a',
            backgroundColor: 'rgba(22, 163, 74, 0.15)',
            color: '#4ade80',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          {isPending ? '...' : 'Approve'}
        </button>

        <button
          onClick={() => decideMutation.mutate({ actionId: action.id, decision: 'dismiss' })}
          disabled={isPending}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid #333',
            backgroundColor: 'transparent',
            color: '#8a8a8a',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
          }}
        >
          Dismiss
        </button>

        <button
          onClick={() => decideMutation.mutate({ actionId: action.id, decision: 'snooze', snoozeHours })}
          disabled={isPending}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid #333',
            backgroundColor: 'transparent',
            color: '#8a8a8a',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
          }}
        >
          Snooze
        </button>

        <select
          value={snoozeHours}
          onChange={(e) => setSnoozeHours(Number(e.target.value))}
          style={{
            padding: '3px 6px',
            borderRadius: '4px',
            border: '1px solid #333',
            backgroundColor: '#262626',
            color: '#8a8a8a',
            fontSize: '10px',
          }}
        >
          <option value={4}>4h</option>
          <option value={12}>12h</option>
          <option value={24}>24h</option>
          <option value={48}>48h</option>
        </select>
      </div>

      {decideMutation.isError && (
        <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>
          Failed to process decision. Please try again.
        </div>
      )}
    </div>
  );
}
