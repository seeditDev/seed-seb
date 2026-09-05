import React, { useState, useEffect } from 'react';
import {
  FaTimes,
  FaHeadset,
  FaPlusCircle,
  FaListUl,
  FaPaperPlane,
  FaExclamationTriangle,
  FaCheckCircle,
  FaClock,
  FaTag,
  FaCommentDots,
} from 'react-icons/fa';
import { toast } from 'sonner';
import {
  createSupportTicket,
  subscribeStudentTickets,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '../services/supportService';

const SupportTicketModal = ({ isOpen, onClose, user, initialCategory = 'download_seb' }) => {
  const [activeSubTab, setActiveSubTab] = useState('submit'); // 'submit' | 'history'
  const [category, setCategory] = useState(initialCategory);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [myTickets, setMyTickets] = useState([]);

  // Subscribe to student tickets when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const effectiveUid = user?.uid || 'demo-student';
    const unsub = subscribeStudentTickets(effectiveUid, (list) => {
      setMyTickets(list);
    });
    return () => unsub();
  }, [isOpen, user?.uid]);

  // Sync initialCategory
  useEffect(() => {
    if (initialCategory) setCategory(initialCategory);
  }, [initialCategory]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error('Please enter an issue subject.');
      return;
    }
    if (!description.trim()) {
      toast.error('Please describe the issue in detail.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createSupportTicket({
        user,
        category,
        subject,
        description,
        priority,
        platform: 'seed-seb',
      });

      toast.success(`Support ticket ${res.ticketNumber} created! Our technical team has been notified.`);
      setSubject('');
      setDescription('');
      setActiveSubTab('history');
    } catch (err) {
      toast.error(err.message || 'Failed to submit support ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          color: 'var(--text-main, #0f172a)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
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
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(37, 99, 235, 0.12)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
                fontSize: '18px',
              }}
            >
              <FaHeadset />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                Help &amp; Technical Support
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                Report an issue with SEED-SEB, Android Widget, or Exams. Track status in real time.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #64748b)',
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

        {/* Subtabs Switcher */}
        <div
          style={{
            display: 'flex',
            padding: '10px 24px 0',
            gap: '8px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            background: 'var(--bg-primary, #ffffff)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveSubTab('submit')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeSubTab === 'submit' ? '2.5px solid #2563eb' : '2.5px solid transparent',
              color: activeSubTab === 'submit' ? '#2563eb' : 'var(--text-muted, #64748b)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <FaPlusCircle /> Submit New Request
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('history')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeSubTab === 'history' ? '2.5px solid #2563eb' : '2.5px solid transparent',
              color: activeSubTab === 'history' ? '#2563eb' : 'var(--text-muted, #64748b)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <FaListUl /> My Requests {myTickets.length > 0 && `(${myTickets.length})`}
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {activeSubTab === 'submit' ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Category */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main, #0f172a)' }}>
                  Issue Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-primary, #ffffff)',
                    color: 'var(--text-main, #0f172a)',
                    fontSize: '13.5px',
                    fontWeight: 500,
                  }}
                >
                  {TICKET_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main, #0f172a)' }}>
                  Severity / Urgency
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {TICKET_PRIORITIES.map((p) => {
                    const active = priority === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPriority(p.value)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: active ? `2px solid ${p.color}` : '1px solid var(--border-color, #cbd5e1)',
                          background: active ? p.bg : 'var(--bg-secondary, #f8fafc)',
                          color: active ? p.color : 'var(--text-secondary, #475569)',
                          fontSize: '12px',
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main, #0f172a)' }}>
                  Subject / Summary
                </label>
                <input
                  type="text"
                  placeholder="e.g. SEED-SEB lockdown kiosk freeze, or camera feed error"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-primary, #ffffff)',
                    color: 'var(--text-main, #0f172a)',
                    fontSize: '13.5px',
                  }}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main, #0f172a)' }}>
                  Detailed Description &amp; Error Messages
                </label>
                <textarea
                  rows={4}
                  placeholder="Describe what happened, your OS version (e.g. Windows 11 64-bit), and any error dialog codes."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-primary, #ffffff)',
                    color: 'var(--text-main, #0f172a)',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    resize: 'vertical',
                  }}
                  required
                />
              </div>

              {/* Student Info preview */}
              <div
                style={{
                  background: 'var(--bg-secondary, #f8fafc)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '12px',
                  color: 'var(--text-muted, #64748b)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  Submitted by: <strong>{user?.name || 'Student'}</strong> ({user?.email})
                </span>
                <span>
                  Institution: {typeof user?.tenant === 'object' ? (user.tenant.name || user.tenant.id || 'Standard') : (user?.tenant || user?.tenantId || 'Standard')}
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '14px',
                  border: 'none',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                }}
              >
                <FaPaperPlane /> {isSubmitting ? 'Submitting Ticket...' : 'Submit Support Request'}
              </button>
            </form>
          ) : (
            /* History Subtab */
            <div>
              {myTickets.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: 'var(--text-muted, #64748b)',
                  }}
                >
                  <FaHeadset style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>No support tickets submitted yet.</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                    If you run into issues with SEED-SEB or mobile widgets, submit a ticket above!
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {myTickets.map((ticket) => {
                    const st = TICKET_STATUSES[ticket.status] || TICKET_STATUSES.OPEN;
                    const dateStr = ticket.createdAt instanceof Date ? ticket.createdAt.toLocaleString() : 'Recently';

                    return (
                      <div
                        key={ticket.id}
                        style={{
                          background: 'var(--bg-primary, #ffffff)',
                          border: '1px solid var(--border-color, #e2e8f0)',
                          borderRadius: '14px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: 'var(--bg-secondary, #f1f5f9)',
                                color: 'var(--text-secondary, #334155)',
                                letterSpacing: '0.5px',
                              }}
                            >
                              {ticket.ticketNumber || ticket.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted, #64748b)' }}>
                              {ticket.categoryLabel || ticket.category}
                            </span>
                          </div>

                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '3px 9px',
                              borderRadius: '12px',
                              background: st.bg,
                              color: st.color,
                            }}
                          >
                            {st.label}
                          </span>
                        </div>

                        <div>
                          <h4 style={{ margin: '0 0 4px', fontSize: '14.5px', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                            {ticket.subject}
                          </h4>
                          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted, #475569)', lineHeight: '1.5' }}>
                            {ticket.description}
                          </p>
                        </div>

                        {/* Admin reply / resolution note if present */}
                        {ticket.resolutionNotes && (
                          <div
                            style={{
                              marginTop: '4px',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              background: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              color: '#166534',
                              fontSize: '12.5px',
                              lineHeight: '1.5',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '2px' }}>
                              <FaCommentDots /> Admin Resolution Note:
                            </div>
                            <div>{ticket.resolutionNotes}</div>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted, #94a3b8)', borderTop: '1px solid var(--border-color, #f1f5f9)', paddingTop: '8px' }}>
                          <span>Priority: <strong>{ticket.priority}</strong></span>
                          <span>Submitted: {dateStr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportTicketModal;
