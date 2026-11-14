import React, { useMemo, useState } from 'react';
import { useNavigate } from './router-compat';
import AIInterviewSimulator from './AIInterviewSimulator';
import SecurityWatermark from './SecurityWatermark';
import PremiumUpgradeModal from './PremiumUpgradeModal';
import { isProOrAbove } from '../services/subscriptionValidator';
import { FaArrowLeft, FaUserTie, FaLock, FaStar } from 'react-icons/fa';

const AIInterviewPage = () => {
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('auth_data') || '{}');
    } catch (_) {
      return {};
    }
  }, []);

  const isPro = isProOrAbove(user);

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
        {!isPro ? (
          <div style={{ padding: '60px 24px', maxWidth: '850px', margin: '40px auto', textAlign: 'center' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
              borderRadius: '20px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4), 0 0 40px rgba(99, 102, 241, 0.1)',
              padding: '48px 36px',
              position: 'relative'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.3) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                color: '#a5b4fc',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                marginBottom: '20px'
              }}>
                <FaLock />
              </div>
              <div style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '20px',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                color: '#a5b4fc',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: '14px'
              }}>
                Pro &amp; Premium Feature
              </div>
              <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#f8fafc', margin: '0 0 12px 0' }}>
                AI Placement Interview Studio
              </h2>
              <p style={{ fontSize: '15px', color: '#94a3b8', maxWidth: '600px', margin: '0 auto 28px auto', lineHeight: 1.6 }}>
                The AI Mock Interview Studio is exclusively available for SEED Pro &amp; Premium members. Simulate realistic technical, behavioral, and HR interviews with real-time speech feedback and performance scorecards.
              </p>
              <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(true)}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px 28px',
                    fontSize: '14.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <FaStar /> Upgrade to Pro to Unlock
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/student/dashboard')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    padding: '12px 24px',
                    fontSize: '14.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        ) : (
          <AIInterviewSimulator user={user} />
        )}
      </main>

      <PremiumUpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        user={user}
        onUpgradeSuccess={() => window.location.reload()}
      />
    </div>
  );
};

export default AIInterviewPage;
