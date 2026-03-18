/**
 * Floating chat widget — unified chat plus surfaced action inbox.
 */

import React from 'react';
import Markdown from 'react-markdown';
import type { ActionShape, ChatMessage, FleetGraphViewType } from '@ship/shared';
import { useFleetGraphActions } from '../../hooks/useFleetGraphActions';
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
  wiki: 'issue',
  weekly_plan: 'week',
  weekly_retro: 'week',
  standup: 'week',
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

  const { data: pendingActionsData } = useFleetGraphActions(workspaceId);
  const inboxActions = pendingActionsData?.actions ?? [];
  const proactiveScan = useProactiveScan(workspaceId, currentDocumentId, currentDocumentType);
  const proactiveFindings = proactiveScan.data?.findings ?? [];
  const alertCount = inboxActions.length + proactiveFindings.length;

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = React.useCallback(() => {
    const text = chatInput.trim();
    if (!text || !workspaceId) return;

    const nextMessages = [...chatMessages, { role: 'user' as const, content: text }].slice(-10);
    setChatMessages(nextMessages);
    setChatInput('');

    chatMutation.mutate(
      {
        workspaceId,
        viewType,
        documentId: currentDocumentId ?? undefined,
        messages: nextMessages,
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
        onError: (err) => {
          setChatMessages((prev) => [
            ...prev,
            { role: 'assistant' as const, content: `Error: ${err.message}` },
          ].slice(-10));
        },
      },
    );
  }, [chatInput, chatMessages, chatMutation, currentDocumentId, viewType, workspaceId]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const contextLabel = currentDocumentType
    ? `Viewing: ${currentDocumentTitle || currentDocumentType}`
    : 'No document selected';

  return (
    <>
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
        {!isOpen && alertCount > 0 && (
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
            {alertCount > 9 ? '9+' : alertCount}
          </span>
        )}
      </button>

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
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #333',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f5f5f5' }}>FleetGraph</div>
              <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '2px' }}>{contextLabel}</div>
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

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              minHeight: '200px',
            }}
          >
            {chatMessages.length === 0 && !chatMutation.isPending && (
              <div style={{ borderBottom: proactiveFindings.length > 0 || inboxActions.length > 0 ? '1px solid #333' : 'none', paddingBottom: proactiveFindings.length > 0 || inboxActions.length > 0 ? '12px' : 0, marginBottom: '4px' }}>
                {proactiveFindings.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#8a8a8a',
                        marginBottom: '8px',
                      }}
                    >
                      Current Risks
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: inboxActions.length > 0 ? '12px' : 0 }}>
                      {proactiveFindings.map((finding) => (
                        <div
                          key={finding.id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            backgroundColor: '#262626',
                            border: '1px solid #333',
                            color: '#f5f5f5',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: finding.severity === 'critical' ? '#fca5a5' : finding.severity === 'high' ? '#fdba74' : finding.severity === 'medium' ? '#fde68a' : '#bef264',
                            }}>
                              {finding.severity}
                            </span>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{finding.headline}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#d4d4d4', lineHeight: 1.4 }}>{finding.rationale}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {inboxActions.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#8a8a8a',
                        marginBottom: '8px',
                      }}
                    >
                      Inbox
                    </div>
                    {inboxActions.map((action) => (
                      <ActionCard key={action.id} action={action} />
                    ))}
                  </>
                )}
              </div>
            )}

            {chatMessages.length === 0 && !chatMutation.isPending && proactiveFindings.length === 0 && inboxActions.length === 0 && (
              <div style={{ color: '#8a8a8a', fontSize: '13px', textAlign: 'center', padding: '32px 16px' }}>
                Ask FleetGraph what you should work on next.
              </div>
            )}

            {chatMessages.map((message, index) => (
              <div
                key={index}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: message.role === 'user' ? '#005ea2' : '#262626',
                  color: '#f5f5f5',
                  fontSize: '13px',
                  lineHeight: '1.4',
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  ...(message.role === 'user' ? { whiteSpace: 'pre-wrap' as const } : {}),
                }}
              >
                {message.role === 'assistant' ? (
                  <Markdown
                    components={{
                      p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
                      ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ol>,
                      li: ({ children }) => <li style={{ marginBottom: '2px' }}>{children}</li>,
                      strong: ({ children }) => <strong style={{ color: '#fff' }}>{children}</strong>,
                      code: ({ children }) => <code style={{ fontSize: '11px', backgroundColor: '#1a1a1a', color: '#93c5fd', padding: '1px 4px', borderRadius: '3px' }}>{children}</code>,
                    }}
                  >
                    {message.content}
                  </Markdown>
                ) : message.content}
              </div>
            ))}

            {chatMutation.isPending && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#262626',
                  color: '#8a8a8a',
                  fontSize: '13px',
                  alignSelf: 'flex-start',
                }}
              >
                Thinking...
              </div>
            )}

            {proposedActions.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#8a8a8a',
                    marginBottom: '6px',
                  }}
                >
                  Proposed Actions
                </div>
                {proposedActions.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onDecided={(actionId) => setProposedActions((prev) => prev.filter((candidate) => candidate.id !== actionId))}
                  />
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #333',
              display: 'flex',
              gap: '8px',
            }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
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
              onClick={handleSend}
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
