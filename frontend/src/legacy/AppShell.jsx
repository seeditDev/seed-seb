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
import { useLocation } from "./router-compat";

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
    const isDev =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".lovable.app") ||
      import.meta.env.DEV;
    const isUAOk =
      ua.includes("SEEDSEB") ||
      ua.includes("QtWebEngine") ||
      ua.includes("QtWebKit") ||
      !!window.qt ||
      !!window.desktopBackend ||
      window.pyqtFlag === true;
    setIsDesktopApp(isUAOk || isDev);
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

    const rawAuth = localStorage.getItem("auth_data");
    if (rawAuth) {
      try {
        const parsedAuth = JSON.parse(rawAuth);
        TrackingService.startTracking(parsedAuth);
        desktopBridge.setStudentSession(parsedAuth);
      } catch (e) {
        console.error("Failed to restart tracking on mount:", e);
      }
    }

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
    return <DesktopOnlyNotice />;
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
      <img src="/SEED_Logo.png" alt="SEED-IT" width="150" height="auto" />
      <p>Loading... Please wait</p>
    </div>
  );
}

function DesktopOnlyNotice() {
  return (
    <div className="seb-lock">
      <div className="seb-lock__card">
        <div className="seb-lock__badge" aria-hidden="true">
          🛡️
        </div>
        <h1>Install SEED-SEB.exe to explore the platform</h1>
        <p>
          For security, academic integrity, and automated camera proctoring, this platform is
          locked down and can only be accessed inside the official SEED-SEB (Secure Exam
          Browser) desktop application.
        </p>
        <div className="seb-lock__steps">
          <h3>How to access</h3>
          <ol>
            <li>
              Download the official <strong>SEED-SEB-Setup.exe</strong> installer provided by
              your university or administrator.
            </li>
            <li>Run the installer and complete setup on your Windows device.</li>
            <li>
              Launch <strong>SEED-SEB</strong> from your desktop; it loads the platform inside a
              secure sandbox.
            </li>
          </ol>
        </div>
        <a
          className="seb-lock__cta"
          href="https://seedit-portal.vercel.app/download"
          target="_blank"
          rel="noopener noreferrer"
        >
          Download SEED-SEB installer
        </a>
        <div className="seb-lock__meta">
          Running version v{APP_VERSION} | Protected by SEED-IT Sandbox Security
        </div>
      </div>
    </div>
  );
}
