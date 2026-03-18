/**
 * Assistant panel — simplified to unified chat plus approval-gated actions.
 */

import React from 'react';
import type { ActionShape, ChatMessage, FleetGraphViewType } from '@ship/shared';
import { useFleetGraphChat } from '../../hooks/useFleetGraphGuidance';
import { ActionCard } from './ActionCard';

interface FleetGraphAssistantPanelProps {
  viewType: FleetGraphViewType;
  documentId?: string;
  workspaceId: string;
  guidanceSummary?: string;
  recommendations?: Array<{ id: string; reason: string; expectedImpact: string }>;
}

export function FleetGraphAssistantPanel({
  viewType,
  documentId,
  workspaceId,
}: FleetGraphAssistantPanelProps) {
  const chatMutation = useFleetGraphChat();
  const [chatInput, setChatInput] = React.useState('');
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [proposedActions, setProposedActions] = React.useState<ActionShape[]>([]);

  const handleSendChat = () => {
    if (!chatInput.trim()) return;

    const trimmedMessages = [...chatMessages, { role: 'user' as const, content: chatInput.trim() }].slice(-10);
    setChatMessages(trimmedMessages);
    setChatInput('');

    chatMutation.mutate(
      {
        workspaceId,
        viewType,
        documentId,
        messages: trimmedMessages,
      },
      {
        onSuccess: (data) => {
          setChatMessages((prev) => [
            ...prev,
            { role: 'assistant' as const, content: data.message },
          ].slice(-10));

          if (data.proposedActions.length > 0) {
            setProposedActions((prev) => [...prev, ...data.proposedActions]);
          }
        },
      },
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendChat();
    }
  };

  return (
    <div style={{ padding: '12px 16px', fontSize: '13px' }}>
      {chatMessages.length > 0 && (
        <div style={{ marginBottom: '8px', maxHeight: '300px', overflowY: 'auto' }}>
          {chatMessages.map((message, index) => (
            <div
              key={index}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                marginBottom: '4px',
                backgroundColor: message.role === 'user' ? '#eff6ff' : '#f9fafb',
                border: `1px solid ${message.role === 'user' ? '#bfdbfe' : '#e5e7eb'}`,
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: message.role === 'user' ? '#1d4ed8' : '#6b7280',
                  marginBottom: '2px',
                  textTransform: 'uppercase',
                }}
              >
                {message.role === 'user' ? 'You' : 'FleetGraph'}
              </div>
              <div style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{message.content}</div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                color: '#6b7280',
                fontSize: '12px',
              }}
            >
              Thinking...
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        <input
          type="text"
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask FleetGraph what to work on next..."
          disabled={chatMutation.isPending}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSendChat}
          disabled={chatMutation.isPending || !chatInput.trim()}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid #3b82f6',
            backgroundColor: '#3b82f6',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          Send
        </button>
      </div>

      {proposedActions.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#6b7280',
              marginBottom: '6px',
            }}
          >
            Proposed Actions
          </div>
          {proposedActions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}
