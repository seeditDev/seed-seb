import React, { useState, useEffect, useRef } from 'react';
import {
  FaTimes,
  FaPaperPlane,
  FaLock,
  FaHeadset,
  FaUser,
  FaCheckCircle,
  FaInfoCircle,
} from 'react-icons/fa';
import { toast } from 'sonner';
import {
  subscribeTicketMessages,
  sendTicketChatMessage,
  TICKET_STATUSES,
} from '../services/supportService';

const SupportTicketChatModal = ({ isOpen, onClose, ticket, currentUser }) => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Subscribe to real-time messages for this ticket
  useEffect(() => {
    if (!isOpen || !ticket?.id) {
      setMessages([]);
      setInputText('');
      return;
    }

    const unsub = subscribeTicketMessages(ticket.id, (msgs) => {
      setMessages(msgs);
    });

    return () => unsub();
  }, [isOpen, ticket?.id]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen || !ticket) return null;

  const isClosed = ticket.status === 'CLOSED' || ticket.status === 'closed';
  const isChatEnabled = Boolean(ticket.chatEnabled);
  const statusInfo = TICKET_STATUSES[ticket.status] || TICKET_STATUSES.OPEN;

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    if (isClosed) {
      toast.error('This ticket is closed. Chat has concluded.');
      return;
    }

    if (!isChatEnabled) {
      toast.error('Chat has not been initiated by support staff yet.');
      return;
    }

    setIsSending(true);
    try {
      const effectiveUid = currentUser?.uid || 'demo-student';
      const effectiveName = currentUser?.name || currentUser?.displayName || 'Student';

      await sendTicketChatMessage(ticket.id, {
        senderId: effectiveUid,
        senderName: effectiveName,
        senderRole: 'student',
        text: inputText.trim(),
      });
      setInputText('');
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary, #ffffff)',
          color: 'var(--text-main, #0f172a)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.3)',
          border: '1px solid var(--border-color, #e2e8f0)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              <FaHeadset />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: '5px',
                    background: 'var(--bg-primary, #ffffff)',
                    color: 'var(--text-secondary, #475569)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                  }}
                >
                  {ticket.ticketNumber || ticket.id.slice(0, 8).toUpperCase()}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: statusInfo.bg,
                    color: statusInfo.color,
                  }}
                >
                  {statusInfo.label}
                </span>
              </div>
              <h3
                style={{
                  margin: '4px 0 0',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--text-main, #0f172a)',
                  maxWidth: '380px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={ticket.subject}
              >
                {ticket.subject}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FaTimes />
          </button>
        </div>

        {/* Ticket Problem Summary Snippet */}
        <div
          style={{
            padding: '10px 20px',
            background: 'var(--bg-primary, #ffffff)',
            borderBottom: '1px solid var(--border-color, #f1f5f9)',
            fontSize: '12px',
            color: 'var(--text-secondary, #475569)',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Issue:</span>
            <span style={{ lineClamp: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.description}
            </span>
          </div>
          {ticket.resolutionNotes && (
            <div
              style={{
                marginTop: '6px',
                padding: '6px 10px',
                borderRadius: '6px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FaCheckCircle style={{ color: '#10b981', flexShrink: 0 }} />
              <span><strong>Resolution Note:</strong> {ticket.resolutionNotes}</span>
            </div>
          )}
        </div>

        {/* Conversation Body */}
        <div
          style={{
            flex: 1,
            padding: '16px 20px',
            overflowY: 'auto',
            background: 'var(--bg-secondary, #f8fafc)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minHeight: '280px',
            maxHeight: '380px',
          }}
        >
          {!isChatEnabled ? (
            <div
              style={{
                margin: 'auto',
                textAlign: 'center',
                padding: '24px 16px',
                background: 'var(--bg-primary, #ffffff)',
                borderRadius: '12px',
                border: '1px dashed var(--border-color, #cbd5e1)',
                maxWidth: '420px',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: '#3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  margin: '0 auto 10px',
                }}
              >
                <FaHeadset />
              </div>
              <h4 style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                Live Chat Not Initiated
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #64748b)', lineHeight: '1.5' }}>
                Live chat is initiated by the SEED support team when dedicated troubleshooting is required. Once a support staff starts a conversation, you can chat directly with them in real time.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div
              style={{
                margin: 'auto',
                textAlign: 'center',
                color: 'var(--text-muted, #94a3b8)',
                fontSize: '12.5px',
              }}
            >
              <FaInfoCircle style={{ margin: '0 auto 6px', display: 'block', fontSize: '20px', opacity: 0.5 }} />
              Chat channel is active. Waiting for the first message.
            </div>
          ) : (
            messages.map((msg) => {
              const isAdmin = msg.senderRole === 'admin';
              const timeStr =
                msg.createdAt instanceof Date
                  ? msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isAdmin ? 'flex-start' : 'flex-end',
                    gap: '3px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '10.5px',
                      color: 'var(--text-muted, #64748b)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '0 4px',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: isAdmin ? '#2563eb' : 'var(--text-main, #0f172a)' }}>
                      {isAdmin ? `🛡️ ${msg.senderName || 'Support Staff'}` : 'You'}
                    </span>
                    <span>• {timeStr}</span>
                  </div>
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '10px 14px',
                      borderRadius: isAdmin ? '14px 14px 14px 2px' : '14px 14px 2px 14px',
                      background: isAdmin
                        ? 'var(--bg-primary, #ffffff)'
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: isAdmin ? 'var(--text-main, #0f172a)' : '#ffffff',
                      border: isAdmin ? '1px solid var(--border-color, #e2e8f0)' : 'none',
                      fontSize: '12.5px',
                      lineHeight: '1.45',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Footer Area: Input or Closed Channel Alert */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            background: 'var(--bg-primary, #ffffff)',
          }}
        >
          {isClosed ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                color: '#b45309',
                fontSize: '12px',
              }}
            >
              <FaLock style={{ fontSize: '14px', flexShrink: 0 }} />
              <div>
                <strong>Ticket Closed:</strong> The live chat channel has ended because this ticket is marked as closed. The complete conversation history above remains preserved for your future reference.
              </div>
            </div>
          ) : !isChatEnabled ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'var(--text-muted, #64748b)',
                fontSize: '12px',
              }}
            >
              <span>Live chat is currently inactive for this ticket.</span>
              <button
                onClick={onClose}
                style={{
                  background: 'var(--bg-secondary, #f1f5f9)',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--text-main, #334155)',
                }}
              >
                Close Window
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSendMessage}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <input
                type="text"
                placeholder="Type your message to support staff... (Press Enter to send)"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isSending}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  background: 'var(--bg-secondary, #f8fafc)',
                  color: 'var(--text-main, #0f172a)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isSending || !inputText.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSending || !inputText.trim() ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                }}
              >
                <FaPaperPlane style={{ fontSize: '11px' }} />
                <span>{isSending ? 'Sending...' : 'Send'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportTicketChatModal;
