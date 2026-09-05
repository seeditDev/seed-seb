import React from 'react';
import {
  FaTimes,
  FaShieldAlt,
  FaCheckCircle,
  FaFileAlt,
  FaQuestionCircle,
} from 'react-icons/fa';

export const DocumentationModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

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
          maxWidth: '640px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          color: 'var(--text-main, #0f172a)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(37, 99, 235, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
              }}
            >
              <FaFileAlt />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>Installation Guides &amp; FAQs</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                Official setup guides for SEED-SEB and Android Widget
              </span>
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
              padding: '4px',
            }}
          >
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Guide 1 */}
          <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 700, color: '#2563eb' }}>
              🪟 Windows SmartScreen / Antivirus Prompt
            </h4>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-secondary, #475569)', lineHeight: '1.6' }}>
              When downloading <code>SEED-SEB-Setup.exe</code> on a fresh Windows system, Microsoft Defender SmartScreen might display a notification stating <em>"Windows protected your PC"</em>.
            </p>
            <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-main)' }}>
              <strong>To continue:</strong> Click <strong>"More info"</strong> &rarr; then click <strong>"Run anyway"</strong>. This happens because the installer is distributed directly from the institutional GitHub repository.
            </div>
          </div>

          {/* Guide 2 */}
          <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 700, color: '#10b981' }}>
              📱 Android APK Installation Permission
            </h4>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-secondary, #475569)', lineHeight: '1.6' }}>
              When installing <code>seedit-widget.apk</code>, Chrome or your browser will request <em>"Install unknown apps"</em> permission.
            </p>
            <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-main)' }}>
              <strong>Steps:</strong> Tap <strong>Settings</strong> when prompted &rarr; toggle <strong>"Allow from this source"</strong> &rarr; tap <strong>Install</strong>. Once installed, long press your phone screen &rarr; Widgets &rarr; SEED-IT Tracker.
            </div>
          </div>

          {/* Guide 3 */}
          <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 700, color: '#8b5cf6' }}>
              🔒 Exam Lockdown Shortcuts
            </h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #475569)', lineHeight: '1.6' }}>
              During proctored assessments, SEED-SEB disables all secondary screens, screen capture tools, and task switching. Once the assessment is submitted or closed by proctor authorization, your normal desktop is restored instantly.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-secondary, #f8fafc)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Got it, close
          </button>
        </div>
      </div>
    </div>
  );
};

export const AuthenticityModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

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
          maxWidth: '640px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          color: 'var(--text-main, #0f172a)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981',
              }}
            >
              <FaShieldAlt />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>Verify Authenticity &amp; Integrity</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                Cryptographic checksums and official release provenance
              </span>
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
              padding: '4px',
            }}
          >
            <FaTimes />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <FaCheckCircle style={{ color: '#10b981', fontSize: '18px', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <h4 style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 700, color: '#166534' }}>
                Official SEED-IT Distribution
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#15803d', lineHeight: '1.5' }}>
                All application binaries are built directly from the official institutional repositories and signed for integrity.
              </p>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
              SEED Safe Exam Browser (Windows 64-bit)
            </label>
            <div style={{ background: 'var(--bg-secondary, #f8fafc)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', marginTop: '4px', fontSize: '11.5px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              <strong>Package:</strong> SEED-SEB-Setup.exe<br />
              <strong>Source:</strong> github.com/seeditDev/SEED-SEB-APP/releases<br />
              <strong>Architecture:</strong> x86_64 / amd64
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
              SEED-IT Mobile Activity Widget (Android Native)
            </label>
            <div style={{ background: 'var(--bg-secondary, #f8fafc)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', marginTop: '4px', fontSize: '11.5px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              <strong>Package:</strong> site.seedit.tracker.apk<br />
              <strong>Signature:</strong> Release Signed (v2 + v3 scheme)<br />
              <strong>Size:</strong> 34,014 bytes (~33.2 KB)
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-secondary, #f8fafc)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default {
  DocumentationModal,
  AuthenticityModal,
};
