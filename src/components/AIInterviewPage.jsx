import React, { useMemo } from 'react';
import { useNavigate } from './router-compat';
import AIInterviewSimulator from './AIInterviewSimulator';
import SecurityWatermark from './SecurityWatermark';
import { FaArrowLeft, FaUserTie } from 'react-icons/fa';

const AIInterviewPage = () => {
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('auth_data') || '{}');
    } catch (_) {
      return {};
    }
  }, []);

  return (
    <div
      className="ai-interview-page-root"
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary, #0f172a)',
        color: 'var(--text-main, #f8fafc)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif"
      }}
    >
      <SecurityWatermark email={user?.email} />

      {/* Top Navigation Bar */}
      <header
        style={{
          height: '60px',
          background: 'var(--bg-secondary, #1e293b)',
          borderBottom: '1px solid var(--border-color, #334155)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={() => {
              window.speechSynthesis?.cancel();
              navigate('/student/dashboard');
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border-color, #334155)',
              color: 'var(--text-main, #f8fafc)',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '0.84rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <FaArrowLeft /> Dashboard
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '1rem'
              }}
            >
              <FaUserTie />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', letterSpacing: '0.02em', lineHeight: '1.2' }}>
                SEED-IT AI Placement Studio
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)' }}>
                Intelligent Mock Interview & Evaluation Runtime
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-muted, #94a3b8)',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '5px 12px',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            {user?.name || user?.email || 'Candidate'}
          </span>
        </div>
      </header>

      {/* Full-Screen Workspace */}
      <main
        style={{
          flex: 1,
          padding: '24px',
          maxWidth: '1400px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box'
        }}
      >
        <AIInterviewSimulator user={user} />
      </main>
    </div>
  );
};

export default AIInterviewPage;
