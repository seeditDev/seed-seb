import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Cookies from 'js-cookie';
import Login from "./components/Login";
import StudentDashboard from "./components/StudentDashboard";
import MCQPage from "./components/MCQPage";
import CodingAssessmentPage from "./components/CodingAssessmentPage";
import cacheManager from './utils/cacheManager';
import TrackingService from './services/trackingService';
import timeService from './services/timeService';
import PracticeSandbox from "./components/PracticeSandbox";
import MultiSectionAssessment from "./components/MultiSectionAssessment";
import { logPortalActivityTime } from './services/codingProgressService';

import desktopBridge from './utils/desktopBridge';

import "./styles/Login.css";  // Import global styles

// Get version from package.json
export const APP_VERSION = '1.0.4';

// Make cacheManager available globally for the logout process
window.cacheManager = cacheManager;

// Constants for version management
const VERSION_COOKIE_NAME = 'app_version';

// Version comparison utility
export const compareVersions = (v1, v2) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          maxWidth: '600px',
          margin: '0 auto',
          fontFamily: 'Arial, sans-serif'
        }}>
          <h1>Something went wrong</h1>
          <p>Please try refreshing the page. If the problem persists, please contact support.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              cursor: 'pointer',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const PortalActivityTracker = () => {
  const { useLocation } = require('react-router-dom');
  const location = useLocation();

  useEffect(() => {
    const authRaw = localStorage.getItem("auth_data");
    if (!authRaw) return;
    let authUser;
    try {
      authUser = JSON.parse(authRaw);
    } catch (_) {
      return;
    }
    const email = authUser?.Email || authUser?.email;
    if (!email) return;

    const path = location.pathname;
    const isAssessment =
      (path.startsWith('/student/coding/') && path !== '/student/coding') ||
      path.startsWith('/student/assessment/multisection/') ||
      (path.startsWith('/student/mcq/') && path !== '/student/mcq');

    if (isAssessment) {
      return;
    }

    logPortalActivityTime(email, 1).catch(err => console.warn('Activity tracking failed:', err));

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        logPortalActivityTime(email, 1).catch(err => console.warn('Activity tracking failed:', err));
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [location.pathname]);

  return null;
};

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState(null);
  const [isDesktopApp, setIsDesktopApp] = useState(true);

  useEffect(() => {
    const activeTheme = localStorage.getItem('portal_theme') || 'bw';
    document.documentElement.setAttribute('data-theme', activeTheme);
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const hostname = window.location.hostname;
    const isDev = hostname === 'localhost' || hostname === '127.0.0.1' || process.env.NODE_ENV === 'development';
    const isUAOk = ua.includes('SEEDSEB') || ua.includes('QtWebEngine') || ua.includes('QtWebKit') ||
      !!window.qt || !!window.desktopBackend || window.pyqtFlag === true ||
      typeof window.pyqtAppReady === 'function' ||
      (!ua.includes('Chrome') && !ua.includes('Firefox') && !ua.includes('Safari'));
    setIsDesktopApp(isUAOk || isDev);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;

    const safeSetState = (setter, value) => {
      if (isMounted) {
        try {
          setter(value);
        } catch (e) {
          console.warn('State update failed:', e);
        }
      }
    };

    const init = async () => {
      try {
        // Initialize cache system
        await cacheManager.initCacheSystem();

        // Initialize time service (fetch online IST)
        await timeService.init();

        // Check login status
        const loginStatus = !!(Cookies.get('user_session') || Cookies.get('user_token'));
        safeSetState(setIsLoggedIn, loginStatus);

        // Version handling - just update the cookie without verification
        const storedVersion = Cookies.get(VERSION_COOKIE_NAME);

        if (storedVersion !== APP_VERSION) {
          // Update stored version
          Cookies.set(VERSION_COOKIE_NAME, APP_VERSION, { expires: 365 });

          // Clear cache if version changed
          if (storedVersion) {
            const comparison = compareVersions(APP_VERSION, storedVersion);
            if (comparison !== 0) {
              await cacheManager.clearCacheOnVersionChange(storedVersion, APP_VERSION);
            }
          } else {
            await cacheManager.clearCacheOnVersionChange(null, APP_VERSION);
          }
        }
      } catch (err) {
        console.error('Initialization error:', err);
        safeSetState(setError, err.message);
      } finally {
        timeoutId = setTimeout(() => {
          safeSetState(setIsLoading, false);
        }, 100);
      }
    };

    init();

    // Start tracking if user is already logged in (e.g. refresh)
    const rawAuth = localStorage.getItem("auth_data");
    if (rawAuth) {
      try {
        const parsedAuth = JSON.parse(rawAuth);
        TrackingService.startTracking(parsedAuth);
        desktopBridge.setStudentSession(parsedAuth);
      } catch (e) {
        console.error("Failed to restart tracking on App mount:", e);
      }
    }

    // Handle session end on window close/refresh
    const handleUnload = () => {
      TrackingService.stopTracking();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      isMounted = false;
      window.removeEventListener('beforeunload', handleUnload);
      if (timeoutId) clearTimeout(timeoutId);
      try {
        cacheManager.clearMemoryCache();
      } catch (e) {
        console.warn('Cleanup error:', e);
      }
    };
  }, []);

  if (error) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        maxWidth: '600px',
        margin: '0 auto',
        fontFamily: 'Arial, sans-serif'
      }}>
        <h1>Something went wrong</h1>
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        backgroundColor: '#f4f6f9'
      }}>
        <div style={{ marginBottom: '20px' }}>
          <img
            src="https://i.ibb.co/xq80RrBW/SEED-Logo.webp"
            alt="SEED-IT Logo"
            style={{ width: '150px', height: 'auto' }}
          />
        </div>
        <p style={{
          color: '#666',
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif'
        }}>
          Loading... Please wait
        </p>
      </div>
    );
  }

  if (!isDesktopApp) {
    return (
      <div className="lock-screen-container" style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #090d16 0%, #1e1b4b 100%)',
        color: '#f8fafc',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        padding: '24px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '560px',
          width: '100%',
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '24px',
          padding: '40px',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '2px solid rgba(99, 102, 241, 0.2)',
            marginBottom: '28px',
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.25)'
          }}>
            <span style={{ fontSize: '36px' }}>🛡️</span>
          </div>

          <h1 style={{
            fontSize: '26px',
            fontWeight: '800',
            lineHeight: '1.3',
            color: '#ffffff',
            margin: '0 0 16px 0',
            letterSpacing: '-0.025em'
          }}>
            Install the SEED-SEB.exe to Explore the Platform
          </h1>

          <p style={{
            fontSize: '15px',
            lineHeight: '1.6',
            color: '#94a3b8',
            margin: '0 0 32px 0'
          }}>
            For security, academic integrity, and automated camera proctoring, this platform is strictly locked down and can only be accessed within the official <strong>SEED-SEB (Secure Exam Browser)</strong> desktop application.
          </p>

          <div style={{
            textAlign: 'left',
            backgroundColor: 'rgba(9, 15, 29, 0.65)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '32px',
            border: '1px solid rgba(255, 255, 255, 0.03)'
          }}>
            <h3 style={{
              fontSize: '14px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#818cf8',
              margin: '0 0 16px 0'
            }}>
              How to access:
            </h3>
            <ol style={{
              margin: 0,
              paddingLeft: '20px',
              fontSize: '14px',
              color: '#cbd5e1',
              lineHeight: '1.8'
            }}>
              <li style={{ marginBottom: '8px' }}>
                Download the official <strong>SEED-SEB-Setup.exe</strong> installer provided by your university/administrator.
              </li>
              <li style={{ marginBottom: '8px' }}>
                Run the installer and complete the setup on your Windows device.
              </li>
              <li>
                Launch <strong>SEED-SEB</strong> from your desktop. It will automatically load the platform inside a secure sandbox environment.
              </li>
            </ol>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <a
              href="https://seedit-portal.vercel.app/download"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#6366f1',
                color: '#ffffff',
                textDecoration: 'none',
                padding: '14px 28px',
                fontSize: '15px',
                fontWeight: '700',
                borderRadius: '12px',
                transition: 'background-color 0.2s',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6366f1'}
            >
              📥 Download SEED-SEB Installer
            </a>
            <div style={{
              fontSize: '12px',
              color: '#64748b',
              marginTop: '8px'
            }}>
              Running version v{APP_VERSION} | Protected by SEED-IT Sandbox Security
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PortalActivityTracker />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/home" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/mcq" element={<MCQPage />} />
          <Route path="/student/mcq/:testSlug" element={<MCQPage />} />
          <Route path="/student/coding" element={<CodingAssessmentPage />} />
          <Route path="/student/coding/:assessmentSlug" element={<CodingAssessmentPage />} />
          <Route path="/student/practice/solve/:questionId" element={<PracticeSandbox />} />
          <Route path="/student/assessment/multisection/:assessmentSlug" element={<MultiSectionAssessment />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
