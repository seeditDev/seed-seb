/**
 * Client-side application shell, ported from the original CRA `App.js`.
 * Owns cache/time-service bootstrap, session tracking, the desktop-only gate
 * and the top-level error boundary. Routing itself lives in src/routes.
 */
import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";

import cacheManager from "./utils/cacheManager";
import TrackingService from "./services/trackingService";
import timeService from "./services/timeService";
import desktopBridge from "./utils/desktopBridge";
import { logPortalActivityTime } from "./services/codingProgressService";
import { useLocation, useNavigate } from "./router-compat";
import { auth, onAuthStateChanged } from "./firebase-config";
import ProctorService from "./services/proctorService";

import "./index.css";
import "./styles/Login.css";

export const APP_VERSION = "1.0.4";

const VERSION_COOKIE_NAME = "app_version";

export const compareVersions = (v1, v2) => {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error:", error);
    console.error("Error Info:", errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="seb-fallback">
          <h1>Something went wrong</h1>
          <p>Please refresh the page. If the problem persists, contact support.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PortalActivityTracker() {
  const location = useLocation();

  useEffect(() => {
    const authRaw = localStorage.getItem("auth_data");
    if (!authRaw) return;
    let authUser;
    try {
      authUser = JSON.parse(authRaw);
    } catch {
      return;
    }
    const email = authUser?.Email || authUser?.email;
    if (!email) return;

    const path = location.pathname;
    const isAssessment =
      (path.startsWith("/student/coding/") && path !== "/student/coding") ||
      path.startsWith("/student/assessment/multisection/") ||
      (path.startsWith("/student/mcq/") && path !== "/student/mcq");

    if (isAssessment) return;

    logPortalActivityTime(email, 1).catch((err) =>
      console.warn("Activity tracking failed:", err),
    );

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        logPortalActivityTime(email, 1).catch((err) =>
          console.warn("Activity tracking failed:", err),
        );
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [location.pathname]);

  return null;
}

const RESIZE_OBSERVER_ERROR_MSGS = [
  "ResizeObserver loop completed with undelivered notifications.",
  "ResizeObserver loop limit exceeded",
];

export default function AppShell({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDesktopApp, setIsDesktopApp] = useState(true);

  useEffect(() => {
    const activeTheme = localStorage.getItem("portal_theme") || "bw";
    document.documentElement.setAttribute("data-theme", activeTheme);

    const onError = (e) => {
      if (
        RESIZE_OBSERVER_ERROR_MSGS.includes(e.message) ||
        e.message?.includes("ResizeObserver")
      ) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const hostname = window.location.hostname;
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const hasWebBypass = localStorage.getItem("web_access_bypass") === "true" || urlParams?.get("bypass") === "true" || urlParams?.get("mode") === "web";
    const isDev =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".lovable.app") ||
      hostname.endsWith(".vercel.app") ||
      hostname.endsWith(".pages.dev") ||
      hostname.includes("seedit.site") ||
      import.meta.env.DEV;
    const isUAOk =
      ua.includes("SEEDSEB") ||
      ua.includes("QtWebEngine") ||
      ua.includes("QtWebKit") ||
      !!window.qt ||
      !!window.desktopBackend ||
      window.pyqtFlag === true;
    setIsDesktopApp(isUAOk || isDev || hasWebBypass);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;

    const safeSet = (setter, value) => {
      if (isMounted) setter(value);
    };

    const init = async () => {
      try {
        window.cacheManager = cacheManager;
        await cacheManager.initCacheSystem();
        await timeService.init();

        const storedVersion = Cookies.get(VERSION_COOKIE_NAME);
        if (storedVersion !== APP_VERSION) {
          Cookies.set(VERSION_COOKIE_NAME, APP_VERSION, { expires: 365 });
          if (storedVersion) {
            if (compareVersions(APP_VERSION, storedVersion) !== 0) {
              await cacheManager.clearCacheOnVersionChange(storedVersion, APP_VERSION);
            }
          } else {
            await cacheManager.clearCacheOnVersionChange(null, APP_VERSION);
          }
        }
      } catch (err) {
        console.error("Initialization error:", err);
        safeSet(setError, err.message);
      } finally {
        timeoutId = setTimeout(() => safeSet(setIsLoading, false), 100);
      }
    };

    init();

    // ── Validate Firebase Auth state before consuming any localStorage cache ──
    // Do NOT read auth_data from localStorage as authoritative until Firebase
    // confirms the same UID is still authenticated. Stale cache from a previous
    // student session must not be used.
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        // No authenticated Firebase user — clear any stale local data
        const staleRaw = localStorage.getItem("auth_data");
        if (staleRaw) {
          console.warn("[AppShell] Firebase Auth has no active user but auth_data exists in localStorage. Clearing stale session.");
          clearAllStudentLocalData();
        }
        return;
      }

      // Firebase user is present — verify UID matches localStorage cache
      const rawAuth = localStorage.getItem("auth_data");
      if (rawAuth) {
        try {
          const parsedAuth = JSON.parse(rawAuth);
          if (parsedAuth.uid && parsedAuth.uid !== firebaseUser.uid) {
            console.warn("[AppShell] auth_data UID mismatch (cached:", parsedAuth.uid, "/ Firebase:", firebaseUser.uid, "). Clearing stale session.");
            clearAllStudentLocalData();
            return;
          }
          // UID matches — safe to restart tracking
          TrackingService.startTracking(parsedAuth);
          desktopBridge.setStudentSession(parsedAuth);
        } catch (e) {
          console.error("[AppShell] Failed to restart tracking on mount:", e);
          localStorage.removeItem("auth_data");
        }
      }
    });

    return () => {
      unsubscribeAuth();
    };

    const handleUnload = () => TrackingService.stopTracking();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      isMounted = false;
      window.removeEventListener("beforeunload", handleUnload);
      if (timeoutId) clearTimeout(timeoutId);
      try {
        cacheManager.clearMemoryCache();
      } catch (e) {
        console.warn("Cleanup error:", e);
      }
    };
  }, []);

  /** Clear all localStorage keys that belong to the active student session. */
  function clearAllStudentLocalData() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Remove session-scoped keys
      if (
        key === 'auth_data' ||
        key === 'rememberedUser' ||
        key.startsWith('msaProgress_') ||
        key.startsWith('msaActiveAssessment_') ||
        key === 'codingAssessmentData' ||
        key === 'codingAssessmentStartTime' ||
        key === 'codingAssessmentTimer' ||
        key === 'codingLastActiveTime' ||
        key.startsWith('proctor_offline_') ||
        key.startsWith('proctor_snapshots_offline_') ||
        key.startsWith('seed_submission_envelope_')
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    console.log('[AppShell] Cleared', keysToRemove.length, 'student session keys from localStorage.');
  }

  const handleEnableWebAccess = () => {
    localStorage.setItem("web_access_bypass", "true");
    setIsDesktopApp(true);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  if (error) {
    return (
      <div className="seb-fallback">
        <h1>Something went wrong</h1>
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return <AppShellLoading />;
  }

  if (!isDesktopApp) {
    return <DesktopOnlyNotice onEnableWebAccess={handleEnableWebAccess} />;
  }

  return (
    <ErrorBoundary>
      <PortalActivityTracker />
      {children}
    </ErrorBoundary>
  );
}

export function AppShellLoading() {
  return (
    <div className="seb-boot">
      <div className="seb-boot__brand">
        <div className="seb-boot__spinner-ring"></div>
        <div className="seb-boot__logo-wrapper">
          <img src="/SEED_Logo.png" alt="SEED-IT Platform" className="seb-boot__logo" />
        </div>
      </div>
      <div className="seb-boot__title">SEED-IT Exam Platform</div>
      <div className="seb-boot__status">
        <span className="seb-boot__dot"></span>
        <span>Initializing Security Sandbox...</span>
      </div>
      <div className="seb-boot__progress-bar">
        <div className="seb-boot__progress-fill"></div>
      </div>
    </div>
  );
}

function DesktopOnlyNotice({ onEnableWebAccess }) {
  return (
    <div className="seb-lock">
      <div className="seb-lock__container">
        <div className="seb-lock__header">
          <div className="seb-lock__brand-row">
            <img src="/SEED_Logo.png" alt="SEED-IT" className="seb-lock__logo" />
          </div>
          <div className="seb-lock__badge">
            SEED-IT Academic & Assessment Security Portal
          </div>
          <h1 className="seb-lock__title">SEED-SEB Secure Exam Environment</h1>
          <p className="seb-lock__subtitle">
            Welcome to the SEED-IT Assessment Platform. Proctored exams run securely inside the SEED-SEB desktop application. You can also launch the Web Edition below to practice and manage assessments.
          </p>
        </div>

        <div className="seb-lock__card">
          <div className="seb-lock__actions">
            <button
              className="seb-btn seb-btn--primary"
              onClick={() => window.open("https://www.seedit.site", "_blank")}
            >
              Go to Web Portal
            </button>
            <a
              className="seb-btn seb-btn--secondary"
              href="https://github.com/seeditDev/SEED-SEB-APP/releases/tag/SEED-SEB-APP"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download SEED-SEB (.exe)
            </a>
          </div>

          <div className="seb-lock__grid">
            <div className="seb-lock__feature">
              <span className="seb-lock__feature-icon"><img src="/video-camera.png" alt="AI Camera Proctoring" /></span>
              <h4>AI Camera Proctoring</h4>
              <p>Real-time Face-API detection & multi-person alert tracking.</p>
            </div>
            <div className="seb-lock__feature">
              <span className="seb-lock__feature-icon"><img src="/code-editor.png" alt="Code Sandbox & Practice" /></span>
              <h4>Code Sandbox & Practice</h4>
              <p>Multi-language IDE supporting Java, Python, C++, SQL & DSA.</p>
            </div>
            <div className="seb-lock__feature">
              <span className="seb-lock__feature-icon"><img src="/microphone.png" alt="Spoken English AI" /></span>
              <h4>Spoken English AI</h4>
              <p>CEFR audio evaluation & real-time pronunciation scoring.</p>
            </div>
          </div>

          <div className="seb-lock__steps">
            <h3>Recommended Access Modes</h3>
            <ul className="seb-lock__step-list">
              <li className="seb-lock__step-item">
                <span className="seb-lock__step-num">1</span>
                <span><strong>Web Edition:</strong> Click "Go to Web Portal" above to sign in, practice coding problems, and view student scorecards directly in your browser.</span>
              </li>
              <li className="seb-lock__step-item">
                <span className="seb-lock__step-num">2</span>
                <span><strong>Desktop SEB App:</strong> Download and install <code>SEED-SEB-Setup.exe</code> on Windows for high-security official proctored examinations.</span>
              </li>
            </ul>
          </div>

          <div className="seb-lock__footer">
            SEED-IT Platform v{APP_VERSION} | Protected by Anti-Cheat & Sandbox Guard
          </div>
        </div>
      </div>
    </div>
  );
}
