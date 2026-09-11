import React, { useState, useEffect } from "react";
import { useNavigate } from './router-compat';
import DataService from '../services/dataService';
import TrackingService from '../services/trackingService';
import desktopBridge from '../utils/desktopBridge';
import { getStorageJson } from '../utils/storageUtils';
import { ROLES } from '../config/constants';
import { auth } from '../lib/firebase-config';
import '../styles/Login.css';

const DASHBOARD_PATHS = {
  student: "/student/dashboard",
  staff:   "/student/dashboard",
  admin:   "/admin/questions",
};

const Login = () => {
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'signup' | 'forgot'
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = getStorageJson("rememberedUser", null);
    if (saved?.email) {
      setEmail(saved.email);
    }

    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason") || sessionStorage.getItem("session_terminated_reason");
    if (reason === "simultaneous_login") {
      setError("Simultaneous login detected: Your account was signed in on another machine or browser. For exam security, your previous session was terminated.");
      sessionStorage.removeItem("session_terminated_reason");
    }
  }, []);

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const userData = await DataService.registerGlobalUser(fullName, email, password);
      localStorage.setItem("auth_data", JSON.stringify(userData));
      localStorage.setItem("role", ROLES.STUDENT || "student");

      try { desktopBridge.setStudentSession(userData); } catch (_) {}
      try { await TrackingService.startTracking(userData); } catch (_) {}

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate(DASHBOARD_PATHS.student);
      }, 1000);
    } catch (err) {
      if (err.code?.includes("email-already-in-use")) {
        setError("This email is already registered. Please sign in instead.");
      } else {
        setError(err.message || "Failed to create account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError("");
      const userData = await DataService.signInWithGoogle();
      const effectiveRole = userData.role || ROLES.STUDENT;
      localStorage.setItem("auth_data", JSON.stringify(userData));
      localStorage.setItem("role", effectiveRole);

      try { desktopBridge.setStudentSession(userData); } catch (_) {}
      try { await TrackingService.startTracking(userData); } catch (_) {}

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate(DASHBOARD_PATHS[effectiveRole] || DASHBOARD_PATHS.student);
      }, 800);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(err.message || "Google sign in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter your registered email address.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      await DataService.sendPasswordReset(email);
      setResetSuccess(true);
    } catch (err) {
      setError(err.message || "Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
      if (!userData) {
        setError("Invalid email or password. Please check your credentials.");
        return;
      }

      const effectiveRole = userData.role || ROLES.STUDENT;
      localStorage.setItem("auth_data", JSON.stringify(userData));
      localStorage.setItem("role", effectiveRole);
      if (rememberMe) {
        // SECURITY: store email only — never store the raw password in localStorage.
        // Firebase Auth persistence handles session resumption.
        localStorage.setItem("rememberedUser", JSON.stringify({ email: userData.email }));
      } else {
        localStorage.removeItem("rememberedUser");
      }

      // Inject the live ID token so the Python engine can make authenticated
      // Firestore REST calls. Token is RAM-only — not written to localStorage.
      let sessionPayload = userData;
      try {
        if (auth.currentUser) {
          const idToken = await auth.currentUser.getIdToken();
          sessionPayload = { ...userData, idToken };
        }
      } catch (_) {}
      try { desktopBridge.setStudentSession(sessionPayload); } catch (_) {}
      try { await TrackingService.startTracking(userData); } catch (_) {}

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate(DASHBOARD_PATHS[effectiveRole] || DASHBOARD_PATHS.student);
      }, 1200);
    } catch (err) {
      const code = err?.code ?? "";
      if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
        setError("Invalid email or password. Please try again.");
      } else if (code.includes("too-many-requests")) {
        setError("Too many failed attempts. Please wait a few minutes before trying again.");
      } else {
        setError("Authentication error: " + (err?.message || "Please check your network and try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoStudentLogin = () => {
    const demoUser = {
      uid: 'demo-student',
      name: 'Ambika (Demo Student)',
      email: 'ambika@demo.seed.edu',
      role: 'student',
      tenantId: 'seed-demo',
      tenant: { id: 'seed-demo', name: 'SEED Demo Institute' },
      isPremium: true
    };
    localStorage.setItem("auth_data", JSON.stringify(demoUser));
    localStorage.setItem("role", "student");
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      navigate("/student/dashboard");
    }, 400);
  };

  return (
    <div className="login-fullscreen-split">
      
      {/* ========================================================
           LEFT PANEL: SEED-SEB Architecture & Visual Showcase
           ======================================================== */}
      <section className="seb-left-panel">
        
        {/* Background Dot Grids & Rings */}
        <div className="seb-dot-grid seb-dot-grid-top-right">
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
        </div>

        <div className="seb-dot-grid seb-dot-grid-mid-left">
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
        </div>

        <div className="seb-bg-circle-dec seb-dec-circle-1"></div>
        <div className="seb-bg-circle-dec seb-dec-circle-2"></div>

        {/* Main Content Column */}
        <div className="seb-showcase-inner">
          
          {/* Logo & Brand Header */}
          <div className="seb-logo-badge">
            <img 
              src="/SEED_Logo_Transparent.png" 
              alt="SEED Logo" 
              onError={(e) => {
                e.target.src = '/SEED_Logo.png';
                e.target.onerror = null;
              }} 
            />
          </div>

          <h1 className="seb-brand-title">SEED<span>-SEB</span></h1>
          <div className="seb-brand-subtitle">Secure Examination &amp; Benchmarking</div>

          <div className="seb-hero-tagline">
            A secure and trusted environment<br />
            for <span>fair</span> and <span>seamless</span> assessments.
          </div>

          {/* 3D Laptop & Security Scene */}
          <div className="seb-laptop-scene-wrapper">
            
            {/* Floating Code Card (Left) */}
            <div className="seb-floating-code-card">
              <div className="seb-f-code-symbol">&lt;/&gt;</div>
              <div className="seb-f-code-line"></div>
              <div className="seb-f-code-line short"></div>
            </div>

            {/* Floating Lock Card (Right) */}
            <div className="seb-floating-lock-card">
              <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
            </div>

            {/* Laptop Frame */}
            <div className="seb-laptop-frame">
              <div className="seb-laptop-screen-bezel">
                <div className="seb-screen-dot-grid">
                  <span></span><span></span><span></span>
                  <span></span><span></span><span></span>
                  <span></span><span></span><span></span>
                </div>

                {/* Green 3D Shield Vector */}
                <svg className="seb-screen-shield-icon" viewBox="0 0 24 28" fill="none">
                  <path d="M12 1L3 5v8c0 7 9 14 9 14s9-7 9-14V5l-9-4z" fill="#008744"/>
                  <path d="M12 2.5L4.5 5.8v6.7c0 5.8 7.5 11.8 7.5 11.8s7.5-6 7.5-11.8V5.8L12 2.5z" fill="#00a854"/>
                  <path d="M9.5 12.5L11 14l4.5-4.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>

                <div className="seb-screen-env-title">Exam Environment</div>
                <div className="seb-screen-env-badge">
                  <span className="badge-dot"></span>
                  <span>Secure & Protected</span>
                </div>
              </div>

              <div className="seb-laptop-base">
                <div className="seb-laptop-base-notch"></div>
              </div>
            </div>

          </div>

          {/* Four Pill Feature Bar */}
          <div className="seb-feature-card-wrapper">
            
            <div className="seb-feature-col">
              <div className="seb-feat-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
              </div>
              <div className="seb-feat-heading">Secure</div>
              <div className="seb-feat-desc">Locked-down environment</div>
            </div>

            <div className="seb-feature-col">
              <div className="seb-feat-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
              </div>
              <div className="seb-feat-heading">Proctored</div>
              <div className="seb-feat-desc">Real-time monitoring</div>
            </div>

            <div className="seb-feature-col">
              <div className="seb-feat-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              </div>
              <div className="seb-feat-heading">Reliable</div>
              <div className="seb-feat-desc">Anti-cheating measures</div>
            </div>

            <div className="seb-feature-col">
              <div className="seb-feat-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
              </div>
              <div className="seb-feat-heading">Verified</div>
              <div className="seb-feat-desc">Accurate results & analytics</div>
            </div>

          </div>

          {/* Bottom Evaluation Status Pill */}
          <div className="seb-status-pill-card">
            <div className="seb-status-pill-icon">
              <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
            </div>
            <div className="seb-status-pill-text">
              <div className="seb-status-pill-title">Evaluation Engine Connected</div>
              <div className="seb-status-pill-sub">System Ready &nbsp;•&nbsp; 10/10 Test Cases Verified</div>
            </div>
          </div>

        </div>

      </section>

      {/* ========================================================
           RIGHT PANEL: Clean Student & Staff Sign In Form
           ======================================================== */}
      <section className="seb-right-panel">
        
        <div className="seb-form-container">
          
          <div className="seb-form-title-group">
            <h1 className="seb-form-main-heading">
              {authMode === 'signup' ? 'Create Free Account' : authMode === 'forgot' ? 'Reset Password' : 'SEED-IT Portal Sign In'}
            </h1>
            <p className="seb-form-main-subtitle">
              {authMode === 'signup'
                ? 'Join SEED-IT Global to access practice banks, free global contests, and interactive courses.'
                : authMode === 'forgot'
                ? 'Enter your registered email to receive a password reset link.'
                : 'Enter your credentials to access your student portal, exams, or staff dashboard.'}
            </p>
          </div>

          {/* Auth Mode Tabs (Sign In vs Create Account) */}
          {authMode !== 'forgot' && (
            <div style={{
              display: 'flex',
              background: '#f1f5f9',
              borderRadius: '12px',
              padding: '4px',
              marginBottom: '20px',
              gap: '4px'
            }}>
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setError(''); }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '9px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: authMode === 'login' ? '700' : '500',
                  color: authMode === 'login' ? '#0f172a' : '#64748b',
                  background: authMode === 'login' ? '#ffffff' : 'transparent',
                  boxShadow: authMode === 'login' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('signup'); setError(''); }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '9px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: authMode === 'signup' ? '700' : '500',
                  color: authMode === 'signup' ? '#0f172a' : '#64748b',
                  background: authMode === 'signup' ? '#ffffff' : 'transparent',
                  boxShadow: authMode === 'signup' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Google One-Click Sign In (for login & signup) */}
          {authMode !== 'forgot' && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  padding: '11px 16px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#1e293b',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  marginBottom: '16px'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Continue with Google
              </button>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                margin: '12px 0 18px 0',
                color: '#94a3b8',
                fontSize: '12px'
              }}>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                <span style={{ padding: '0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or with email</span>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              </div>
            </>
          )}

          {error && (
            <div className="seb-error-banner" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {resetSuccess && (
            <div className="seb-success-banner" role="status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <span>Password reset link sent! Please check your inbox.</span>
            </div>
          )}

          {showSuccess && (
            <div className="seb-success-banner" role="status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <span>{authMode === 'signup' ? 'Account created successfully! Preparing dashboard...' : 'Authentication successful! Launching portal...'}</span>
            </div>
          )}

          {/* SIGN IN FORM */}
          {authMode === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="seb-form-field-group">
                <label className="seb-field-title" htmlFor="loginEmailInput">Email or ID (Roll No. / Staff ID)</label>
                <div className="seb-field-input-box">
                  <span className="seb-field-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </span>
                  <input 
                    type="text" 
                    id="loginEmailInput" 
                    className="seb-custom-input" 
                    placeholder="Enter your email or ID" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="seb-form-field-group">
                <label className="seb-field-title" htmlFor="loginPasswordInput">Password</label>
                <div className="seb-field-input-box">
                  <span className="seb-field-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    id="loginPasswordInput" 
                    className="seb-custom-input" 
                    placeholder="Enter your password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button 
                    type="button" 
                    className="seb-field-eye-btn" 
                    onClick={() => setShowPassword(!showPassword)} 
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <div className="seb-form-meta-row">
                <label className="seb-remember-label-wrap">
                  <input 
                    type="checkbox" 
                    id="rememberMeCheck" 
                    className="seb-custom-checkbox" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember this session</span>
                </label>
                <a 
                  href="#forgot" 
                  className="seb-forgot-pwd-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setAuthMode('forgot');
                    setError('');
                  }}
                >
                  Forgot password?
                </a>
              </div>

              <button 
                type="submit" 
                className="seb-btn-sign-in"
                disabled={loading}
              >
                {loading ? "Verifying credentials..." : "Sign In"}
              </button>
            </form>
          )}

          {/* CREATE ACCOUNT FORM */}
          {authMode === 'signup' && (
            <form onSubmit={handleSignup}>
              <div className="seb-form-field-group">
                <label className="seb-field-title" htmlFor="signupNameInput">Full Name</label>
                <div className="seb-field-input-box">
                  <span className="seb-field-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </span>
                  <input 
                    type="text" 
                    id="signupNameInput" 
                    className="seb-custom-input" 
                    placeholder="Enter your full name" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="seb-form-field-group">
                <label className="seb-field-title" htmlFor="signupEmailInput">Email Address</label>
                <div className="seb-field-input-box">
                  <span className="seb-field-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </span>
                  <input 
                    type="email" 
                    id="signupEmailInput" 
                    className="seb-custom-input" 
                    placeholder="name@example.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="seb-form-field-group">
                <label className="seb-field-title" htmlFor="signupPasswordInput">Password (min. 6 characters)</label>
                <div className="seb-field-input-box">
                  <span className="seb-field-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    id="signupPasswordInput" 
                    className="seb-custom-input" 
                    placeholder="Create a secure password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button 
                    type="button" 
                    className="seb-field-eye-btn" 
                    onClick={() => setShowPassword(!showPassword)} 
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <div className="seb-form-field-group">
                <label className="seb-field-title" htmlFor="signupConfirmPasswordInput">Confirm Password</label>
                <div className="seb-field-input-box">
                  <span className="seb-field-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    id="signupConfirmPasswordInput" 
                    className="seb-custom-input" 
                    placeholder="Re-enter your password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="seb-btn-sign-in"
                disabled={loading}
                style={{ marginTop: '16px' }}
              >
                {loading ? "Creating your account..." : "Create Free Account"}
              </button>

              <p style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '12px' }}>
                Standard account gives you free access to foundational practice sheets, open contests, and full course outlines.
              </p>
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {authMode === 'forgot' && (
            <form onSubmit={handleForgotPassword}>
              <div className="seb-form-field-group">
                <label className="seb-field-title" htmlFor="forgotEmailInput">Registered Email Address</label>
                <div className="seb-field-input-box">
                  <span className="seb-field-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </span>
                  <input 
                    type="email" 
                    id="forgotEmailInput" 
                    className="seb-custom-input" 
                    placeholder="Enter your registered email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="seb-btn-sign-in"
                disabled={loading}
                style={{ marginTop: '16px' }}
              >
                {loading ? "Sending reset link..." : "Send Reset Link"}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setError(''); setResetSuccess(false); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#008744',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  &larr; Back to Sign In
                </button>
              </div>
            </form>
          )}

          {import.meta.env.DEV && authMode === 'login' && (
            <button 
              type="button"
              id="devQuickStudentLoginBtn"
              onClick={handleDemoStudentLogin}
              style={{
                marginTop: '16px',
                width: '100%',
                padding: '10px',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px dashed #6366f1',
                borderRadius: '8px',
                color: '#6366f1',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Quick Demo Student Access (Dev)
            </button>
          )}
        </div>

        {/* Copyright Footer */}
        <div className="seb-copyright-note">
          &copy; 2023 - 2026 SEED Innovating Technologies and Edu Services. All rights reserved.
        </div>

      </section>

    </div>
  );
};

export default Login;
