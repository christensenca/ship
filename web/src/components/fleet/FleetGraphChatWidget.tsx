/**
 * Floating chat widget — global AI assistant popup.
 * Reads page context from CurrentDocumentContext and WorkspaceContext.
 */

import React from 'react';
import type { ChatMessage, ActionShape, FleetGraphViewType, FleetGraphFinding, FindingSeverity } from '@ship/shared';
import { useFleetGraphChat } from '../../hooks/useFleetGraphGuidance';
import { useProactiveScan } from '../../hooks/useProactiveScan';
import { useCurrentDocument } from '../../contexts/CurrentDocumentContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ActionCard } from './ActionCard';

const VIEW_TYPE_MAP: Record<string, FleetGraphViewType> = {
  issue: 'issue',
  sprint: 'week',
  person: 'person',
  project: 'project',
  program: 'program',
  wiki: 'issue', // fallback
  weekly_plan: 'week',
  weekly_retro: 'week',
  standup: 'week',
};

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#65a30d',
};

export function FleetGraphChatWidget() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [chatInput, setChatInput] = React.useState('');
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [proposedActions, setProposedActions] = React.useState<ActionShape[]>([]);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const chatMutation = useFleetGraphChat();
  const { currentDocumentId, currentDocumentType, currentDocumentTitle } = useCurrentDocument();
  const { currentWorkspace } = useWorkspace();

  const workspaceId = currentWorkspace?.id ?? '';
  const viewType: FleetGraphViewType = currentDocumentType
    ? VIEW_TYPE_MAP[currentDocumentType] ?? 'issue'
    : 'issue';

  const { data: proactiveData } = useProactiveScan(
    workspaceId || undefined,
    currentDocumentId,
    currentDocumentType,
  );

  const findings = proactiveData?.findings ?? [];
  const findingsCount = findings.length;

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = React.useCallback((overrideInput?: string) => {
    const text = (overrideInput ?? chatInput).trim();
    if (!text || !workspaceId) return;

    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: 'user' as const, content: text },
    ];

    const trimmed = newMessages.slice(-10);
    setChatMessages(trimmed);
    setChatInput('');

    chatMutation.mutate(
      {
        workspaceId,
        viewType,
        documentId: currentDocumentId ?? undefined,
        messages: trimmed,
      },
      {
        onSuccess: (data) => {
          console.log('[FleetGraph] Chat response:', data);
          setChatMessages(prev => [
            ...prev,
            { role: 'assistant' as const, content: data.message },
          ].slice(-10));

          // Only show actions with real proposed changes (non-null values and real targets)
          const realActions = data.proposedActions.filter(
            a => a.proposedChange.new_value != null && a.targetDocumentId,
          );
          if (realActions.length > 0) {
            setProposedActions(prev => [...prev, ...realActions]);
          }
        },
        onError: (err) => {
          console.error('[FleetGraph] Chat error:', err);
          setChatMessages(prev => [
            ...prev,
            { role: 'assistant' as const, content: `Error: ${err.message}` },
          ].slice(-10));
        },
      },
    );
  }, [chatInput, chatMessages, chatMutation, currentDocumentId, viewType, workspaceId]);

  const handleInvestigate = React.useCallback((finding: FleetGraphFinding) => {
    const message = `Help me resolve: ${finding.headline}`;
    setChatInput('');
    handleSend(message);
  }, [handleSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const contextLabel = currentDocumentType
    ? `Viewing: ${currentDocumentTitle || currentDocumentType}`
    : 'No document selected';

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: '#005ea2',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
          zIndex: 1000,
          transition: 'transform 0.15s ease',
          transform: isOpen ? 'rotate(45deg)' : 'none',
        }}
        aria-label={isOpen ? 'Close FleetGraph chat' : 'Open FleetGraph chat'}
      >
        {isOpen ? '+' : 'AI'}
        {/* Badge */}
        {!isOpen && findingsCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#dc2626',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              border: '2px solid #1a1a1a',
            }}
          >
            {findingsCount > 9 ? '9+' : findingsCount}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            width: '380px',
            maxHeight: '520px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f5f5f5' }}>
                FleetGraph
              </div>
              <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '2px' }}>
                {contextLabel}
              </div>
            </div>
            <button
              onClick={() => {
                setChatMessages([]);
                setProposedActions([]);
              }}
              style={{
                fontSize: '11px',
                color: '#8a8a8a',
                background: 'none',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: '200px',
          }}>
            {/* Proactive findings panel — shown when chat is empty */}
            {chatMessages.length === 0 && !chatMutation.isPending && findings.length > 0 && (
              <div style={{
                borderBottom: '1px solid #333',
                paddingBottom: '12px',
                marginBottom: '4px',
              }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#8a8a8a',
                  marginBottom: '8px',
                }}>
                  Findings
                </div>
                {findings.map((finding) => (
                  <div
                    key={finding.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      backgroundColor: '#262626',
                      marginBottom: '4px',
                    }}
                  >
                    {/* Severity dot */}
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: SEVERITY_COLORS[finding.severity],
                        flexShrink: 0,
                      }}
                    />
                    {/* Headline */}
                    <span style={{
                      flex: 1,
                      fontSize: '12px',
                      color: '#e0e0e0',
                      lineHeight: '1.3',
                    }}>
                      {finding.headline}
                    </span>
                    {/* Investigate button */}
                    <button
                      onClick={() => handleInvestigate(finding)}
                      disabled={chatMutation.isPending}
                      style={{
                        fontSize: '11px',
                        color: '#93c5fd',
                        background: 'none',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        cursor: chatMutation.isPending ? 'not-allowed' : 'pointer',
                        flexShrink: 0,
                        opacity: chatMutation.isPending ? 0.5 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Investigate
                    </button>
                  </div>
                ))}
              </div>
            )}

            {chatMessages.length === 0 && !chatMutation.isPending && findings.length === 0 && (
              <div style={{
                color: '#8a8a8a',
                fontSize: '13px',
                textAlign: 'center',
                padding: '32px 16px',
              }}>
                Ask about what's on your screen — sprint health, blockers, team progress.
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: msg.role === 'user' ? '#005ea2' : '#262626',
                  color: '#f5f5f5',
                  fontSize: '13px',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.4',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                }}
              >
                {msg.content}
              </div>
            ))}

            {chatMutation.isPending && (
              <div style={{
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: '#262626',
                color: '#8a8a8a',
                fontSize: '13px',
                alignSelf: 'flex-start',
              }}>
                Thinking...
              </div>
            )}

            {/* Proposed actions */}
            {proposedActions.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#8a8a8a',
                  marginBottom: '6px',
                }}>
                  Proposed Actions
                </div>
                {proposedActions.map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #333',
            display: 'flex',
            gap: '8px',
          }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask FleetGraph..."
              disabled={chatMutation.isPending || !workspaceId}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #333',
                backgroundColor: '#262626',
                color: '#f5f5f5',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={chatMutation.isPending || !chatInput.trim() || !workspaceId}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#005ea2',
                color: '#fff',
                cursor: chatMutation.isPending || !chatInput.trim() ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                opacity: chatMutation.isPending || !chatInput.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
