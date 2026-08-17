import React, { useState, useEffect } from "react";
import { useNavigate } from '../router-compat';
import DataService from "../services/dataService";
import TrackingService from "../services/trackingService";
import desktopBridge from "../utils/desktopBridge";
import { getStorageJson } from "../utils/storageUtils";
import { ROLES } from "../config/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Exact V1.0 space-themed glassmorphic login — CSS classes match Login.css
// ─────────────────────────────────────────────────────────────────────────────

const DASHBOARD_PATHS = {
  student: "/student/dashboard",
  staff:   "/student/dashboard",
  admin:   "/admin/questions",
};

const Login = () => {
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [error,        setError]        = useState("");
  const [showSuccess,  setShowSuccess]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = getStorageJson("rememberedUser", null);
    if (saved) {
      setEmail(saved.email || "");
      setPassword(saved.password || "");
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const userData = await DataService.validateCredentials(email.trim(), password);
      if (!userData) { setError("Invalid email or password. Please try again."); return; }

      const effectiveRole = userData.role || ROLES.STUDENT;
      localStorage.setItem("auth_data",       JSON.stringify(userData));
      localStorage.setItem("role",            effectiveRole);
      localStorage.setItem("rememberedUser",  JSON.stringify({ email: userData.email, password }));

      try { desktopBridge.setStudentSession(userData); } catch (_) {}
      try { await TrackingService.startTracking(userData); } catch (_) {}

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate(DASHBOARD_PATHS[effectiveRole] || DASHBOARD_PATHS.student);
      }, 1800);
    } catch (err) {
      const code = err?.code || "";
      if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
        setError("Invalid email or password.");
      } else if (code.includes("too-many-requests")) {
        setError("Too many failed attempts. Please try again later.");
      } else if (code.includes("network-request-failed")) {
        setError("Network error. Check your internet connection.");
      } else {
        setError(err.message || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">

      {/* ── Exact V1.0 CSS variables (dark theme) injected inline ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');

        /* Dark theme CSS variables */
        :root {
          --bg-primary:        #09090c;
          --bg-secondary:      #1f1b38;
          --text-main:         #f1f5f9;
          --text-muted:        #6b7280;
          --border-color:      rgba(255,255,255,0.08);
          --login-card-bg:     rgba(255,255,255,0.03);
          --login-input-bg:    rgba(255,255,255,0.05);
          --login-input-border:rgba(255,255,255,0.08);
          --login-text-color:  #f1f5f9;
          --login-title-color: #f8fafc;
          --shadow-color:      rgba(0,0,0,0.4);
          --accent-coding:     rgba(124,58,237,0.5);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .login-page {
          position: relative;
          display: flex;
          min-height: 100vh;
          width: 100vw;
          background: radial-gradient(circle at 10% 20%, var(--bg-secondary) 0%, var(--bg-primary) 90%);
          overflow: hidden;
          z-index: 1;
          font-family: 'Poppins', sans-serif;
        }
        .login-page::before {
          content: '';
          position: absolute; top: -10%; left: -10%;
          width: 50%; height: 50%;
          background: radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%);
          filter: blur(80px); z-index: -2; pointer-events: none;
        }
        .login-page::after {
          content: '';
          position: absolute; bottom: -10%; right: -10%;
          width: 60%; height: 60%;
          background: radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%);
          filter: blur(80px); z-index: -2; pointer-events: none;
        }

        /* 3D Perspective Grid */
        .perspective-grid {
          position: absolute; bottom: -150px; left: -50%;
          width: 200%; height: 500px;
          background-image:
            linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px);
          background-size: 50px 50px;
          transform: perspective(600px) rotateX(75deg);
          transform-origin: bottom center;
          mask-image: linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0));
          z-index: -1; pointer-events: none;
        }

        /* Floating Chips */
        .floating-chip {
          position: absolute; padding: 0.8rem 1.2rem;
          background: var(--login-card-bg);
          backdrop-filter: blur(12px) saturate(180%);
          border: 1px solid var(--login-input-border);
          border-radius: 20px; color: var(--login-text-color);
          font-size: 0.9rem; font-weight: 600;
          display: flex; align-items: center; gap: 0.6rem;
          box-shadow: 0 10px 25px var(--shadow-color);
          pointer-events: none; z-index: 0; user-select: none;
        }
        .floating-chip span.chip-logo { font-size: 1.2rem; filter: drop-shadow(0 0 5px currentColor); }

        .chip-python   { top:15%;left:45%;animation:float-py 8s ease-in-out infinite;box-shadow:0 10px 30px rgba(59,130,246,0.2);border-color:rgba(59,130,246,0.3); }
        .chip-java     { bottom:25%;left:40%;animation:float-java 9s ease-in-out infinite;box-shadow:0 10px 30px rgba(239,68,68,0.2);border-color:rgba(239,68,68,0.3); }
        .chip-cpp      { top:30%;left:5%;animation:float-cpp 10s ease-in-out infinite;box-shadow:0 10px 30px rgba(16,185,129,0.2);border-color:rgba(16,185,129,0.3); }
        .chip-rust     { bottom:12%;left:8%;animation:float-rust 7s ease-in-out infinite;box-shadow:0 10px 30px rgba(245,158,11,0.2);border-color:rgba(245,158,11,0.3); }
        .chip-google   { top:50%;left:43%;animation:float-goog 11s ease-in-out infinite;box-shadow:0 8px 25px rgba(255,255,255,0.1); }
        .chip-microsoft{ top:8%;left:8%;animation:float-ms 7.5s ease-in-out infinite;box-shadow:0 8px 25px rgba(59,130,246,0.15); }
        .chip-meta     { bottom:45%;left:3%;animation:float-meta 9.5s ease-in-out infinite;box-shadow:0 8px 25px rgba(124,58,237,0.15); }

        @keyframes float-py   { 0%,100%{transform:translate3d(0,0,0) rotate(0deg)} 50%{transform:translate3d(-10px,-20px,0) rotate(5deg)} }
        @keyframes float-java { 0%,100%{transform:translate3d(0,0,0) rotate(0deg)} 50%{transform:translate3d(15px,-15px,0) rotate(-4deg)} }
        @keyframes float-cpp  { 0%,100%{transform:translate3d(0,0,0) rotate(0deg)} 50%{transform:translate3d(-15px,15px,0) rotate(6deg)} }
        @keyframes float-rust { 0%,100%{transform:translate3d(0,0,0) rotate(0deg)} 50%{transform:translate3d(10px,-10px,0) rotate(-5deg)} }
        @keyframes float-goog { 0%,100%{transform:translate3d(0,0,0) rotate(0deg)} 50%{transform:translate3d(-5px,-25px,0) rotate(3deg)} }
        @keyframes float-ms   { 0%,100%{transform:translate3d(0,0,0) rotate(0deg)} 50%{transform:translate3d(8px,12px,0) rotate(-3deg)} }
        @keyframes float-meta { 0%,100%{transform:translate3d(0,0,0) rotate(0deg)} 50%{transform:translate3d(-12px,-8px,0) rotate(4deg)} }
        @keyframes spin-cube  { 0%{transform:rotate(45deg) translate3d(0,0,0)} 50%{transform:rotate(225deg) translate3d(5px,-10px,0)} 100%{transform:rotate(405deg) translate3d(0,0,0)} }
        @keyframes float-sphere{ 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(15px,-20px,0)} }
        @keyframes float-trophy{ 0%,100%{transform:translateY(0) rotate(-12deg)} 50%{transform:translateY(-15px) rotate(-8deg)} }
        @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
        @keyframes scaleIn    { from{transform:scale(0.9);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes shake      { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }

        /* Geometric decorations */
        .geometric-cube {
          position:absolute;top:25%;left:38%;width:50px;height:50px;
          background:linear-gradient(135deg,rgba(139,92,246,0.6) 0%,rgba(99,102,241,0.1) 100%);
          border:1px solid rgba(139,92,246,0.4);border-radius:12px;
          transform:rotate(45deg);box-shadow:0 0 30px rgba(139,92,246,0.3);
          animation:spin-cube 12s linear infinite;z-index:-1;
        }
        .geometric-sphere {
          position:absolute;top:55%;left:28%;width:30px;height:30px;
          background:radial-gradient(circle at 30% 30%,#a78bfa,#4c1d95);
          border-radius:50%;box-shadow:0 0 20px rgba(167,139,250,0.5);
          animation:float-sphere 8s ease-in-out infinite;z-index:-1;
        }
        .geometric-trophy {
          position:absolute;bottom:15%;left:28%;width:140px;height:140px;
          opacity:0.15;filter:drop-shadow(0 0 20px #7c3aed);
          animation:float-trophy 6s ease-in-out infinite;pointer-events:none;z-index:-1;
        }

        /* Left panel */
        .background-section {
          flex:1.1;display:flex;flex-direction:column;justify-content:center;
          padding:4rem;position:relative;z-index:2;
        }
        .background-content { max-width:580px;margin:0 auto; }
        .background-logo {
          font-size:2.2rem;font-weight:700;color:var(--text-main);letter-spacing:1px;
          display:flex;align-items:center;gap:0.4rem;margin-bottom:2.5rem;
        }
        .background-logo span {
          width:10px;height:10px;background-color:#10b981;border-radius:50%;
          box-shadow:0 0 15px #10b981;display:inline-block;
        }
        .platform-pill {
          display:inline-block;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);
          color:#c084fc;padding:0.35rem 0.8rem;border-radius:20px;font-size:0.75rem;
          font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:1.2rem;
        }
        .background-content h2 { font-size:2.8rem;font-weight:700;line-height:1.2;margin-bottom:0.8rem;color:var(--text-main); }
        .background-content h2 span.gradient-text { background:linear-gradient(to right,#60a5fa,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent; }
        .welcome-subtitle { font-size:1.05rem;color:var(--text-muted);margin-bottom:2.5rem;line-height:1.5; }

        /* Feature Cards */
        .background-features { display:flex;flex-direction:column;gap:1.2rem;width:100%; }
        .feature-item {
          display:flex;align-items:center;gap:1.2rem;padding:1.2rem 1.5rem;
          background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);
          border-radius:16px;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);position:relative;overflow:hidden;
        }
        .feature-item::before {
          content:'';position:absolute;top:0;left:0;width:100%;height:100%;
          background:linear-gradient(90deg,rgba(255,255,255,0.02),transparent);
          transform:translateX(-100%);transition:transform 0.5s ease;
        }
        .feature-item:hover::before { transform:translateX(100%); }
        .feature-item:hover { background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.1);transform:translateY(-3px); }
        .feature-icon-wrapper { display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;font-size:1.2rem;flex-shrink:0; }
        .icon-blue   { background:rgba(59,130,246,0.15);color:#60a5fa; }
        .icon-purple { background:rgba(139,92,246,0.15);color:#c084fc; }
        .icon-green  { background:rgba(16,185,129,0.15);color:#34d399; }
        .feature-text-block { flex:1; }
        .feature-text-block h3 { font-size:1rem;font-weight:600;color:var(--text-main);margin-bottom:0.2rem; }
        .feature-text-block p  { font-size:0.85rem;color:var(--text-muted);line-height:1.4; }
        .feature-arrow { color:#6b7280;font-size:0.9rem;transition:all 0.3s ease; }
        .feature-item:hover .feature-arrow { color:#fff;transform:translateX(4px); }

        /* Quote Card */
        .quote-card {
          margin-top:1.8rem;background:rgba(124,58,237,0.05);border:1px dashed rgba(124,58,237,0.2);
          border-radius:16px;padding:1.2rem 1.5rem;display:flex;gap:1rem;
        }
        .quote-icon { color:rgba(192,132,252,0.4);font-size:1.3rem;flex-shrink:0; }
        .quote-card p { font-size:0.85rem;font-style:italic;color:var(--text-muted);line-height:1.5; }

        /* Security badges */
        .security-badges { display:flex;align-items:center;gap:0.6rem;margin-top:2rem;color:var(--text-muted);font-size:0.8rem; }
        .badge-icon { color:#10b981; }
        .copyright-text { font-size:0.75rem;color:var(--text-muted);margin-top:0.8rem; }

        /* Right panel */
        .form-section {
          flex:0.9;display:flex;flex-direction:column;justify-content:center;
          align-items:center;padding:2rem;position:relative;z-index:2;
        }
        .login-glass-card {
          width:100%;max-width:440px;
          background:var(--login-card-bg);
          backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);
          border:1px solid var(--login-input-border);border-radius:28px;padding:2.5rem;
          box-shadow:0 30px 60px var(--shadow-color),inset 0 1px 0 rgba(255,255,255,0.1);
          display:flex;flex-direction:column;align-items:center;position:relative;
        }
        .avatar-wrapper {
          width:76px;height:76px;border-radius:50%;
          background:linear-gradient(135deg,#3b82f6 0%,#7c3aed 100%);
          box-shadow:0 0 25px rgba(124,58,237,0.5);
          display:flex;align-items:center;justify-content:center;
          font-size:2.2rem;font-weight:700;color:#fff;margin-bottom:1.5rem;
          border:2px solid rgba(255,255,255,0.2);
        }
        .login-glass-card h1 { font-size:1.6rem;font-weight:700;color:var(--login-title-color);text-align:center;margin-bottom:0.3rem; }
        .login-glass-card p.subtitle { font-size:0.9rem;color:var(--text-muted);text-align:center;margin-bottom:2rem; }

        /* Form controls */
        .login-form-wrapper { width:100%;display:flex;flex-direction:column; }
        .input-group { margin-bottom:1.2rem;position:relative;width:100%; }
        .input-with-icon { position:relative;width:100%; }
        .input-icon { position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:0.95rem; }
        .input-group input {
          width:100%;padding:0.85rem 1rem 0.85rem 40px;
          background:var(--login-input-bg);border:1px solid var(--login-input-border);
          border-radius:12px;color:var(--login-text-color);font-size:0.95rem;
          transition:all 0.3s ease;font-family:'Poppins',sans-serif;outline:none;
        }
        .input-group input::placeholder { color:var(--text-muted); }
        .input-group input:focus { border-color:var(--accent-coding);box-shadow:0 0 15px var(--accent-coding); }
        .eye-toggle {
          position:absolute;right:12px;top:50%;transform:translateY(-50%);
          background:none;border:none;cursor:pointer;color:#9ca3af;font-size:1rem;
          display:flex;align-items:center;padding:0;
        }

        /* Login button */
        .login-button {
          width:100%;padding:0.9rem;background:linear-gradient(135deg,#3b82f6 0%,#7c3aed 100%);
          color:#fff;border:none;border-radius:12px;font-size:1rem;font-weight:600;
          cursor:pointer;transition:all 0.3s ease;display:flex;align-items:center;
          justify-content:center;gap:0.5rem;box-shadow:0 4px 20px rgba(124,58,237,0.3);
          font-family:'Poppins',sans-serif;
        }
        .login-button:hover:not(:disabled) { transform:translateY(-2px);box-shadow:0 6px 25px rgba(124,58,237,0.4); }
        .login-button:disabled { background:#27273a;color:#6b7280;box-shadow:none;cursor:not-allowed; }

        /* Divider */
        .divider { display:flex;align-items:center;width:100%;margin:1.8rem 0;color:#6b7280;font-size:0.8rem; }
        .divider::before,.divider::after { content:'';flex:1;height:1px;background:var(--login-input-border); }
        .divider span { padding:0 10px; }

        /* Guest button (social-btn style) */
        .guest-access-btn {
          width:100%;background:var(--login-input-bg);border:1px solid var(--login-input-border);
          border-radius:12px;padding:0.7rem 0.5rem;color:var(--login-text-color);
          font-size:0.9rem;font-weight:500;display:flex;align-items:center;
          justify-content:center;gap:0.5rem;cursor:pointer;transition:all 0.3s ease;
          font-family:'Poppins',sans-serif;
        }
        .guest-access-btn:hover { border-color:var(--accent-coding);color:var(--login-title-color); }

        /* Error */
        .error {
          color:#ef4444;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);
          border-radius:8px;font-size:0.85rem;padding:0.6rem 1rem;text-align:center;
          margin-top:1rem;width:100%;animation:shake 0.4s linear;
        }

        /* Success modal */
        .modal-overlay {
          position:fixed;top:0;left:0;width:100vw;height:100vh;
          background:rgba(5,5,10,0.8);backdrop-filter:blur(8px);
          display:flex;justify-content:center;align-items:center;z-index:2000;animation:fadeIn 0.3s ease;
        }
        .success-modal {
          background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:24px;
          padding:2.5rem;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,0.5);
          max-width:320px;width:90%;animation:scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1);
        }
        .success-icon { font-size:3.5rem;color:#10b981;margin-bottom:1.2rem;filter:drop-shadow(0 0 10px rgba(16,185,129,0.4)); }
        .success-modal p:first-of-type { font-size:1.2rem;font-weight:600;color:var(--text-main);margin-bottom:0.4rem; }
        .redirect-text { font-size:0.85rem;color:var(--text-muted); }

        /* Spin */
        @keyframes spin-icon { to { transform: rotate(360deg); } }
        .spin-icon { display:inline-block;animation:spin-icon 0.8s linear infinite; }

        /* Responsive */
        @media (max-width: 992px) {
          .background-section { display:none; }
          .chip-python { left:80%;top:12%; } .chip-java { left:10%;bottom:8%; }
          .chip-cpp { left:5%;top:15%; } .chip-rust { left:75%;bottom:10%; }
          .form-section { flex:1;width:100%;max-width:480px;padding:1.5rem; }
        }
        @media (max-width: 480px) {
          .login-glass-card { border:none;background:transparent;box-shadow:none;backdrop-filter:none;padding:1rem 0.5rem; }
          .floating-chip { display:none; }
        }
      `}</style>

      {/* ── Perspective grid ── */}
      <div className="perspective-grid" />

      {/* ── Floating tech chips ── */}
      <div className="floating-chip chip-python">
        <span className="chip-logo">🐍</span> Python
      </div>
      <div className="floating-chip chip-java">
        <span className="chip-logo">☕</span> Java
      </div>
      <div className="floating-chip chip-cpp">
        <span className="chip-logo">⚡</span> C++
      </div>
      <div className="floating-chip chip-rust">
        <span className="chip-logo">🦀</span> Rust
      </div>
      <div className="floating-chip chip-google">
        <span className="chip-logo">🔵</span> Google
      </div>
      <div className="floating-chip chip-microsoft">
        <span className="chip-logo">🟦</span> Microsoft
      </div>
      <div className="floating-chip chip-meta">
        <span className="chip-logo">🔷</span> Meta
      </div>

      {/* ── Geometric decorations ── */}
      <div className="geometric-cube" />
      <div className="geometric-sphere" />
      <svg className="geometric-trophy" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
        <path d="M12 2a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6Z" />
      </svg>

      {/* ── Success Modal ── */}
      {showSuccess && (
        <div className="modal-overlay">
          <div className="success-modal">
            <div className="success-icon">✅</div>
            <p>Welcome back!</p>
            <p className="redirect-text">Redirecting to your dashboard…</p>
          </div>
        </div>
      )}

      {/* ══════════════════════ LEFT PANEL ══════════════════════ */}
      <div className="background-section">
        <div className="background-content">
          <div className="background-logo">
            SEED <span />
          </div>

          <div className="platform-pill">SEED · SEB Platform</div>

          <h2>
            Welcome back to{" "}
            <span className="gradient-text">SEED</span>
          </h2>
          <p className="welcome-subtitle">
            Where every login brings you closer to your goals.
          </p>

          <div className="background-features">
            <div className="feature-item">
              <div className="feature-icon-wrapper icon-blue">📚</div>
              <div className="feature-text-block">
                <h3>Learn</h3>
                <p>Access curated resources and enhance your knowledge.</p>
              </div>
              <span className="feature-arrow">→</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrapper icon-purple">🏆</div>
              <div className="feature-text-block">
                <h3>Practice</h3>
                <p>Solve problems, test yourself and improve every day.</p>
              </div>
              <span className="feature-arrow">→</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrapper icon-green">📊</div>
              <div className="feature-text-block">
                <h3>Assess</h3>
                <p>Take assessments, participate in contests and track progress.</p>
              </div>
              <span className="feature-arrow">→</span>
            </div>
          </div>

          <div className="quote-card">
            <span className="quote-icon">❝</span>
            <p>Empower yourself with the tools, knowledge, and opportunities to succeed.</p>
          </div>

          <div className="security-badges">
            <span className="badge-icon">🛡️</span> Secure &nbsp;·&nbsp;
            <span className="badge-icon">⚡</span> Reliable &nbsp;·&nbsp;
            <span className="badge-icon">✅</span> Trusted
          </div>
          <p className="copyright-text">© 2026 SEED-SEB. All rights reserved.</p>
        </div>
      </div>

      {/* ══════════════════════ RIGHT PANEL ══════════════════════ */}
      <div className="form-section">
        <div className="login-glass-card">

          <div className="avatar-wrapper">S</div>
          <h1>Welcome back!</h1>
          <p className="subtitle">Login to your account</p>

          <form className="login-form-wrapper" onSubmit={handleLogin} autoComplete="on">
            {/* Email */}
            <div className="input-group">
              <div className="input-with-icon">
                <span className="input-icon">✉️</span>
                <input
                  id="seb-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@college.edu"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="input-group">
              <div className="input-with-icon">
                <span className="input-icon">🔒</span>
                <input
                  id="seb-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  style={{ paddingRight: '2.75rem' }}
                  required
                />
                <button
                  type="button"
                  className="eye-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(p => !p)}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="seb-login-btn"
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading
                ? <><span className="spin-icon">⏳</span> Logging in…</>
                : <>Login →</>
              }
            </button>

            {/* Error */}
            {error && <div className="error" role="alert">{error}</div>}
          </form>

          {/* Divider */}
          <div className="divider"><span>or</span></div>

          {/* Guest Access */}
          <button
            id="seb-guest-btn"
            type="button"
            className="guest-access-btn"
            onClick={() => navigate('/guest')}
          >
            🔓 Guest Access — Take Assessment with Code
          </button>

        </div>
      </div>
    </div>
  );
};

export default Login;
