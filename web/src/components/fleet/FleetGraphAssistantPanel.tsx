/**
 * Assistant panel — contextual guidance, chat input, draft actions, and inline action cards.
 */

import React from 'react';
import type { FleetGraphRecommendation, FleetGraphViewType, ChatMessage, ActionShape } from '@ship/shared';
import { useContextualGuidance, useGenerateDraft, useFleetGraphChat } from '../../hooks/useFleetGraphGuidance';
import { ActionCard } from './ActionCard';

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
  const chatMutation = useFleetGraphChat();

  const [chatInput, setChatInput] = React.useState('');
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [proposedActions, setProposedActions] = React.useState<ActionShape[]>([]);

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

  const handleSendChat = () => {
    if (!chatInput.trim()) return;

    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: 'user' as const, content: chatInput.trim() },
    ];

    // Keep max 10 messages
    const trimmedMessages = newMessages.slice(-10);
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
          setChatMessages(prev => [
            ...prev,
            { role: 'assistant' as const, content: data.message },
          ].slice(-10));

          if (data.proposedActions.length > 0) {
            setProposedActions(prev => [...prev, ...data.proposedActions]);
          }
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  return (
    <div style={{ padding: '12px 16px', fontSize: '13px' }}>
      {/* Action buttons */}
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

      {/* Chat message history */}
      {chatMessages.length > 0 && (
        <div style={{ marginBottom: '8px', maxHeight: '300px', overflowY: 'auto' }}>
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                marginBottom: '4px',
                backgroundColor: msg.role === 'user' ? '#eff6ff' : '#f9fafb',
                border: `1px solid ${msg.role === 'user' ? '#bfdbfe' : '#e5e7eb'}`,
              }}
            >
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: msg.role === 'user' ? '#1d4ed8' : '#6b7280',
                marginBottom: '2px',
                textTransform: 'uppercase',
              }}>
                {msg.role === 'user' ? 'You' : 'FleetGraph'}
              </div>
              <div style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div style={{
              padding: '8px 10px',
              borderRadius: '6px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              color: '#6b7280',
              fontSize: '12px',
            }}>
              Thinking...
            </div>
          )}
        </div>
      )}

      {/* Chat input */}
      <div style={{
        display: 'flex',
        gap: '6px',
        marginBottom: '12px',
      }}>
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask FleetGraph..."
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

      {/* Guidance summary */}
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

      {/* Proposed actions from chat */}
      {proposedActions.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#6b7280',
            marginBottom: '6px',
          }}>
            Proposed Actions
          </div>
          {proposedActions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      )}

      {/* Recommendations */}
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

      {/* Draft output */}
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
