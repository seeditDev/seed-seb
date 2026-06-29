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

import desktopBridge from './utils/desktopBridge';

import "./styles/Login.css";  // Import global styles

// Get version from package.json
export const APP_VERSION = '1.0.1';

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

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState(null);

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

  return (
    <ErrorBoundary>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/home" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/mcq" element={<MCQPage />} />
          <Route path="/student/mcq/:testSlug" element={<MCQPage />} />
          <Route path="/student/coding" element={<CodingAssessmentPage />} />
          <Route path="/student/coding/:assessmentSlug" element={<CodingAssessmentPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
