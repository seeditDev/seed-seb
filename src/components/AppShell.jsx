/**
 * Client-side application shell, ported from the original CRA `App.js`.
 * Owns cache/time-service bootstrap, session tracking, the desktop-only gate
 * and the top-level error boundary. Routing itself lives in src/routes.
 */
import React, { useEffect, useState, useRef } from "react";
import Cookies from "js-cookie";

import cacheManager from '../utils/cacheManager';
import TrackingService from '../services/trackingService';
import timeService from '../services/timeService';
import desktopBridge from '../utils/desktopBridge';
import { logPortalActivityTime } from '../services/codingProgressService';
import { useLocation, useNavigate } from "./router-compat";
import { auth, onAuthStateChanged, db } from '../lib/firebase-config';
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import ProctorService from '../services/proctorService';
import { stopAllMediaAndAI } from '../utils/hardwareTeardown';

import { Toaster } from "sonner";
import '../styles/index.css';
import '../styles/Login.css';

export const APP_VERSION = "1.0.4";

const VERSION_COOKIE_NAME = "app_version";

export const compareVersions = (v1, v2) => {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
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

function TrackingBridge() {
  useEffect(() => {
    TrackingService.startTracking();
    return () => TrackingService.stopTracking();
  }, []);
  return null;
}

function VersionUpdateWatcher({ onVersionMismatch }) {
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "app_metadata", "version_config"),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const serverVersion = data.current_version;
        if (!serverVersion) return;
        if (compareVersions(serverVersion, APP_VERSION) > 0) {
          onVersionMismatch(serverVersion);
        }
      },
      (err) => console.warn("Version config listener warning:", err),
    );
    return () => unsub();
  }, [onVersionMismatch]);

  return null;
}

function VersionMismatchOverlay({ serverVersion, onUpdateNow }) {
  return (
    <div className="login-overlay">
      <div className="login-dialog">
        <h2 style={{ color: "#ef4444", marginBottom: "0.5rem" }}>
          Update Required
        </h2>
        <p
          style={{ color: "#4b5563", fontSize: "0.95rem", lineHeight: "1.5" }}
        >
          A new version of SEED SEB (v{serverVersion}) is available. You are
          running v{APP_VERSION}.
        </p>
        <p
          style={{
            color: "#6b7280",
            fontSize: "0.85rem",
            marginBottom: "1.5rem",
          }}
        >
          Please update to continue using the application.
        </p>
        <button
          onClick={onUpdateNow}
          className="login-submit-btn"
          style={{ width: "100%", padding: "0.75rem" }}
        >
          Update &amp; Reload Now
        </button>
      </div>
    </div>
  );
}

function PortalActivityTracker() {
  const location = useLocation();

  // Teardown media/AI workers when navigating away from assessments
  useEffect(() => {
    const path = location.pathname;
    const isAssessment =
      path.startsWith("/student/assessment/") ||
      path.startsWith("/student/coding/") ||
      path.startsWith("/student/mcq/") ||
      path.startsWith("/student/practice/");

    if (!isAssessment) {
      try {
        stopAllMediaAndAI();
      } catch (_) {}
    }
  }, [location.pathname]);

  // Track portal activity on a steady 60s interval while visible (no writes on route navigation)
  useEffect(() => {
    const authRaw = localStorage.getItem("auth_data");
    if (!authRaw) return;
    let authUser;
    try {
      authUser = JSON.parse(authRaw);
    } catch {
      return;
    }
    const uid = authUser?.uid;
    if (!uid) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        const path = window.location.pathname;
        const isAssessment =
          path.startsWith("/student/assessment/") ||
          path.startsWith("/student/coding/") ||
          path.startsWith("/student/mcq/") ||
          path.startsWith("/student/practice/");

        if (!isAssessment) {
          logPortalActivityTime(uid, 1).catch((err) =>
            console.warn("Activity tracking failed:", err),
          );
        }
      }
    }, 60_000);

    const handleUnloadOrHide = () => {
      import('../services/codingProgressService').then((mod) => {
        if (typeof mod.flushPendingActivityTime === 'function') {
          mod.flushPendingActivityTime(uid);
        }
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleUnloadOrHide);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleUnloadOrHide();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnloadOrHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      handleUnloadOrHide();
    };
  }, []);

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
  const [simultaneousLoginAlert, setSimultaneousLoginAlert] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const sessionUnsubscribeRef = useRef(null);

  useEffect(() => {
    if (!simultaneousLoginAlert) return;
    setCountdownSeconds(3);
    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = "/login?reason=simultaneous_login";
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [simultaneousLoginAlert]);

  useEffect(() => {
    const activeTheme = localStorage.getItem("portal_theme") || "seed-seb";
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
    const ua = navigator.userAgent ?? "";
    // Web bypass disabled per production security policy.const hostname = window.location.hostname;

    const hostname = window.location.hostname;
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const isDev =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".lovable.app") ||
      hostname.endsWith(".vercel.app") ||
      hostname.endsWith(".pages.dev") ||
      hostname.includes("seedit.site") ||
      import.meta.env.DEV;
    // URL-parameter bypass is restricted to DEV builds only.
    // In production, the gate can only be bypassed via a valid SEEDSEB/QtWebEngine user-agent.
    // localStorage 'web_access_bypass' is also restricted to DEV — production students
    // must use the desktop app and cannot unlock the gate through localStorage.
    const hasWebBypass = isDev && (
      localStorage.getItem("web_access_bypass") === "true" ||
      urlParams?.get("bypass") === "true" ||
      urlParams?.get("mode") === "web"
    );
    // Web bypass disabled per production security policy.
    // Desktop environment is verified via SEEDSEB/QtWebEngine user agent or PyQt window bridge.
    const isUAOk =
      ua.includes("SEEDSEB") ||
      ua.includes("QtWebEngine") ||
      ua.includes("QtWebKit") ||
      !!window.qt ||
      !!window.desktopBackend ||
      window.pyqtFlag === true;
    setIsDesktopApp(isUAOk || isDev || hasWebBypass);
  }, []);
  // Desktop environment is verified via SEEDSEB/QtWebEngine user agent or PyQt window bridge.
  //   const isUAOk =
  //     ua.includes("SEEDSEB") ||
  //     ua.includes("QtWebEngine") ||
  //     ua.includes("QtWebKit") ||
  //     !!window.qt ||
  //     !!window.desktopBackend ||
  //     window.pyqtFlag === true;
  //   setIsDesktopApp(isUAOk);
  // }, []);


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
    //
    // IMPORTANT: The observer callback must remain synchronous (Firebase ignores
    // the returned Promise). All async work — including getIdToken() — is
    // delegated to the async handleAuthenticatedUser function below, called
    // with `void` so errors don't become unhandled rejections on the observer.

    /**
     * Async session-handoff handler.  Called by the auth observer when a
     * Firebase user is confirmed present and their UID matches the localStorage
     * cache.  Fetches the live ID token and registers the session with the
     * Python engine (RAM-only — token is never persisted to localStorage).
     */
    const handleAuthenticatedUser = async (firebaseUser, parsedAuth) => {
      let sessionPayload = parsedAuth;
      try {
        const idToken = await firebaseUser.getIdToken();
        sessionPayload = { ...parsedAuth, idToken };
      } catch (tokenErr) {
        console.warn("[AppShell] Could not fetch ID token for engine session:", tokenErr);
      }
      TrackingService.startTracking(parsedAuth);
      desktopBridge.setStudentSession(sessionPayload);
    };

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
          // UID matches — hand off to async handler (void = fire-and-forget,
          // errors caught inside handleAuthenticatedUser).
          void handleAuthenticatedUser(firebaseUser, parsedAuth);
        } catch (e) {
          console.error("[AppShell] Failed to restart tracking on mount:", e);
          localStorage.removeItem("auth_data");
        }
      }

      // Single-System Login Guard: Monitor activeSessionId to prevent multi-device logins
      if (firebaseUser?.uid) {
        if (sessionUnsubscribeRef.current) {
          sessionUnsubscribeRef.current();
        }
        sessionUnsubscribeRef.current = onSnapshot(doc(db, "users", firebaseUser.uid), (docSnap) => {
          if (!docSnap.exists()) return;
          const remoteData = docSnap.data();
          const remoteSessionId = remoteData?.activeSessionId;

          // If currently in the middle of a login handshake or on the login page, do NOT trigger eviction
          const isLoggingIn = sessionStorage.getItem("is_logging_in") === "true";
          const isLoginPage = typeof window !== 'undefined' && (
            window.location.pathname === '/login' ||
            window.location.pathname === '/' ||
            window.location.pathname.endsWith('/login')
          );

          let currentLocal = localStorage.getItem("active_session_id") || sessionStorage.getItem("active_session_id");

          // If local session ID is not set yet on this client, adopt or register:
          if (!currentLocal) {
            if (remoteSessionId) {
              localStorage.setItem("active_session_id", remoteSessionId);
              sessionStorage.setItem("active_session_id", remoteSessionId);
              currentLocal = remoteSessionId;
            } else {
              const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
              localStorage.setItem("active_session_id", newSessionId);
              sessionStorage.setItem("active_session_id", newSessionId);
              setDoc(doc(db, "users", firebaseUser.uid), {
                activeSessionId: newSessionId,
                lastLoginAt: serverTimestamp()
              }, { merge: true }).catch(() => {});
              currentLocal = newSessionId;
            }
          }

          if (isLoggingIn || isLoginPage) {
            return;
          }

          // Conflict: remote session ID has changed (logged in on another device / browser)
          if (remoteSessionId && currentLocal && remoteSessionId !== currentLocal) {
            console.warn("[SessionGuard] Simultaneous login detected on another system! Terminating current session.");
            try { desktopBridge.clearStudentSession(); } catch(_) {}
            try { TrackingService.stopTracking(); } catch(_) {}
            clearAllStudentLocalData();
            auth.signOut().catch(() => {});
            sessionStorage.setItem("session_terminated_reason", "simultaneous_login");
            setSimultaneousLoginAlert(true);
          }
        }, (err) => {
          console.warn("[SessionGuard] Session listener non-fatal error:", err);
        });
      }
    });

    // FIX P2: The previous code had TWO return statements — the second one (with
    // beforeunload + clearMemoryCache) was completely unreachable. Merged into one.
    const handleUnload = () => TrackingService.stopTracking();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      isMounted = false;
      unsubscribeAuth();
      if (sessionUnsubscribeRef.current) {
        sessionUnsubscribeRef.current();
      }
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
    const prefixes = [
      'msaProgress_',
      'msaActiveAssessment_',
      'msa_',
      'proctor_',
      'proctor_offline_',
      'proctor_snapshots_offline_',
      'proctor_unsynced_',
      'seed_submission_envelope_',
      'completed_assessments_',
      'mcqCompleted_',
      'mcq_',
      'mcqTest',
      'practice_progress_',
      'user_activities_',
      'user_profile_',
      'seed_daily_goals_',
      'assessment_',
      'assessmentCompletion_',
      'codingAssessment',
      'coding_',
      'guest_',
      'seed_'
    ];
    const exactKeys = [
      'auth_data',
      'role',
      'active_session_id',
      'cache_version',
      'rememberedUser',
      'codingAssessmentData',
      'codingAssessmentStartTime',
      'codingAssessmentTimer',
      'codingLastActiveTime',
      'mcqTestCourseCtx',
      'mcqTestStartTime',
      'mcqTeststartedAt',
      'mcqTestDuration',
      'mcqTestData',
      'mcqTestAnswers',
      'mcqActiveTestSlug',
      'mcqLastProgressSync',
      'mcqLastActiveTime',
      'mcqPendingSubmission',
      'mcqReloadGraceDeadline',
      'mcqAutoSubmitNotice',
    ];
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (exactKeys.includes(key) || prefixes.some((p) => key.startsWith(p))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    try {
      sessionStorage.clear();
    } catch (_) {}
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

function EngineDisconnectedPopup() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleDisconnected = () => {
      setIsOpen(true);
    };

    window.addEventListener("seed:engine_disconnected", handleDisconnected);
    return () => {
      window.removeEventListener("seed:engine_disconnected", handleDisconnected);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999999,
      }}
    >
      <div
        style={{
          background: "var(--bg-primary, #ffffff)",
          border: "1.5px solid var(--border-color, #e2e8f0)",
          borderRadius: "16px",
          padding: "28px",
          maxWidth: "460px",
          width: "90%",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#fee2e2",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              fontWeight: 800,
            }}
          >
            !
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "17px",
                fontWeight: 800,
                color: "var(--text-main, #0f172a)",
              }}
            >
              Evaluation Engine Not Connected
            </h3>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "12px",
                color: "var(--text-muted, #64748b)",
              }}
            >
              Code execution compiler bridge unavailable
            </p>
          </div>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "var(--text-main, #334155)",
            lineHeight: 1.5,
          }}
        >
          The code evaluation engine is currently disconnected. Other test cases have been halted to prevent execution delays.
        </p>

        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--text-muted, #64748b)",
          }}
        >
          Please restart the application or rerun your code to re-establish the compiler connection.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "1px solid var(--border-color, #cbd5e1)",
              background: "transparent",
              color: "var(--text-main, #475569)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Rerun Code
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: "var(--accent-coding, #15803d)",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Restart Application
          </button>
        </div>
      </div>
    </div>
  );
}

function SimultaneousLoginModal({ countdownSeconds }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999999,
        backgroundColor: "rgba(15, 23, 42, 0.88)",
        backdropFilter: "blur(14px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "#0f172a",
          color: "#ffffff",
          borderRadius: "20px",
          border: "1.5px solid rgba(239, 68, 68, 0.4)",
          boxShadow: "0 25px 60px -15px rgba(220, 38, 38, 0.45)",
          padding: "32px 28px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "18px",
        }}
      >
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.15)",
            border: "2px solid #ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ef4444",
            fontSize: "28px",
            fontWeight: 800,
          }}
        >
          ⚠
        </div>
        <div>
          <h3
            style={{
              margin: "0 0 8px",
              fontSize: "20px",
              fontWeight: 800,
              color: "#f87171",
              letterSpacing: "-0.02em",
            }}
          >
            Simultaneous Login Detected
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#cbd5e1",
              lineHeight: 1.55,
            }}
          >
            Your account has been logged in on another machine or browser.
            For exam security, this session has been ended.
          </p>
        </div>

        <div
          style={{
            width: "100%",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "10px",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            fontSize: "13px",
            color: "#94a3b8",
          }}
        >
          <span>Logging out and redirecting in</span>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 800,
              fontSize: "15px",
              color: "#ef4444",
              background: "rgba(239, 68, 68, 0.25)",
              padding: "2px 8px",
              borderRadius: "6px",
            }}
          >
            {countdownSeconds}s
          </span>
        </div>

        <div
          style={{
            width: "100%",
            height: "4px",
            borderRadius: "2px",
            background: "rgba(255, 255, 255, 0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(countdownSeconds / 3) * 100}%`,
              background: "#ef4444",
              transition: "width 1s linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}

  if (simultaneousLoginAlert) {
    return <SimultaneousLoginModal countdownSeconds={countdownSeconds} />;
  }

  if (!isDesktopApp) {
    return <DesktopOnlyNotice onEnableWebAccess={handleEnableWebAccess} />;
  }

  return (
    <ErrorBoundary>
      <Toaster richColors position="top-right" />
      <PortalActivityTracker />
      <EngineDisconnectedPopup />
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
      <div className="seb-boot__title">SEED-IT SEB (Secure Examination & Benchmarking)</div>
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
            Welcome to the SEED-IT Assessment Platform. Proctored exams run securely inside the SEED-SEB environment. You can also launch the Web Edition below to practice and manage assessments.
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
