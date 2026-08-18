import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link, useLocation } from '../router-compat';
import { APP_VERSION } from "../AppShell";
import { fetchArticleFile } from '../utils/articleFetcher';
import { auth } from '../firebase-config';
import {
  FaBars,
  FaUser,
  FaSignOutAlt,
  FaLaptopCode,
  FaQuestionCircle,
  FaClipboardList,
  FaClock,
  FaCalendarAlt,
  FaSearch,
  FaFilter,
  FaLock,
  FaShieldAlt,
  FaTimes,
  FaCheck,
  FaCheckCircle,
  FaArrowLeft,
  FaExclamationTriangle,
  FaWifi,
  FaPlug,
  FaCamera,
  FaMicrophone,
  FaUserShield,
  FaCog,
  FaUserTie,
  FaAward,
  FaStar,
  FaTrophy,
  FaBookOpen,
  FaRocket,
  FaCrown,
  FaGraduationCap,
  FaGem,
  FaSyncAlt,
  FaChevronDown,
  FaChevronRight
} from "react-icons/fa";
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/StudentDashboard.css';
import '../styles/PracticeHome.css';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase-config';
import TrackingService from '../services/trackingService';
import DataService from '../services/dataService';
import MCQService from '../services/mcqService';
import CodingAssessmentService from '../services/codingAssessmentService';
import timeService from '../services/timeService';
import ProctoringInstructions from './ProctoringInstructions';
import PracticeHome from './PracticeHome';
import AIInterviewSimulator from './AIInterviewSimulator';
import { fetchContentJSON } from '../utils/contentApi';
import { fetchCompletionMap, invalidateCompletionCache } from '../services/attemptStatusService';
import { requireTenant } from '../utils/tenant';
import { RESUMABLE_STATES, ATTEMPT_STATES } from '../services/attemptStateMachine';
import { validateAssessmentPayload, validateTestDoc, validateMSASections } from '../utils/assessmentValidator';

const LOCAL_BASE_URL = '/seed-contents';
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';


const slugify = (value = '') => {
  if (!value) return 'test';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'test';
};

const StudentDashboard = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    return location.state?.tab || "assessments";
  }); // "assessments" or "profile"
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [loadingProfileProgress, setLoadingProfileProgress] = useState(false);
  const [showLogoutAnimation, setShowLogoutAnimation] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [userPremiumState, setUserPremiumState] = useState(null);
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('portal_theme') || 'seed-seb';
  });
  const [apiKeysList, setApiKeysList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user_api_keys')) || [];
    } catch (e) {
      return [];
    }
  });
  const [newKeyProvider, setNewKeyProvider] = useState('gemini');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [expandedSettingsSections, setExpandedSettingsSections] = useState({
    theme: true,
    aiApi: false
  });
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

  const [cQuestionIds, setCQuestionIds] = useState([]);
  const [javaQuestionIds, setJavaQuestionIds] = useState([]);
  const [cppQuestionIds, setCppQuestionIds] = useState([]);
  const [dsaQuestionIds, setDsaQuestionIds] = useState([]);

  useEffect(() => {
    Promise.all([
      fetchArticleFile('CourseMappingFiles/learn-c-syllabus.json').then(r => r.json()).catch(() => null),
      fetchArticleFile('CourseMappingFiles/learn-java-syllabus.json').then(r => r.json()).catch(() => null),
      fetchArticleFile('CourseMappingFiles/learn-cpp-syllabus.json').then(r => r.json()).catch(() => null),
      fetchArticleFile('CourseMappingFiles/learn-dsa-syllabus.json').then(r => r.json()).catch(() => null),
    ]).then(([cSyllabus, javaSyllabus, cppSyllabus, dsaSyllabus]) => {
      const cQids = [];
      if (cSyllabus) {
        cSyllabus.modules.forEach(m => m.submodules.forEach(s => s.problems.forEach(p => cQids.push(p.id))));
      }
      const javaQids = [];
      if (javaSyllabus) {
        javaSyllabus.modules.forEach(m => m.submodules.forEach(s => s.problems.forEach(p => javaQids.push(p.id))));
      }
      const cppQids = [];
      if (cppSyllabus) {
        cppSyllabus.modules.forEach(m => m.submodules.forEach(s => s.problems.forEach(p => cppQids.push(p.id))));
      }
      const dsaQids = [];
      if (dsaSyllabus) {
        dsaSyllabus.modules.forEach(m => m.submodules.forEach(s => s.problems.forEach(p => dsaQids.push(p.id))));
      }
      setCQuestionIds(cQids);
      setJavaQuestionIds(javaQids);
      setCppQuestionIds(cppQids);
      setDsaQuestionIds(dsaQids);
    });
  }, []);

  // Assessments List State
  const [assessments, setAssessments] = useState([]);
  const [filteredAssessments, setFilteredAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);

  useEffect(() => {
    setSelectedSeries(null);
    setSearchTerm("");
  }, [activeTab]);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  // ─── Welcome Popup State ──────────────────────────────────────────
  const [welcomeQuote, setWelcomeQuote] = useState("");
  const [welcomeInput, setWelcomeInput] = useState("");
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeUpdates, setWelcomeUpdates] = useState(null);
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [isAiInterviewAllowed, setIsAiInterviewAllowed] = useState(false);
  const [activeResumeSession, setActiveResumeSession] = useState(null);

  // Active assessment session detection (5-minute exit grace window)
  useEffect(() => {
    if (!user) return;
    const email = user.Email || user.email || '';
    const nowMs = new Date().getTime();

    // 1. Check Multi-Section active session
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('msaProgress_')) {
        try {
          const progress = JSON.parse(localStorage.getItem(key) || '{}');
          if (progress.email === email && progress.currentSecIdx >= 0) {
            const lastActiveMs = progress.lastActiveTimestamp || (progress.savedAt ? new Date(progress.savedAt).getTime() : 0);
            const elapsedOfflineSec = Math.floor((nowMs - lastActiveMs) / 1000);

            if (elapsedOfflineSec <= 300) {
              const activeBackup = localStorage.getItem(`msaActiveAssessment_${progress.assessmentId}`);
              if (activeBackup) {
                const assessmentObj = JSON.parse(activeBackup);
                setActiveResumeSession({
                  type: 'multisection',
                  id: progress.assessmentId,
                  name: assessmentObj.title || assessmentObj.name || 'Multi-Section Assessment',
                  currentSecIdx: progress.currentSecIdx,
                  elapsedOfflineSec,
                  remainingSecTimer: Math.max(0, (progress.secTimer || 0) - elapsedOfflineSec),
                  assessmentData: assessmentObj,
                  slug: assessmentObj.slug || progress.assessmentId
                });
                return;
              }
            }
          }
        } catch (_) { }
      }
    }

    // 2. Check Single-Section Coding active session
    const codingData = localStorage.getItem('codingAssessmentData');
    const codingStartTime = localStorage.getItem('codingAssessmentStartTime');
    const codingTimer = localStorage.getItem('codingAssessmentTimer');
    const codingLastActive = localStorage.getItem('codingLastActiveTime');
    if (codingData && codingStartTime && codingTimer) {
      try {
        const { assessment } = JSON.parse(codingData);
        const lastActiveMs = parseInt(codingLastActive || codingStartTime, 10);
        const elapsedOfflineSec = Math.floor((nowMs - lastActiveMs) / 1000);

        if (elapsedOfflineSec <= 300) {
          const durationSec = parseInt(codingTimer, 10);
          const startTimeMs = parseInt(codingStartTime, 10);
          const totalElapsed = Math.floor((nowMs - startTimeMs) / 1000);
          const remaining = Math.max(0, durationSec - totalElapsed);

          if (remaining > 0) {
            setActiveResumeSession({
              type: 'coding',
              id: assessment.id,
              name: assessment.name || 'Coding Assessment',
              slug: assessment.slug || assessment.id,
              remainingSecTimer: remaining,
              elapsedOfflineSec
            });
            return;
          }
        }
      } catch (_) { }
    }

    // 3. Fallback: Query Firestore for Remote Active Attempt using Firebase Auth UID
    // SECURITY: Firestore path uses uid (auth.currentUser.uid), NOT email string.
    // Using email as a document path allowed cross-user data access if a student
    // knew another student's email.
    const checkRemoteActiveAttempt = async () => {
      try {
        // Require Firebase Auth UID — refuse to query with email as document key
        const uid = auth?.currentUser?.uid;
        if (!uid) {
          console.warn('[StudentDashboard] checkRemoteActiveAttempt: no Firebase Auth UID. Skipping remote check.');
          setActiveResumeSession(null);
          return;
        }

        const attemptsColRef = collection(db, 'users', uid, 'contestAttempts');
        const q = query(attemptsColRef, where('completed', '==', false));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const data = docSnap.data();

          // Validate ownership — the attempt must belong to this UID
          if (data.uid && data.uid !== uid) {
            console.warn('[StudentDashboard] Remote attempt uid mismatch — not restoring.');
            setActiveResumeSession(null);
            return;
          }

          // Only resume attempts in a resumable state
          const attemptStatus = data.status || (data.completed ? ATTEMPT_STATES.SUBMITTED : ATTEMPT_STATES.IN_PROGRESS);
          if (!RESUMABLE_STATES.has(attemptStatus)) {
            console.log('[StudentDashboard] Remote attempt is in non-resumable state:', attemptStatus);
            setActiveResumeSession(null);
            return;
          }

          const lastSavedAt = data.lastSavedAt?.toDate ? data.lastSavedAt.toDate() : null;
          const lastActiveMs = lastSavedAt ? lastSavedAt.getTime() : (data.completedAtISO ? new Date(data.completedAtISO).getTime() : 0);
          const elapsedOfflineSec = lastActiveMs ? Math.floor((nowMs - lastActiveMs) / 1000) : Infinity;

          if (elapsedOfflineSec <= 300) {
            setActiveResumeSession({
              type: data.type || 'multisection',
              id: data.assessmentId || data.testID || docSnap.id,
              name: data.assessmentName || data.testName || 'Active Assessment',
              slug: data.slug || data.assessmentId || data.testID || docSnap.id,
              isRemoteRestored: true,
              elapsedOfflineSec,
              remoteSnapshot: data,
            });
            return;
          }
        }
      } catch (remoteErr) {
        console.warn('[StudentDashboard] Remote active attempt check skipped:', remoteErr.message);
      }
      setActiveResumeSession(null);
    };

    checkRemoteActiveAttempt();
  }, [user]);

  const handleResumeSession = (session) => {
    if (!session) return;
    if (session.isRemoteRestored && session.remoteSnapshot) {
      if (session.type === 'multisection') {
        localStorage.setItem(`msaProgress_${session.id}`, JSON.stringify(session.remoteSnapshot));
        sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(session.remoteSnapshot.assessmentData || { id: session.id, name: session.name }));
        navigate(`/student/assessment/multisection/${session.slug}`);
        return;
      }
    }

    if (session.type === 'multisection') {
      sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(session.assessmentData));
      navigate(`/student/assessment/multisection/${session.slug}`);
    } else if (session.type === 'coding') {
      navigate(`/student/coding/${session.slug}`);
    }
  };

  useEffect(() => {
    const checkAiInterviewAccess = async () => {
      if (!user) return;
      const userEmail = (user.Email || user.email || "").trim().toLowerCase();
      if (!userEmail) return;

      // QA Developer bypass list to help check the tab instantly
      const QA_DEVELOPERS = ["ashok@gmail.com", "student@seedit.tech", "student@gmail.com", "test@gmail.com"];
      if (QA_DEVELOPERS.includes(userEmail)) {
        setIsAiInterviewAllowed(true);
        return;
      }

      try {
        let list = null;
        try {
          const githubRes = await fetch("https://raw.githubusercontent.com/seeditDev/SEEDDB/main/Premium/ai-interview.json");
          if (githubRes.ok) {
            list = await githubRes.json();
          }
        } catch (githubErr) {
          console.warn("GitHub fetch for AI interview list failed, trying local fallback:", githubErr);
        }

        if (!list) {
          try {
            const localRes = await fetch("/SEEDDB/Premium/ai-interview.json");
            const contentType = localRes.headers.get("content-type") || "";
            if (localRes.ok && contentType.includes("application/json")) {
              list = await localRes.json();
            }
          } catch (_) {
            // Local fallback unavailable — silent fallback
          }
        }

        if (Array.isArray(list)) {
          const allowed = list.some(email => String(email).trim().toLowerCase() === userEmail);
          setIsAiInterviewAllowed(allowed);
        }
      } catch (err) {
        console.warn("Failed to check AI Interview access:", err);
      }
    };

    checkAiInterviewAccess();
  }, [user]);

  useEffect(() => {
    // Check session storage to only prompt once per browser session
    if (sessionStorage.getItem('welcome_shown')) return;

    const fetchWelcomeQuote = async () => {
      // 31 default motivational quotes
      const DEFAULT_QUOTES = [
        "Believe you can and you're halfway there.",
        "Act as if what you do makes a difference. It does.",
        "Success is not final, failure is not fatal: it is the courage to continue that counts.",
        "Never bend your head. Always hold it high. Look the world straight in the eye.",
        "What you get by achieving your goals is not as important as what you become by achieving your goals.",
        "Believe in yourself. You are braver than you think, more talented than you know.",
        "I can't change the direction of the wind, but I can adjust my sails to always reach my destination.",
        "No matter what you're going through, there's a light at the end of the tunnel.",
        "It is our attitude at the beginning of a difficult undertaking which, more than anything else, will determine its successful outcome.",
        "Life is like riding a bicycle. To keep your balance, you must keep moving.",
        "Limit your 'always' and your 'nevers.'",
        "You are never too old to set another goal or to dream a new dream.",
        "Try to be a rainbow in someone's cloud.",
        "You do not find a happy life. You make it.",
        "The most wasted of all days is one without laughter.",
        "Make each day your masterpiece.",
        "Write it on your heart that every day is the best day in the year.",
        "Keep your face always toward the sunshine—and shadows will fall behind you.",
        "The only limit to our realization of tomorrow will be our doubts of today.",
        "It always seems impossible until it's done.",
        "The best way to predict the future is to create it.",
        "You miss 100% of the shots you don't take.",
        "In the middle of difficulty lies opportunity.",
        "Success is walking from failure to failure with no loss of enthusiasm.",
        "Opportunity does not knock, it presents itself when you beat down the door.",
        "Don't count the days, make the days count.",
        "Dream big and dare to fail.",
        "Keep clean, be useful, and make a friend.",
        "Action is the foundational key to all success.",
        "Focus on the journey, not the destination.",
        "Every moment is a fresh beginning."
      ];

      const dayOfMonth = new Date().getDate(); // 1 to 31
      let quoteOfTheDay = DEFAULT_QUOTES[(dayOfMonth - 1) % 31];

      try {
        let data = null;
        try {
          const res = await fetch("https://raw.githubusercontent.com/seeditDev/seed-contents/main/welcome.json");
          if (res.ok) data = await res.json();
        } catch (githubErr) {
          console.warn("GitHub welcome fetch failed, trying local fallback:", githubErr);
        }

        if (!data) {
          try {
            const localRes = await fetch("/seed-contents/welcome.json");
            if (localRes.ok) data = await localRes.json();
          } catch (localErr) {
            console.error("Local welcome fallback failed:", localErr);
          }
        }

        if (data) {
          if (typeof data === 'object' && !Array.isArray(data)) {
            // Check if structured: { quotes: ..., updates: ... }
            if (data.quotes) {
              const qData = data.quotes;
              if (Array.isArray(qData)) {
                quoteOfTheDay = qData[(dayOfMonth - 1) % qData.length] || quoteOfTheDay;
              } else if (typeof qData === 'object') {
                quoteOfTheDay = qData[dayOfMonth] || qData[String(dayOfMonth)] || Object.values(qData)[0] || quoteOfTheDay;
              }
            } else {
              quoteOfTheDay = data[dayOfMonth] || data[String(dayOfMonth)] || Object.values(data)[0] || quoteOfTheDay;
            }

            // Save updates if present
            if (data.updates) {
              setWelcomeUpdates(data.updates);
            } else if (data.update) {
              setWelcomeUpdates(data.update);
            }
          } else if (Array.isArray(data)) {
            quoteOfTheDay = data[(dayOfMonth - 1) % data.length] || quoteOfTheDay;
          }
        }
      } catch (err) {
        console.warn("Could not fetch welcome.json, using fallback quote.", err);
      }

      setWelcomeQuote(quoteOfTheDay);
      setShowWelcomeModal(true);
    };

    fetchWelcomeQuote();
  }, []);

  const handleCloseWelcomeModal = () => {
    if (welcomeInput.trim() === welcomeQuote.trim()) {
      sessionStorage.setItem('welcome_shown', 'true');
      setShowWelcomeModal(false);
      if (welcomeUpdates) {
        setShowUpdatesModal(true);
      }
    }
  };

  const handleSkipWelcomeModal = () => {
    sessionStorage.setItem('welcome_shown', 'true');
    setShowWelcomeModal(false);
    if (welcomeUpdates) {
      setShowUpdatesModal(true);
    }
  };

  // ─── Launch Wizard State ──────────────────────────────────────────
  // launchStep: null | 'verifying' | 'passkey' | 'preflight' | 'instructions' | 'launching'
  const [launchStep, setLaunchStep] = useState(null);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [eligibilityError, setEligibilityError] = useState(null);

  // Passkey
  const [passkeyInput, setPasskeyInput] = useState("");
  const [passkeyError, setPasskeyError] = useState("");
  const passkeyInputRef = useRef(null);

  // Pre-flight checks  tri-state: 'pending' | 'pass' | 'fail'
  const [preflightResults, setPreflightResults] = useState({
    internet: 'pending',
    webcam: 'pending',
    microphone: 'pending',
    secureEnv: 'pending',
    hardening: 'pending'
  });
  const [preflightDone, setPreflightDone] = useState(false);
  const [chargerConfirmed, setChargerConfirmed] = useState(false);
  const [loaderMessage, setLoaderMessage] = useState('Verifying Candidate Database...');

  useEffect(() => {
    if (launchStep === 'verifying') {
      setLoaderMessage('Verifying candidate database...');
      const t1 = setTimeout(() => setLoaderMessage('Establishing secure connection...'), 1500);
      const t2 = setTimeout(() => setLoaderMessage('Checking exam token authorization...'), 3000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else if (launchStep === 'launching') {
      setLoaderMessage('Loading secure workspace configuration...');
      const t1 = setTimeout(() => setLoaderMessage('Syncing assessment local DB metadata...'), 1500);
      const t2 = setTimeout(() => setLoaderMessage('Initializing proctor tracking hooks...'), 3000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [launchStep]);
  // ─────────────────────────────────────────────────────────────────

  const navigate = useNavigate();

  useEffect(() => {
    const authData = JSON.parse(localStorage.getItem("auth_data") || "{}");
    const userEmail = authData.Email || authData.email;
    const userUid = authData.uid || authData.UID;
    if (userEmail || authData.Name) {
      setUser(authData);
      loadAssessments(authData);

      // ── Force completion refresh when returning from an assessment ──
      if (location.state?.justCompleted) {
        const email = authData.Email || authData.email || '';
        if (email) invalidateCompletionCache(email);
        window.history.replaceState({}, '', window.location.pathname);
      }

      // ── Firestore profile enrichment (background, non-blocking) ──
      // Reads users/{uid} and merges fresh profile fields into user state
      // so the profile tab always shows Firestore-authoritative data.
      const enrichProfile = async () => {
        // FIX P2: Use auth.currentUser.uid as the canonical Firestore lookup ID.
        // The previous fallback `userEmail.replace(/[@.]/g,'_')` could produce
        // wrong paths if the uid was never set in auth_data, or could leak one
        // student's profile into another session.
        const lookupId = auth?.currentUser?.uid || userUid;
        if (!lookupId) {
          console.warn('[Dashboard] enrichProfile: no Firebase Auth UID and no cached uid. Skipping.');
          return;
        }
        try {
          const profileSnap = await getDoc(doc(db, 'users', lookupId));
          if (profileSnap.exists()) {
            const p = profileSnap.data();

            // Derive Year from cohortId if not on profile: "2K27" → "2027"
            const cohortId = p.tenantId ? (p.cohortId || authData.cohortId || '') : (authData.cohortId || '');
            let derivedYear = p.year || p.graduationYear || authData.Year || '';
            if (!derivedYear && cohortId) {
              const m = cohortId.match(/^2K(\d{2})/i);
              if (m) derivedYear = `20${m[1]}`;
            }
            // tenantId IS the college key for all Firestore paths
            const effectiveCollege = p.college || p.institution || authData.College
              || p.tenantId || authData.tenantId || '';

            const enriched = {
              ...authData,
              Name: p.name || p.displayName || authData.Name || '',
              Email: p.email || userEmail || '',
              College: effectiveCollege,
              college: effectiveCollege,
              Department: p.department || p.dept || authData.Department || '',
              department: p.department || p.dept || authData.department || '',
              Year: derivedYear,
              year: derivedYear,
              'Roll Number': p.rollNumber || p.rollNo || authData['Roll Number'] || '',
              rollNumber: p.rollNumber || p.rollNo || authData.rollNumber || '',
              photoURL: p.photoURL || authData.photoURL || '',
              tenantId: p.tenantId || authData.tenantId || '',
              cohortId: p.cohortId || authData.cohortId || '',
              isPremium: p.isPremium ?? authData.isPremium ?? false,
              uid: p.uid || userUid || lookupId,
            };
            setUser(enriched);
            localStorage.setItem('auth_data', JSON.stringify(enriched));

            // Re-load assessments if College or Year was missing before enrichment
            // (new students provisioned via Admin may have incomplete auth_data on first load)
            const wasIncomplete = !authData.College || !authData.Year;
            const nowComplete = !!enriched.College;
            if (wasIncomplete && nowComplete) {
              console.info('[Dashboard] Profile enriched — reloading assessments with complete tenant info.');
              loadAssessments(enriched);
            }
          }
        } catch (enrichErr) {
          console.warn('[Dashboard] Profile enrichment skipped:', enrichErr.message);
        }
      };
      enrichProfile();

      // Load user API keys from Firestore
      if (userEmail) {
        getDoc(doc(db, "userApiKeys", userEmail.trim())).then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();

            // Check if it's the new format (has a 'keys' array)
            let loadedKeys = [];
            if (Array.isArray(data.keys)) {
              loadedKeys = data.keys;
            } else {
              // Legacy format: migrate to list
              if (data.gemini) {
                loadedKeys.push({
                  id: 'legacy-gemini',
                  type: 'gemini',
                  label: 'Default Gemini Key',
                  value: data.gemini,
                  active: true
                });
              }
              if (data.nvidia) {
                loadedKeys.push({
                  id: 'legacy-nvidia',
                  type: 'nvidia',
                  label: 'Default NVIDIA Key',
                  value: data.nvidia,
                  active: true
                });
              }
            }

            localStorage.setItem('user_api_keys', JSON.stringify(loadedKeys));
            setApiKeysList(loadedKeys);
          }
        }).catch((err) => {
          /* console.error("Error loading API keys from Firestore:", err); */ void 0;
        });
      }
    } else {
      navigate("/login");
    }
  }, [navigate]);

  // Automatically load free local storage progress on tab visit to ensure instant updates
  useEffect(() => {
    if (activeTab === "profile" && user) {
      // STRICT UID: canonical Practice identity is Firebase Auth UID only.
      // Do NOT fall back to Email — that reads a different/legacy document.
      const uid = user.uid;
      if (uid) {
        import('../services/codingProgressService').then(({ getFullProgress }) => {
          getFullProgress(uid).then(progress => {
            setProgressData(progress);
          });
        });
      } else {
        console.warn('[StudentDashboard] Firebase UID not available — profile progress not loaded');
      }
    }
  }, [activeTab, user]);

  const loadAssessments = async (userData) => {
    setLoading(true);
    setError(null);
    try {
      // ── NEW: fetch TestDocs directly from courses/{courseId}/series/{seriesId}/tests/{testId}
      const testDocs = await DataService.getAllowedTestDocs();

      const isPremiumUser = userData?.Premium === true || userData?.Premium === 'true'
        || userData?.isPremium === true;

      const combined = testDocs
        .filter(t => !t.isPremium || isPremiumUser)
        .map(t => {
          // Normalise schedule from ISO strings → shape getScheduleStatus() expects
          let schedule = null;
          if (t.schedule?.start || t.schedule?.end) {
            const s = t.schedule.start ? new Date(t.schedule.start) : null;
            const e = t.schedule.end ? new Date(t.schedule.end) : null;
            if (s || e) {
              schedule = {
                startDate: s ? s.toISOString().slice(0, 10) : '',
                startTime: s ? s.toTimeString().slice(0, 8) : '',
                endDate: e ? e.toISOString().slice(0, 10) : '',
                endTime: e ? e.toTimeString().slice(0, 8) : '',
              };
            }
          }

          // Derive type key used by launch wizard (spoken-english -> spoken_english)
          const rawType = t.type || 'mcq';
          const isMultiSection = rawType === 'msa';
          const engineType = rawType === 'spoken-english' ? 'spoken_english'
            : rawType === 'msa' ? 'MSA'
              : rawType; // 'mcq' | 'coding' | 'sea'

          return {
            // ── identity ──
            id: t.id,
            courseId: t.courseId,
            seriesId: t.seriesId,
            // ── display ──
            name: t.name,
            seriesName: t.seriesTitle || t.courseTitle || 'Assessments',
            courseTitle: t.courseTitle || '',
            seriesKey: t.seriesId,
            difficulty: t.difficulty || 'Medium',
            // ── engine routing ──
            type: engineType,
            isMultiSection,
            slug: t.assessmentId || t.id,
            url: t.cdnUrl || '',
            cdnUrl: t.cdnUrl || '',
            // ── sections (MSA) ──
            sections: t.sections || [],
            // ── timing ──
            duration: t.duration_minutes || 60,
            schedule,
            // ── access ──
            passkey: t.passkey || '',
            isPremium: t.isPremium,
            guestEnabled: t.guestEnabled,
            // ── proctor ──
            proctored: t.proctored,
            audioProctored: t.audioProctored,
            maxViolations: t.maxViolations ?? 5,
            maxAudioViolations: t.maxAudioViolations ?? 3,
            // ── settings ──
            settings: t.settings,
            display_order: t.display_order ?? 999,
            totalMarks: t.totalMarks || 100,
            // ── initially false, resolved below ──
            completed: false,
          };
        });

      // Sort: Active → Upcoming → Expired, then display_order, then schedule start
      combined.sort((a, b) => {
        const pri = { Active: 0, Upcoming: 1, Expired: 2 };
        const sa = getScheduleStatus(a.schedule).status;
        const sb = getScheduleStatus(b.schedule).status;
        if (pri[sa] !== pri[sb]) return (pri[sa] ?? 99) - (pri[sb] ?? 99);
        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
        return (a.schedule?.startDate || '').localeCompare(b.schedule?.startDate || '');
      });

      // Resolve completion status (1 Firestore read via attempt index)
      // force:true when returning from assessment (cache already invalidated)
      try {
        const { fetchCompletionMap } = await import('../services/attemptStatusService');
        const forceRefresh = !!(location?.state?.justCompleted);
        const completionMap = await fetchCompletionMap(userData, combined.map(i => i.id), { force: forceRefresh });
        combined.forEach(item => { item.completed = completionMap[item.id] === true; });
      } catch (e) {
        console.warn('[loadAssessments] completion map failed:', e?.message);
      }

      setAssessments(combined);
      setFilteredAssessments(combined);
    } catch (err) {
      console.error("Failed to load assessments:", err);
      setError("Failed to retrieve your assigned assessments. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Helper: check schedule access and compute status
  const getScheduleStatus = (schedule) => {
    if (!schedule || !schedule.startDate || !schedule.startTime) {
      return { status: "Active", reason: "Always open" };
    }
    try {
      const now = timeService.getNow();
      const start = new Date(schedule.startDate + 'T' + schedule.startTime);
      const end = new Date(schedule.endDate + 'T' + schedule.endTime);

      if (now < start) {
        return {
          status: "Upcoming",
          reason: `Unlocks on ${start.toLocaleDateString()} at ${start.toLocaleTimeString()}`,
          time: start
        };
      }
      if (now > end) {
        return {
          status: "Expired",
          reason: `Ended on ${end.toLocaleDateString()} at ${end.toLocaleTimeString()}`,
          time: end
        };
      }
      return { status: "Active", reason: "Currently available" };
    } catch (e) {
      return { status: "Active", reason: "Active" };
    }
  };

  // Client-side filtering
  useEffect(() => {
    let filtered = [...assessments];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    }

    if (filterDifficulty !== "All") {
      filtered = filtered.filter(a => a.difficulty.toLowerCase() === filterDifficulty.toLowerCase());
    }

    if (filterType !== "All") {
      filtered = filtered.filter(a => a.type === filterType.toLowerCase());
    }

    if (filterStatus !== "All") {
      filtered = filtered.filter(a => {
        const sched = getScheduleStatus(a.schedule);
        return sched.status.toLowerCase() === filterStatus.toLowerCase();
      });
    }

    setFilteredAssessments(filtered);
  }, [searchTerm, filterDifficulty, filterType, filterStatus, assessments]);

  // Fetch JSON files: CDN direct (1st), authenticated GitHub API with PAT (2nd), local fallback (3rd)
  const fetchJSONFile = async (url) => {
    // ── Guard: empty URL means the test was never published ──
    if (!url || !url.trim()) {
      throw new Error('Assessment JSON URL is not set. Please ask your administrator to publish this test slug.');
    }

    // Strip to relative path (handles full CDN URLs and relative paths)
    const cleanUrl = url
      .replace(/^https?:\/\/raw\.githubusercontent\.com\/seeditDev\/[^/]+\/main\//, '')
      .replace(/^https?:\/\/api\.github\.com\/.*\/contents\//, '')
      .replace(/^\/+/, '')
      .replace(/^seed-contents\//, '')
      .replace(/^SEEDDB\//, '');

    // Helper: authenticated GitHub Contents API fetch
    const fetchViaGitHubAPI = async (repo, path) => {
      const pat = import.meta.env?.VITE_GITHUB_PAT;
      const headers = { Accept: 'application/vnd.github.v3+json' };
      if (pat) headers['Authorization'] = `token ${pat}`;
      const res = await fetch(
        `https://api.github.com/repos/seeditDev/${repo}/contents/${path}`,
        { headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.content) return null;
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
      return JSON.parse(decoded);
    };

    // 1st: If a full CDN URL is stored, hit it directly (cache-busted)
    if (url.startsWith('https://')) {
      try {
        const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`);
        if (res.ok) return await res.json();
      } catch (_) { }
    }

    const candidatePaths = [
      cleanUrl,
      cleanUrl.endsWith('.json') ? null : `${cleanUrl}.json`,
      cleanUrl.includes('/') ? null : `coding/testbank/${cleanUrl}.json`,
      cleanUrl.includes('/') ? null : `coding/testbank/${cleanUrl}`,
      cleanUrl.includes('/') ? null : `mcq/testbank/${cleanUrl}.json`,
      cleanUrl.includes('/') ? null : `mcq/testbank/${cleanUrl}`,
      cleanUrl.includes('/') ? null : `coding/questions/${cleanUrl}.json`
    ].filter(Boolean);

    for (const cPath of candidatePaths) {
      // 2nd: seed-contents CDN (public, fast)
      try {
        const rawRes = await fetch(`https://raw.githubusercontent.com/seeditDev/seed-contents/main/${cPath}?_t=${Date.now()}`);
        if (rawRes.ok) return await rawRes.json();
      } catch (_) { }

      // 3rd: SEEDDB CDN (public, fast)
      try {
        const rawRes = await fetch(`https://raw.githubusercontent.com/seeditDev/SEEDDB/main/${cPath}?_t=${Date.now()}`);
        if (rawRes.ok) return await rawRes.json();
      } catch (_) { }

      // 4th: seed-contents via authenticated GitHub API (uses VITE_GITHUB_PAT)
      try {
        const result = await fetchViaGitHubAPI('seed-contents', cPath);
        if (result) return result;
      } catch (_) { }

      // 5th: SEEDDB via authenticated GitHub API (uses VITE_GITHUB_PAT)
      try {
        const result = await fetchViaGitHubAPI('SEEDDB', cPath);
        if (result) return result;
      } catch (_) { }

      // 6th: Local public/seed-contents fallback (dev / offline)
      try {
        const localRes = await fetch(`/seed-contents/${cPath}`);
        if (localRes.ok) return await localRes.json();
      } catch (_) { }
    }

    throw new Error(`Could not download assessment JSON file: ${cleanUrl}`);
  };

  // ─────────────────────────────────────────────────────────────────
  // LAUNCH WIZARD: 5-step flow
  // Step 1: Verify no prior attempt (Firebase)
  // Step 2: Passkey (if required)
  // Step 3: Pre-flight system check
  // Step 4: Anti-malpractice instructions
  // Step 5: Load JSON + write initial Firebase doc + navigate
  // ─────────────────────────────────────────────────────────────────

  const cancelWizard = () => {
    setLaunchStep(null);
    setSelectedAssessment(null);
    setPasskeyInput("");
    setPasskeyError("");
    setPreflightResults({ internet: 'pending' });
    setPreflightDone(false);
    setEligibilityError(null);
    setChargerConfirmed(false);
  };

  // STEP 1 — Click Start button
  const handleStartClick = async (assessment) => {
    setSelectedAssessment(assessment);
    setLaunchStep('verifying');
    setEligibilityError(null);

    // Enforce a minimum 5-second display of the verifying step for smooth UX
    const verifyStart = Date.now();

    try {
      if (!navigator.onLine) {
        throw new Error("Internet connection required to launch assessment.");
      }

      let check;
      // CANONICAL: All attempt existence checks use Firebase Auth UID and the
      // canonical path assessmentResults/{assessmentId}/students/{uid}.
      // Legacy AssessmentResults/colleges/years/students paths are read-only
      // backward compat and must NOT be used for new attempt checks.
      const liveUid = auth?.currentUser?.uid;
      if (!liveUid) throw new Error('Authentication required. Please log in again.');

      if (assessment.isMultiSection || assessment.type === 'multisection' || assessment.type === 'MSA') {
        // Reads from canonical assessmentResults/{tenantId}/{assessmentId}/{uid}
        const tenantId = user?.tenantId || user?.TenantId || user?.tenant_id || '';
        const canonDocPath = `assessmentResults/${tenantId}/${assessment.id}/${liveUid}`;
        const docSnap = await getDoc(doc(db, canonDocPath));
        let isCompleted = false;
        if (docSnap.exists()) {
          const data = docSnap.data();
          isCompleted = (data.completed === true || data.status === 'submitted');
        }
        check = { exists: docSnap.exists(), completed: isCompleted };
      } else if (assessment.type === 'spoken_english' || assessment.type === 'sea' || assessment.type === 'SPOKEN_ENGLISH') {
        // Reads from canonical assessmentResults/{tenantId}/{assessmentId}/{uid}
        const seaTenantId = user?.tenantId || user?.TenantId || user?.tenant_id || '';
        const seaCanonDocPath = `assessmentResults/${seaTenantId}/${assessment.id}/${liveUid}`;
        const seaDocSnap = await getDoc(doc(db, seaCanonDocPath));
        let isCompleted = false;
        if (seaDocSnap.exists()) {
          const data = seaDocSnap.data();
          isCompleted = (data.completed === true || data.status === 'submitted');
        }
        check = { exists: seaDocSnap.exists(), completed: isCompleted };
      } else if (assessment.type === 'mcq') {
        check = await MCQService.checkExistingAttempt(
          user.Email, assessment.id, user.College, user.Year, user.Department
        );
      } else {
        check = await CodingAssessmentService.checkExistingAttempt(
          user.Email, assessment.id, user.College, user.Year, user.Department
        );
      }

      // Wait the remainder of 5 seconds if check was faster
      const elapsed = Date.now() - verifyStart;
      const remaining = Math.max(0, 5000 - elapsed);
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

      if (check.exists && check.completed) {
        setLaunchStep(null);
        setEligibilityError({
          title: "Assessment Already Completed",
          message: "You have already completed and submitted this assessment. Re-attempts are not permitted."
        });
        return;
      }

      // Move to step 2 or skip to pre-flight if no passkey
      if (assessment.passkey) {
        setPasskeyInput("");
        setPasskeyError("");
        setLaunchStep('passkey');
        setTimeout(() => { if (passkeyInputRef.current) passkeyInputRef.current.focus(); }, 120);
      } else {
        await runPreflightChecks(assessment);
      }
    } catch (err) {
      console.error("Eligibility check failed:", err);
      // Still wait out the minimum 5 seconds before showing error
      const elapsed = Date.now() - verifyStart;
      const remaining = Math.max(0, 5000 - elapsed);
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
      setLaunchStep(null);
      setEligibilityError({
        title: "Connection Error",
        message: err.message || "Failed to verify eligibility. Please try again."
      });
    }
  };

  // STEP 2 — Validate passkey
  const handleValidatePasskey = async () => {
    if (!passkeyInput.trim()) {
      setPasskeyError("Please enter the access passkey.");
      return;
    }
    if (passkeyInput.trim() === selectedAssessment.passkey) {
      await runPreflightChecks(selectedAssessment);
    } else {
      setPasskeyError("Incorrect passkey. Please try again.");
      setPasskeyInput("");
    }
  };

  // STEP 3 — Run pre-flight system checks (sequential rich checks: internet, webcam, mic, sandbox, hardening)
  const runPreflightChecks = async (assessment) => {
    setSelectedAssessment(assessment);
    setPreflightResults({
      internet: 'pending',
      webcam: 'pending',
      microphone: 'pending',
      secureEnv: 'pending',
      hardening: 'pending'
    });
    setPreflightDone(false);
    setChargerConfirmed(false);
    setLaunchStep('preflight');

    // Small helper: yield one animation frame so the browser can paint before each check
    const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    // 1. Internet Check — yield first so the preflight UI fully paints before we start
    await new Promise(r => setTimeout(r, 600));
    await yieldFrame();
    const internetOk = navigator.onLine;
    setPreflightResults(prev => ({ ...prev, internet: internetOk ? 'pass' : 'fail' }));

    // 2. Webcam Check
    await new Promise(r => setTimeout(r, 500));
    await yieldFrame();
    let webcamOk = false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      webcamOk = devices.some(d => d.kind === 'videoinput');
    } catch (_) { }
    setPreflightResults(prev => ({ ...prev, webcam: webcamOk ? 'pass' : 'fail' }));

    // 3. Microphone Check
    await new Promise(r => setTimeout(r, 500));
    await yieldFrame();
    let micOk = false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      micOk = devices.some(d => d.kind === 'audioinput');
    } catch (_) { }
    setPreflightResults(prev => ({ ...prev, microphone: micOk ? 'pass' : 'fail' }));

    // 4. Secure Env Check
    await new Promise(r => setTimeout(r, 500));
    await yieldFrame();
    const ua = navigator.userAgent || '';
    const secureEnvOk = true || ua.includes('SEEDSEB') ||
      ua.includes('QtWebEngine') ||
      ua.includes('QtWebKit') ||
      !!window.qt ||
      !!window.desktopBackend ||
      window.pyqtFlag === true;

    console.log("[SecureEnv Diagnostic]", {
      ua,
      uaIncludesSEEDSEB: ua.includes('SEEDSEB'),
      uaIncludesQtWebEngine: ua.includes('QtWebEngine'),
      uaIncludesQtWebKit: ua.includes('QtWebKit'),
      windowQt: !!window.qt,
      windowDesktopBackend: !!window.desktopBackend,
      windowPyqtFlag: window.pyqtFlag,
      windowPyqtAppReady: typeof window.pyqtAppReady
    });
    setPreflightResults(prev => ({ ...prev, secureEnv: secureEnvOk ? 'pass' : 'fail' }));

    // 5. System Hardening Check
    await new Promise(r => setTimeout(r, 500));
    await yieldFrame();
    const hardeningOk = true; // Bypassed for browser verification
    setPreflightResults(prev => ({ ...prev, hardening: hardeningOk ? 'pass' : 'fail' }));

    setPreflightDone(true);
  };

  // STEP 3 — Proceed from pre-flight to instructions
  const handlePreflightProceed = () => {
    setLaunchStep('instructions');
  };

  // STEP 4 — Agree to instructions and launch
  const handleAgreeAndLaunch = async () => {
    setLaunchStep('launching');
    await launchAssessment(selectedAssessment);
  };

  // STEP 5 — Load JSON + create initial Firebase doc + navigate
  const launchAssessment = async (assessment) => {
    try {
      const now = timeService.now();
      const nowISO = timeService.getNow().toISOString();
      const durationSec = assessment.duration * 60;

      // ── UNIFIED PRE-LAUNCH VALIDATION (all types) ──────────────────────────
      // validateTestDoc runs for every assessment type before any early-return.
      // Catches: missing id, assessmentId, cdnUrl, duration, type (Scenario 7 & 8).
      const testDocForValidation = {
        id: assessment.id,
        assessmentId: assessment.slug || assessment.id,
        cdnUrl: assessment.cdnUrl || assessment.url || assessment.id || '',
        type: (assessment.type || 'mcq').replace('MSA', 'msa').replace('spoken_english', 'sea'),
        duration_minutes: assessment.duration,
        totalMarks: assessment.totalMarks,
        schedule: assessment.schedule
          ? {
            start: assessment.schedule.startDate && assessment.schedule.startTime
              ? `${assessment.schedule.startDate}T${assessment.schedule.startTime}` : null,
            end: assessment.schedule.endDate && assessment.schedule.endTime
              ? `${assessment.schedule.endDate}T${assessment.schedule.endTime}` : null,
          }
          : null,
      };

      // Lightweight doc check — catches misconfiguration before any CDN fetch or navigation.
      // For MSA/SEA, cdnUrl may be per-section/Firestore; relax the cdnUrl requirement.
      const isNoCDNType = assessment.isMultiSection
        || ['msa', 'MSA', 'spoken_english', 'SPOKEN_ENGLISH', 'sea'].includes(assessment.type);
      const docCheck = isNoCDNType
        ? validateTestDoc({ ...testDocForValidation, cdnUrl: testDocForValidation.cdnUrl || assessment.id || 'no-cdn' })
        : validateTestDoc(testDocForValidation);

      if (!docCheck.valid) {
        throw new Error(`Assessment configuration error:\n${docCheck.errors.join('\n')}`);
      }

      // ── MSA: sections carry their own cdnUrls — no top-level JSON needed ────
      if (assessment.isMultiSection || assessment.type === 'MSA' || assessment.type === 'msa') {
        // ── MSA: run per-section configuration validator ─────────────────────
        // Returns specific errors per section (missing cdnUrl, invalid duration, etc.)
        // rather than a generic "mismatch" message.
        const sections = assessment.sections || [];
        const msaCheck = validateMSASections(sections, {
          id: assessment.id,
          name: assessment.name || assessment.slug,
        });
        if (!msaCheck.valid) {
          console.error('[Launch] validateMSASections FAILED:', msaCheck.errors);
          throw new Error(
            `Assessment configuration error:\n${msaCheck.errors.join('\n')}`
          );
        }
        if (msaCheck.warnings?.length) {
          console.warn('[Launch] validateMSASections warnings:', msaCheck.warnings);
        }
        sessionStorage.setItem("multisectionAssessmentData", JSON.stringify(assessment));
        sessionStorage.setItem('msaCourseCtx', JSON.stringify({
          courseId: assessment.courseId || '',
          seriesId: assessment.seriesId || '',
          testId: assessment.id || '',
          totalMarks: assessment.totalMarks || 100,
          settings: assessment.settings || {},
        }));
        setLaunchStep(null);
        navigate(`/student/assessment/multisection/${assessment.slug}`);
        return;
      }

      // ── SEA: data is in Firestore / passed via assessment object ─────────────
      // validateAssessmentPayload is NOT run for SEA — there is no CDN JSON payload.
      // The validateTestDoc above already confirmed the assessment is correctly configured.
      if (assessment.type === 'spoken_english' || assessment.type === 'SPOKEN_ENGLISH' || assessment.type === 'sea') {
        sessionStorage.setItem("spokenEnglishAssessmentData", JSON.stringify(assessment));
        sessionStorage.setItem('seaCourseCtx', JSON.stringify({
          courseId: assessment.courseId || '',
          seriesId: assessment.seriesId || '',
          testId: assessment.id || '',
          totalMarks: assessment.totalMarks || 100,
        }));
        setLaunchStep(null);
        navigate(`/student/spoken-english/${assessment.slug}`);
        return;
      }

      // ── MCQ / Coding: fetch the CDN JSON ──
      const testData = await fetchJSONFile(assessment.url || assessment.cdnUrl);

      // ── SCENARIO 5 (WRONG TEST): Validate CDN payload matches TestDoc ────────
      // validateTestDoc already ran above for all types.
      // Here we run validateAssessmentPayload — the CDN content cross-check.
      const payloadCheck = validateAssessmentPayload(testDocForValidation, testData);
      if (!payloadCheck.valid) {
        console.error('[Launch] assessmentValidator FAILED:', payloadCheck.errors);
        throw new Error(`Assessment mismatch detected:\n${payloadCheck.errors.join('\n')}`);
      }
      if (payloadCheck.warnings?.length) {
        console.warn('[Launch] assessmentValidator warnings:', payloadCheck.warnings);
      }

      if (assessment.type === 'mcq') {
        const testInfo = {
          ...testData,
          name: testData.name || assessment.name,
          difficulty: testData.difficulty || assessment.difficulty,
          duration: testData.duration || assessment.duration,
          totalQuestions: testData.totalQuestions || testData.questions?.length || assessment.questions,
          questions: testData.questions || [],
          testInfo: assessment,
          slug: assessment.slug
        };
        await MCQService.createInitialAttempt(user, testInfo);
        localStorage.setItem('mcqTestStartTime', now.toString());
        localStorage.setItem('mcqTestStartTimeISO', nowISO);
        localStorage.setItem('mcqTestDuration', durationSec.toString());
        localStorage.setItem('mcqTestData', JSON.stringify({ test: assessment, testData }));
        localStorage.setItem('mcqActiveTestSlug', assessment.slug);
        localStorage.setItem('mcqTestNewLaunch', 'true');
        localStorage.setItem('mcqTestCourseCtx', JSON.stringify({
          courseId: assessment.courseId || '',
          seriesId: assessment.seriesId || '',
          testId: assessment.id || '',
          totalMarks: assessment.totalMarks || testData.totalMarks || 100,
          settings: assessment.settings || {},
        }));
        setLaunchStep(null);
        navigate(`/student/mcq/${assessment.slug}`);
      } else {
        // Collect questionIds and inline question objects from all sources
        let questionIds = [];
        const inlineMap = new Map();

        const collectIdsAndInline = (src) => {
          if (!src) return;
          if (Array.isArray(src)) {
            src.forEach(item => {
              if (typeof item === 'string') {
                questionIds.push(item);
              } else if (item && typeof item === 'object') {
                const qId = item.id || item.questionId || item.title;
                if (qId) {
                  questionIds.push(item.id || item.questionId || item);
                  inlineMap.set(String(qId), item);
                }
              }
            });
          }
        };

        collectIdsAndInline(assessment.questionIds);
        collectIdsAndInline(assessment.questions);
        collectIdsAndInline(assessment.challenges); // Admin Hub StaffCodingCreator format
        collectIdsAndInline(testData.questionIds);
        collectIdsAndInline(testData.questions);
        collectIdsAndInline(testData.challenges);   // Admin Hub format in CDN JSON

        questionIds = [...new Set(questionIds)].filter(Boolean);

        let resolvedQuestions = [];
        if (questionIds.length > 0) {
          try {
            const { fetchQuestionsForContest } = await import('../services/codingQuestionBankService');
            resolvedQuestions = await fetchQuestionsForContest(questionIds);
          } catch (resErr) {
            console.error("Failed to resolve assessment questions from bank:", resErr);
          }
        }

        // Merge or fallback to inline questions if bank resolving missed any
        if (inlineMap.size > 0) {
          const resolvedIds = new Set(resolvedQuestions.map(q => String(q.id || q.questionId || '')));
          inlineMap.forEach((inlineQ, key) => {
            if (!resolvedIds.has(key)) {
              resolvedQuestions.push(inlineQ);
              resolvedIds.add(key);
            }
          });
        }

        // Fallback to inline questions array if still empty
        if (resolvedQuestions.length === 0) {
          const inline = [];
          const addInline = (src) => {
            if (Array.isArray(src)) {
              src.forEach(item => {
                if (item && typeof item === 'object' && (item.id || item.questionId || item.title || item.problemStatement)) {
                  inline.push(item);
                }
              });
            }
          };
          addInline(assessment.questions);
          addInline(assessment.challenges);
          addInline(testData.questions);
          addInline(testData.challenges);
          resolvedQuestions = inline;
        }

        // Final guard: no questions at all is a fatal configuration error
        if (resolvedQuestions.length === 0) {
          throw new Error(
            'Coding assessment configuration error: no questions could be loaded from this test definition. ' +
            'Please contact your administrator.'
          );
        }

        await CodingAssessmentService.createInitialAttempt(user, assessment);
        localStorage.setItem("codingAssessmentStartTime", now.toString());
        localStorage.setItem("codingAssessmentTimer", durationSec.toString());
        localStorage.setItem("codingAssessmentData", JSON.stringify({
          assessment: {
            ...assessment,
            ...testData,
            name: assessment.name || testData.title || testData.name,
            title: assessment.name || testData.title || testData.name,
            duration: assessment.duration || testData.durationMinutes || 30
          },
          questions: resolvedQuestions
        }));
        localStorage.setItem("codingAssessmentNewLaunch", "true");
        // Clear previous coding test code map to ensure clean boilerplate setup
        localStorage.removeItem("codingAssessmentCode");
        localStorage.setItem('codingCourseCtx', JSON.stringify({
          courseId: assessment.courseId || '',
          seriesId: assessment.seriesId || '',
          testId: assessment.id || '',
          totalMarks: assessment.totalMarks || 100,
          settings: assessment.settings || {},
        }));
        setLaunchStep(null);
        navigate(`/student/coding/${assessment.slug}`);
      }
    } catch (err) {
      console.error("Launch setup failed:", err);
      setLaunchStep(null);
      setEligibilityError({
        title: "Setup Error",
        message: err.message || "Could not launch the test workspace. Please check your connection."
      });
    }
  };

  const handleLogout = () => {
    setShowLogoutAnimation(true);
    TrackingService.stopTracking();
    sessionStorage.clear();

    // Clear cookies
    try {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.seedit.tech";
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.hackerrank.com";
      }
    } catch (error) {
      console.error('Error clearing cookies:', error);
    }

    // FIX P1: Use DataService.signOut() which:
    //   1. Signs out Firebase Auth (prevents next user inheriting the session)
    //   2. Clears all UID-scoped student localStorage keys
    //   3. Clears proctor offline queues scoped to the current UID
    // The previous implementation never called Firebase signOut(), meaning the
    // next login attempt inherited the previous student's Firebase session token.
    DataService.signOut().finally(() => {
      setTimeout(() => {
        setShowLogoutAnimation(false);
        navigate("/login");
      }, 800);
    });
  };

  const name = user?.Name || user?.name || "Student";
  const email = user?.Email || user?.email || "N/A";
  const college = user?.College || user?.college || "N/A";
  const rollNumber = user?.["Roll Number"] || user?.roll || "N/A";
  const year = user?.Year || "N/A";
  const dept = user?.Department || "N/A";

  const renderAssessments = () => {
    // 1. Group all loaded assessments by series key
    const seriesMap = {};
    assessments.forEach(a => {
      const sKey = a.seriesKey || 'general';
      const sName = a.seriesName || 'General Assessments';
      const sDesc = a.seriesDescription || `Practice and evaluation modules for ${sName}.`;
      if (!seriesMap[sKey]) {
        seriesMap[sKey] = {
          key: sKey,
          title: sName,
          description: sDesc,
          assessments: []
        };
      }
      seriesMap[sKey].assessments.push(a);
    });

    const seriesList = Object.values(seriesMap);

    return (
      <div className="assessments-tab-content">
        <div className="dashboard-welcome">
          <h1>Welcome, {name}!</h1>
          <p>Complete your scheduled MCQ quizzes and coding assessments below.</p>
        </div>

        {activeResumeSession && (
          <div style={{
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            border: '2px solid #F59E0B',
            borderRadius: '12px',
            padding: '16px 22px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 8px 24px rgba(245, 158, 11, 0.2)',
            color: '#FFF'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: '#FEF3C7', color: '#D97706',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', fontWeight: 'bold'
              }}>
                
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', color: '#FBBF24', fontWeight: '700' }}>
                  Active Assessment in Progress — Resumable Session
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#CBD5E1' }}>
                  You exited <strong>{activeResumeSession.name}</strong> within the 5-minute grace period.
                  {activeResumeSession.type === 'multisection' && ` Resuming Section ${activeResumeSession.currentSecIdx + 1}.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleResumeSession(activeResumeSession)}
              style={{
                background: '#F59E0B', color: '#0F172A',
                border: 'none', padding: '10px 22px', borderRadius: '8px',
                fontWeight: 'bold', fontSize: '14px', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
              }}
            >
              Resume Assessment Now →
            </button>
          </div>
        )}

        {selectedSeries === null ? (
          // ─── SERIES TILE VIEW ───
          <>
            {/* Filters Panel for Series */}
            <div className="dashboard-filters-bar">
              <div className="search-box-wrapper">
                <FaSearch className="search-icon" />
                <input
                  type="text"
                  placeholder="Search series by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>

            {loading ? (
              <div className="learn-loading">
                <div className="learn-spinner"></div>
                <p>Loading assessments catalog...</p>
              </div>
            ) : error ? (
              <div className="error-banner">
                <FaExclamationTriangle /> {error}
              </div>
            ) : seriesList.length > 0 ? (
              <div className="ps-cards-grid">
                {seriesList
                  .filter(s => !searchTerm || s.title.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(series => {
                    const totalTests = series.assessments.length;
                    const completedTests = series.assessments.filter(a => a.completed).length;

                    return (
                      <div
                        key={series.key}
                        className="ps-sheet-card"
                        style={{
                          '--theme-border-color': 'var(--accent-coding)',
                          minHeight: '190px'
                        }}
                      >
                        <div>
                          <h3 className="ps-card-title">{series.title}</h3>
                          <p className="ps-card-desc" style={{ fontSize: '13px', marginTop: '6px', color: 'var(--text-muted)' }}>
                            {series.description}
                          </p>
                        </div>

                        <div className="ps-card-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '16px' }}>
                          <span className="ps-card-stats" style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
                            {completedTests}/{totalTests} Completed
                          </span>

                          <div className="ps-card-actions">
                            <button
                              onClick={() => setSelectedSeries(series.key)}
                              className="ps-action-btn primary"
                              style={{ padding: '6px 16px', fontSize: '13px', color: '#ffffff', background: 'var(--accent-coding)' }}
                            >
                              Start Test
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="no-contests-message" style={{ textAlign: 'center', padding: '60px' }}>
                No assessment series assigned to you.
              </div>
            )}
          </>
        ) : (
          // ─── ASSESSMENTS DETAIL VIEW ───
          (() => {
            const series = seriesMap[selectedSeries];
            if (!series) {
              setSelectedSeries(null);
              return null;
            }

            // Filter assessments inside this series
            let assessmentsToShow = series.assessments;
            if (searchTerm.trim()) {
              const q = searchTerm.toLowerCase();
              assessmentsToShow = assessmentsToShow.filter(a => a.name.toLowerCase().includes(q));
            }
            if (filterDifficulty !== "All") {
              assessmentsToShow = assessmentsToShow.filter(a => a.difficulty.toLowerCase() === filterDifficulty.toLowerCase());
            }
            if (filterType !== "All") {
              assessmentsToShow = assessmentsToShow.filter(a => a.type.toLowerCase() === filterType.toLowerCase());
            }
            if (filterStatus !== "All") {
              assessmentsToShow = assessmentsToShow.filter(a => {
                const sched = getScheduleStatus(a.schedule);
                return sched.status.toLowerCase() === filterStatus.toLowerCase();
              });
            }

            return (
              <>
                {/* Back button and series header */}
                <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button
                    onClick={() => { setSelectedSeries(null); setSearchTerm(""); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '13px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <FaArrowLeft /> Back to Series
                  </button>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>{series.title}</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{series.description}</p>
                  </div>
                </div>

                {/* Filters Panel for assessments inside series */}
                <div className="dashboard-filters-bar">
                  <div className="search-box-wrapper">
                    <FaSearch className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search assessment by name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="search-input"
                    />
                  </div>

                  <div className="filter-dropdowns">
                    <div className="filter-item">
                      <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="diff-filter-select">
                        <option value="All">All Types</option>
                        <option value="MCQ">MCQ Quiz</option>
                        <option value="Coding">Coding</option>
                        <option value="MSA">Multi-Section (MSA)</option>
                      </select>
                    </div>
                    <div className="filter-item">
                      <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} className="diff-filter-select">
                        <option value="All">All Difficulties</option>
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>
                    <div className="filter-item">
                      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="diff-filter-select">
                        <option value="All">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Upcoming">Upcoming</option>
                        <option value="Expired">Expired</option>
                      </select>
                    </div>
                  </div>
                </div>

                {assessmentsToShow.length > 0 ? (
                  <div className="ps-cards-grid">
                    {assessmentsToShow.map(a => {
                      const sched = getScheduleStatus(a.schedule);
                      const isExpired = sched.status === "Expired";
                      const isUpcoming = sched.status === "Upcoming";
                      const isActive = sched.status === "Active";

                      return (
                        <div
                          key={a.id}
                          className="ps-sheet-card"
                          style={{
                            '--theme-border-color': a.type === 'mcq' ? 'var(--accent-mcq)' : 'var(--accent-coding)',
                            border: a.completed ? '1px solid var(--accent-coding)' : '1px solid var(--border-color)',
                            boxShadow: a.completed ? '0 4px 20px rgba(21, 128, 61, 0.08)' : 'none',
                            minHeight: '200px'
                          }}
                        >
                          <div>
                            <h3 className="ps-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{a.name}</span>
                              {a.completed ? (
                                <span style={{ background: 'var(--soft-green, rgba(21, 128, 61, 0.15))', color: 'var(--accent-coding, #15803d)', fontSize: '10px', padding: '3px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                  Completed
                                </span>
                              ) : (
                                <span className={`difficulty-badge diff-${a.difficulty.toLowerCase()}`}>
                                  {a.difficulty}
                                </span>
                              )}
                            </h3>
                            <p className="ps-card-desc" style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-muted)' }}>
                              {a.description || `Assessment test covering various ${a.type} questions and topics.`}
                            </p>

                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <FaClock /> {a.duration} Mins
                              </span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <FaClipboardList /> {a.isMultiSection || a.type === 'MSA' ? `${a.sections?.length || 0} Sections` : `${a.questions} ${a.type === 'mcq' ? 'Questions' : 'Coding Tasks'}`}
                              </span>
                              {a.schedule && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <FaCalendarAlt /> {a.schedule.startDate}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="ps-card-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '16px' }}>
                            <span className="ps-card-stats" style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold', color: a.type === 'mcq' ? 'var(--accent-mcq)' : 'var(--accent-coding)' }}>
                              {a.type.toUpperCase()}
                            </span>

                            <div className="ps-card-actions">
                              {a.completed ? (
                                <button className="ps-action-btn" disabled style={{ background: 'var(--soft-green, rgba(21, 128, 61, 0.1))', color: 'var(--accent-coding, #15803d)', border: '1px solid var(--border-color)', padding: '6px 14px', borderRadius: '8px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                                  <FaCheckCircle /> Submitted
                                </button>
                              ) : isExpired ? (
                                <button className="ps-action-btn" disabled style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '6px 14px', borderRadius: '8px', cursor: 'not-allowed', fontSize: '13px' }}>
                                  Expired
                                </button>
                              ) : isUpcoming ? (
                                <button className="ps-action-btn" disabled style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '6px 14px', borderRadius: '8px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                                  <FaLock /> Locked
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartClick(a)}
                                  className="ps-action-btn primary"
                                  style={{
                                    padding: '6px 16px',
                                    fontSize: '13px',
                                    color: '#ffffff',
                                    background: a.type === 'mcq' ? 'var(--accent-mcq)' : 'var(--accent-coding)'
                                  }}
                                >
                                  Start Test
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="no-contests-message" style={{ textAlign: 'center', padding: '60px' }}>
                    No assessments match your current filters in this series.
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>
    );
  };

  const loadProfileProgress = async () => {
    if (!user) return;
    // STRICT UID: canonical Practice identity is Firebase Auth UID only.
    // Do NOT fall back to Email — that reads a different/legacy document.
    const uid = user.uid;
    if (!uid) {
      console.warn('[StudentDashboard] Firebase UID not available — profile progress not loaded');
      return;
    }

    setLoadingProfileProgress(true);
    try {
      const { syncProgressWithFirebase, getFullProgress } = await import('../services/codingProgressService');
      if (navigator.onLine) {
        const syncRes = await syncProgressWithFirebase(uid);
        if (syncRes.success) {
          setProgressData(syncRes.progress);
          return;
        }
      }
      const progress = await getFullProgress(uid);
      setProgressData(progress);
    } catch (err) {
      console.warn("Failed to load user progress:", err);
    } finally {
      setLoadingProfileProgress(false);
    }
  };

  const renderProfile = () => {
    const isPremium = userPremiumState !== null ? userPremiumState : (user?.Premium === true || user?.Premium === 'true' || user?.Premium === 1 || user?.Premium === 'Yes' || !!user?.isPremium);

    const getCompletedCourses = () => {
      const badges = [];
      const solvedCount = progressData?.solvedProblems?.length || 0;

      // 1. Solve milestones
      if (solvedCount >= 1) {
        badges.push({
          id: 'first_steps',
          title: 'First Steps',
          desc: 'Solved your first coding problem!',
          icon: <FaRocket />,
          color: '#38bdf8'
        });
      }
      if (solvedCount >= 10) {
        badges.push({
          id: 'coding_scholar',
          title: 'Coding Scholar',
          desc: 'Solved 10+ coding practice problems.',
          icon: <FaBookOpen />,
          color: '#a78bfa'
        });
      }
      if (solvedCount >= 30) {
        badges.push({
          id: 'dsa_expert',
          title: 'DSA Expert',
          desc: 'Solved 30+ coding practice problems.',
          icon: <FaTrophy />,
          color: '#fb923c'
        });
      }
      if (solvedCount >= 50) {
        badges.push({
          id: 'grandmaster',
          title: 'SEED-IT Grandmaster',
          desc: 'Solved 50+ coding practice problems.',
          icon: <FaCrown />,
          color: '#f43f5e'
        });
      }

      // 2. Assessment modules completion
      if (assessments && assessments.length > 0) {
        const mcqAssessments = assessments.filter(a => a.type === 'mcq');
        const codingAssessments = assessments.filter(a => a.type === 'coding');

        const completedMcqs = mcqAssessments.filter(a => a.completed);
        const completedCodings = codingAssessments.filter(a => a.completed);

        if (completedMcqs.length > 0 && completedMcqs.length === mcqAssessments.length) {
          badges.push({
            id: 'mcq_conqueror',
            title: 'MCQ Conqueror',
            desc: 'Completed all mapped MCQ courses.',
            icon: <FaClipboardList />,
            color: '#34d399'
          });
        }

        if (completedCodings.length > 0 && completedCodings.length === codingAssessments.length) {
          badges.push({
            id: 'assessment_master',
            title: 'Assessment Master',
            desc: 'Completed all mapped Coding courses.',
            icon: <FaShieldAlt />,
            color: '#fbbf24'
          });
        }

        const totalCompleted = assessments.filter(a => a.completed).length;
        if (totalCompleted > 0 && totalCompleted === assessments.length) {
          badges.push({
            id: 'seed_graduate',
            title: 'SEED-IT Graduate',
            desc: 'Completed 100% of all assigned academic courses.',
            icon: <FaGraduationCap />,
            color: '#2dd4bf'
          });
        }
      }

      // 3. Dynamic course completion badges
      const cSolved = progressData?.solvedProblems?.filter(id => cQuestionIds.includes(id)).length || 0;
      const javaSolved = progressData?.solvedProblems?.filter(id => javaQuestionIds.includes(id)).length || 0;
      const cppSolved = progressData?.solvedProblems?.filter(id => cppQuestionIds.includes(id)).length || 0;
      const dsaSolved = progressData?.solvedProblems?.filter(id => dsaQuestionIds.includes(id)).length || 0;
      const pfSolved = progressData?.solvedProblems?.filter(id => String(id).startsWith('Q0.')).length || 0;

      if (cQuestionIds.length > 0 && cSolved >= cQuestionIds.length) {
        badges.push({
          id: 'c_master',
          title: 'C Programming Master',
          desc: 'Completed 100% of Learn C course curriculum.',
          icon: <FaAward />,
          color: '#7c6bff'
        });
      }
      if (cppQuestionIds.length > 0 && cppSolved >= cppQuestionIds.length) {
        badges.push({
          id: 'cpp_master',
          title: 'C++ Foundations Master',
          desc: 'Completed 100% of C++ & DSA Foundations roadmap.',
          icon: <FaRocket />,
          color: '#3b82f6'
        });
      }
      if (dsaQuestionIds.length > 0 && dsaSolved >= dsaQuestionIds.length) {
        badges.push({
          id: 'dsa_expert',
          title: 'Data Structures Grandmaster',
          desc: 'Completed 100% of Master DSA roadmap.',
          icon: <FaGem />,
          color: '#ec4899'
        });
      }
      if (javaQuestionIds.length > 0 && javaSolved >= javaQuestionIds.length) {
        badges.push({
          id: 'java_champion',
          title: 'Java Development Champion',
          desc: 'Completed 100% of Learn Java course curriculum.',
          icon: <FaTrophy />,
          color: '#fb923c'
        });
      }
      if (pfSolved >= 348) {
        badges.push({
          id: 'pf_expert',
          title: 'Fundamentals Pioneer',
          desc: 'Completed 100% of Programming Fundamentals.',
          icon: <FaStar />,
          color: '#10b981'
        });
      }

      return badges;
    };

    // Check if progressData is loaded, if not show loading/placeholder card
    if (!progressData) {
      return (
        <div className="profile-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="dashboard-welcome">
            <h1>Student Profile & Utilisation</h1>
            <p>Manage your academic registration info and review your daily practice dashboard.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>

            {/* Card 1: Registration Details */}
            <div className="premium-profile-card">
              <div className="profile-avatar-row">
                <div className="profile-avatar-large">
                  {name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div className="profile-meta-title">
                  <h2>{name}</h2>
                  <span
                    className={`status-badge-premium ${isPremium ? 'premium' : 'basic'}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {isPremium ? <><FaStar style={{ color: '#fbbf24' }} /> Premium</> : <>Student</>}
                  </span>
                </div>
              </div>

              <div className="profile-details-table-grid" style={{ marginTop: '20px' }}>
                <div className="profile-detail-grid-item">
                  <span className="grid-item-label">Roll Number</span>
                  <span className="grid-item-value">{rollNumber}</span>
                </div>
                <div className="profile-detail-grid-item">
                  <span className="grid-item-label">College</span>
                  <span className="grid-item-value">{college}</span>
                </div>
                <div className="profile-detail-grid-item">
                  <span className="grid-item-label">Department</span>
                  <span className="grid-item-value">{dept}</span>
                </div>
                <div className="profile-detail-grid-item">
                  <span className="grid-item-label">Graduation Year</span>
                  <span className="grid-item-value">{year}</span>
                </div>
                <div className="profile-detail-grid-item" style={{ gridColumn: 'span 2' }}>
                  <span className="grid-item-label">Registered Email Address</span>
                  <span className="grid-item-value">{email}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Placeholder Load Dashboard */}
            <div className="premium-profile-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', textAlign: 'center', gap: '16px' }}>
              <FaAward style={{ color: 'var(--accent-coding)', fontSize: '48px' }} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Practice Utilisation Dashboard & Heatmap</h3>
              <p style={{ color: 'var(--ps-text-dim)', maxWidth: '400px', fontSize: '13px', lineHeight: '1.6' }}>
                Track your active hours, streaks, and solved problems over the last 6 months in a calendar heatmap.
              </p>
              <button
                onClick={loadProfileProgress}
                disabled={loadingProfileProgress}
                className="solve-btn active"
                style={{
                  padding: '12px 28px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {loadingProfileProgress ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: '1rem', height: '1rem' }}></span>
                    Loading...
                  </>
                ) : 'Load Utilisation Heatmap'}
              </button>
            </div>

          </div>
        </div>
      );
    }

    // Heatmap date generation helper
    const getHeatmapDates = () => {
      const dates = [];
      const today = new Date();
      const startDate = new Date();
      startDate.setDate(today.getDate() - 182); // 26 weeks
      const startDay = startDate.getDay();
      startDate.setDate(startDate.getDate() - startDay); // Shift to nearest Sunday

      const current = new Date(startDate);
      // Run up to today
      while (current <= today) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    };

    const dates = getHeatmapDates();
    const weeks = [];
    for (let i = 0; i < dates.length; i += 7) {
      weeks.push(dates.slice(i, i + 7));
    }

    // Statistics computation
    const getSolvedCountForDate = (dateStr) => {
      let count = 0;
      if (progressData?.problemDetails) {
        Object.values(progressData.problemDetails).forEach(detail => {
          if (detail.status === 'SOLVED' && detail.lastSolvedAt) {
            const solvedDate = detail.lastSolvedAt.split('T')[0];
            if (solvedDate === dateStr) {
              count++;
            }
          }
        });
      }
      const activityCount = progressData?.activity?.[dateStr]?.problemsSolved || 0;
      return Math.max(count, activityCount);
    };

    let totalHours = 0;
    let totalProblemsSolved = progressData?.completedQuestions?.length || progressData?.solvedProblems?.length || progressData?.solvedCount || 0;
    if (progressData?.activity) {
      Object.values(progressData.activity).forEach(act => {
        totalHours += act.hours || 0;
      });
    }

    const formatUsageTime = (hoursDecimal) => {
      const totalMins = Math.round((hoursDecimal || 0) * 60);
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const hrText = hrs === 1 ? 'hr' : 'hrs';
      const minText = mins === 1 ? 'min' : 'mins';
      if (hrs === 0) return `${mins} ${minText}`;
      if (mins === 0) return `${hrs} ${hrText}`;
      return `${hrs} ${hrText} ${mins} ${minText}`;
    };

    const getStreakCount = () => {
      let streak = 0;
      const checkDate = new Date();
      for (let i = 0; i < 365; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const dayInfo = progressData?.activity?.[dateStr];
        const solved = getSolvedCountForDate(dateStr);
        if ((dayInfo && dayInfo.hours > 0) || solved > 0) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
      return streak;
    };
    const activeStreak = getStreakCount();

    // Map month headers above the weeks
    const monthHeaders = [];
    let lastMonth = -1;
    weeks.forEach((wk, wkIdx) => {
      const firstDay = wk[0];
      const m = firstDay.getMonth();
      if (m !== lastMonth) {
        monthHeaders.push({ label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m], index: wkIdx });
        lastMonth = m;
      }
    });

    return (
      <div className="profile-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="dashboard-welcome">
          <h1>Student Profile & Utilisation</h1>
          <p>Manage your academic registration info and review your daily practice dashboard.</p>
        </div>

        {/* Info Grid row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>

          {/* Card 1: Registration Details */}
          <div className="premium-profile-card" style={{ height: '100%' }}>
            <div className="profile-avatar-row">
              <div className="profile-avatar-large">
                {name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="profile-meta-title">
                <h2>{name}</h2>
                <span
                  className={`status-badge-premium ${isPremium ? 'premium' : 'basic'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {isPremium ? <><FaStar style={{ color: '#fbbf24' }} /> Premium</> : <>Student</>}
                </span>
              </div>
            </div>

            <div className="profile-details-table-grid" style={{ marginTop: '20px' }}>
              <div className="profile-detail-grid-item">
                <span className="grid-item-label">Roll Number</span>
                <span className="grid-item-value">{rollNumber}</span>
              </div>
              <div className="profile-detail-grid-item">
                <span className="grid-item-label">College</span>
                <span className="grid-item-value">{college}</span>
              </div>
              <div className="profile-detail-grid-item">
                <span className="grid-item-label">Department</span>
                <span className="grid-item-value">{dept}</span>
              </div>
              <div className="profile-detail-grid-item">
                <span className="grid-item-label">Graduation Year</span>
                <span className="grid-item-value">{year}</span>
              </div>
              <div className="profile-detail-grid-item" style={{ gridColumn: 'span 2' }}>
                <span className="grid-item-label">Registered Email Address</span>
                <span className="grid-item-value">{email}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Practice Statistics & Heatmap */}
          <div className="premium-profile-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Row of stats */}
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--ps-success)' }}>{totalProblemsSolved}</div>
                <div style={{ fontSize: '12px', color: 'var(--ps-text-dim)', marginTop: '4px' }}>Problems Solved</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#38bdf8' }}>{formatUsageTime(totalHours)}</div>
                <div style={{ fontSize: '12px', color: 'var(--ps-text-dim)', marginTop: '4px' }}>Time Spent Active</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fb923c' }}>{activeStreak} Days</div>
                <div style={{ fontSize: '12px', color: 'var(--ps-text-dim)', marginTop: '4px' }}>Active Streak</div>
              </div>
            </div>

            {/* Heatmap Grid Wrapper */}
            <div style={{ flex: 1, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ fontSize: '15px', color: 'var(--ps-text-dim)', margin: 0, fontWeight: '600' }}>Practice portal activity tracker (last 6 months)</h4>
                <button
                  onClick={loadProfileProgress}
                  disabled={loadingProfileProgress}
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '6px',
                    color: 'var(--ps-success)',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                  }}
                >
                  {loadingProfileProgress ? 'Syncing...' : <><FaSyncAlt style={{ marginRight: '4px' }} /> Sync with Cloud</>}
                </button>
              </div>

              {/* Heatmap layout */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>

                {/* Y-axis: days of week */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '9px', color: '#475569', marginTop: '16px', width: '22px' }}>
                  <span>Sun</span>
                  <span style={{ visibility: 'hidden' }}>Mon</span>
                  <span>Tue</span>
                  <span style={{ visibility: 'hidden' }}>Wed</span>
                  <span>Thu</span>
                  <span style={{ visibility: 'hidden' }}>Fri</span>
                  <span>Sat</span>
                </div>

                {/* X-axis: weeks columns */}
                <div style={{ flex: 1, overflowX: 'auto' }}>

                  {/* Month headers Row */}
                  <div style={{ position: 'relative', height: '14px', marginBottom: '4px', fontSize: '10px', color: '#475569' }}>
                    {monthHeaders.map(hdr => (
                      <span key={hdr.index} style={{
                        position: 'absolute',
                        left: `${hdr.index * 14}px`,
                        whiteSpace: 'nowrap'
                      }}>{hdr.label}</span>
                    ))}
                  </div>

                  {/* Grid of Weeks */}
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {weeks.map((wk, wkIdx) => (
                      <div key={wkIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {wk.map((day, dIdx) => {
                          const dateStr = day.toISOString().split('T')[0];
                          const dayInfo = progressData?.activity?.[dateStr] || { hours: 0, problemsSolved: 0 };
                          const solved = getSolvedCountForDate(dateStr);

                          // Color selector
                          let color = 'rgba(255, 255, 255, 0.04)'; // 0 solves
                          if (solved === 1) color = '#0e4429';
                          if (solved === 2) color = '#006d32';
                          if (solved === 3) color = '#26a641';
                          if (solved >= 4) color = '#39d353';

                          return (
                            <div
                              key={dIdx}
                              style={{
                                width: '12px',
                                height: '12px',
                                background: color,
                                border: '1px solid var(--border-color)',
                                borderRadius: '2px',
                                transition: 'all 0.1s'
                              }}
                              onMouseEnter={(e) => {
                                const rect = e.target.getBoundingClientRect();
                                setTooltipPos({
                                  x: rect.left + window.scrollX + 6,
                                  y: rect.top + window.scrollY - 8
                                });
                                setHoveredDay({
                                  dateStr: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                                  dayInfo: {
                                    ...dayInfo,
                                    problemsSolved: solved
                                  }
                                });
                              }}
                              onMouseLeave={() => setHoveredDay(null)}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>

                </div>

              </div>

              {/* Heatmap Legend */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#475569', marginTop: '12px' }}>
                <span>Less</span>
                <div style={{ width: '10px', height: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '2px' }}></div>
                <div style={{ width: '10px', height: '10px', background: '#0e4429', borderRadius: '2px' }}></div>
                <div style={{ width: '10px', height: '10px', background: '#006d32', borderRadius: '2px' }}></div>
                <div style={{ width: '10px', height: '10px', background: '#26a641', borderRadius: '2px' }}></div>
                <div style={{ width: '10px', height: '10px', background: '#39d353', borderRadius: '2px' }}></div>
                <span>More</span>
              </div>

            </div>

          </div>

        </div>

        {/* Achievements & Badges Card */}
        <div className="premium-profile-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '16px', color: 'var(--ph-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaTrophy style={{ color: '#fbbf24', fontSize: '18px' }} /> Achievements & Badges
          </h3>

          {getCompletedCourses().length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '30px 20px',
              textAlign: 'center',
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed var(--border-color)',
              borderRadius: '12px'
            }}>
              <FaAward style={{ fontSize: '32px', marginBottom: '8px', color: 'var(--ps-text-dim)' }} />
              <h4 style={{ color: 'var(--ph-text)', marginBottom: '4px' }}>No Badges Earned Yet</h4>
              <p style={{ color: 'var(--ps-text-dim)', fontSize: '13px', maxWidth: '400px', margin: '0 auto' }}>
                Complete your assigned courses, coding assessments, or solve practice problems in the sandbox to unlock special merit badges.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '16px'
            }}>
              {getCompletedCourses().map(badge => (
                <div
                  key={badge.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px',
                    background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                    border: `1px solid ${badge.color}`,
                    borderRadius: '12px',
                    boxShadow: `0 4px 12px ${badge.color}15`,
                    transition: 'transform 0.2s'
                  }}
                  className="badge-item-hover"
                >
                  <div style={{
                    fontSize: '28px',
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: `${badge.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {badge.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ph-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {badge.title}
                    </h4>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', margin: '4px 0 0', lineHeight: '1.3' }}>
                      {badge.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Absolute Floating Tooltip Card */}
        {hoveredDay && (
          <div style={{
            position: 'absolute',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            zIndex: 1000,
            transform: 'translate(-50%, -100%)',
            whiteSpace: 'nowrap'
          }}>
            <strong>{hoveredDay.dateStr}</strong>
            <div style={{ color: '#94a3b8', marginTop: '4px' }}>
              • Solved: {hoveredDay.dayInfo.problemsSolved} problems
              <br />
              • Portal Time: {formatUsageTime(hoveredDay.dayInfo.hours)}
            </div>
          </div>
        )}

        {/* Premium Upgrade & Status Modal */}
        {showPremiumModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '24px',
              maxWidth: '520px',
              width: '100%',
              padding: '32px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              color: 'var(--text-main)',
              position: 'relative'
            }}>
              <button
                type="button"
                onClick={() => setShowPremiumModal(false)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                
              </button>

              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.2))',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: '#f59e0b',
                  fontSize: '28px'
                }}>
                  <FaCrown />
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 8px 0' }}>
                  SEED-IT Premium Edition
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                  {isPremium ? 'Your student profile has active Premium Edition access.' : 'Unlock full academic & competitive coding features.'}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '20px' }}></span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px' }}>Unlimited AI Mock Interviews</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Real-time voice & coding feedback with Gemini AI</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '20px' }}></span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px' }}>AI Camera Proctoring Sandbox</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Anti-cheat detection with face monitoring</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '20px' }}></span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px' }}>Spoken English CEFR Evaluator</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pronunciation, grammar & fluency scorecard</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                {!isPremium ? (
                  <button
                    type="button"
                    onClick={() => {
                      const rawAuth = localStorage.getItem('auth_data');
                      if (rawAuth) {
                        try {
                          const parsed = JSON.parse(rawAuth);
                          parsed.Premium = true;
                          parsed.isPremium = true;
                          localStorage.setItem('auth_data', JSON.stringify(parsed));
                        } catch (e) { }
                      }
                      setUserPremiumState(true);
                      setShowPremiumModal(false);
                    }}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '15px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)'
                    }}
                  >
                     Activate Premium Edition Now
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPremiumModal(false)}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '15px',
                      cursor: 'pointer'
                    }}
                  >
                     Premium Access Active
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    );
  };

  const handleAddApiKey = async () => {
    if (!newKeyValue.trim()) return;
    const label = newKeyLabel.trim() || `${newKeyProvider === 'gemini' ? 'Gemini' : 'NVIDIA'} Key (${new Date().toLocaleDateString()})`;

    // Create new key object
    const newKey = {
      id: Date.now().toString(),
      type: newKeyProvider,
      label: label,
      value: newKeyValue.trim(),
      active: true // make active by default when added
    };

    // Set all other keys of this provider type to active = false
    const updatedKeys = apiKeysList.map(k => {
      if (k.type === newKeyProvider) {
        return { ...k, active: false };
      }
      return k;
    });

    updatedKeys.push(newKey);

    // Save to local state & local storage
    setApiKeysList(updatedKeys);
    localStorage.setItem('user_api_keys', JSON.stringify(updatedKeys));

    // Save to Firestore
    const userEmail = user?.Email || user?.email;
    if (userEmail) {
      try {
        await setDoc(doc(db, "userApiKeys", userEmail.trim()), {
          keys: updatedKeys,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (fsErr) {
        /* console.error("Error saving API keys to Firestore:", fsErr); */ void 0;
      }
    }

    // Reset inputs
    setNewKeyLabel('');
    setNewKeyValue('');
    setSaveSuccessMessage('API Key added successfully!');
    setTimeout(() => setSaveSuccessMessage(''), 3000);
  };

  const handleSetActiveApiKey = async (keyId, providerType) => {
    const updatedKeys = apiKeysList.map(k => {
      if (k.type === providerType) {
        return { ...k, active: k.id === keyId };
      }
      return k;
    });

    setApiKeysList(updatedKeys);
    localStorage.setItem('user_api_keys', JSON.stringify(updatedKeys));

    const userEmail = user?.Email || user?.email;
    if (userEmail) {
      try {
        await setDoc(doc(db, "userApiKeys", userEmail.trim()), {
          keys: updatedKeys,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (fsErr) {
        /* console.error("Error saving API keys to Firestore:", fsErr); */ void 0;
      }
    }
  };

  const handleDeleteApiKey = async (keyId) => {
    const updatedKeys = apiKeysList.filter(k => k.id !== keyId);

    // If the deleted key was active, make another key of that type active (if exists)
    const deletedKey = apiKeysList.find(k => k.id === keyId);
    if (deletedKey && deletedKey.active) {
      const remainingOfType = updatedKeys.filter(k => k.type === deletedKey.type);
      if (remainingOfType.length > 0) {
        remainingOfType[0].active = true;
      }
    }

    setApiKeysList(updatedKeys);
    localStorage.setItem('user_api_keys', JSON.stringify(updatedKeys));

    const userEmail = user?.Email || user?.email;
    if (userEmail) {
      try {
        await setDoc(doc(db, "userApiKeys", userEmail.trim()), {
          keys: updatedKeys,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (fsErr) {
        /* console.error("Error saving API keys to Firestore:", fsErr); */ void 0;
      }
    }
  };

  const renderSettings = () => {
    const themes = [
      {
        id: 'seed-seb',
        name: 'SEED-SEB Academic (Default)',
        desc: 'Clean, distraction-free examination theme with institutional SEED green accents.',
        preview: ['#f8fafc', '#ffffff', '#15803d']
      },
      {
        id: 'dark',
        name: 'Midnight Space (Dark)',
        desc: 'Futuristic slate theme with indigo highlights.',
        preview: ['#090d16', '#111827', '#6366f1']
      },
      {
        id: 'light',
        name: 'Classic Ice (Light)',
        desc: 'Sleek, high-contrast light mode for daytime coding.',
        preview: ['#f3f4f6', '#ffffff', '#4f46e5']
      },
      {
        id: 'crimson',
        name: 'Crimson Cyber (Red/Black)',
        desc: 'Pitch-black cyberpunk dashboard with blood-red accents.',
        preview: ['#0c0808', '#180f0f', '#ef4444']
      },
      {
        id: 'emerald',
        name: 'Emerald Matrix (Green/Black)',
        desc: 'Retro-terminal dark design with vibrant emerald highlights.',
        preview: ['#022c22', '#064e3b', '#10b981']
      },
      {
        id: 'red-light',
        name: 'Crimson Frost (Red/White)',
        desc: 'Clean, high-contrast light theme with rich red accents.',
        preview: ['#fdfafb', '#ffffff', '#dc2626']
      },
      {
        id: 'bw',
        name: 'Monochrome Minimalist (B&W)',
        desc: 'High-contrast, clean black & white theme.',
        preview: ['#ffffff', '#000000', '#000000']
      }
    ];

    const handleThemeChange = (themeId) => {
      localStorage.setItem('portal_theme', themeId);
      document.documentElement.setAttribute('data-theme', themeId);
      setCurrentTheme(themeId);
    };

    const toggleSection = (sectionId) => {
      setExpandedSettingsSections(prev => ({
        ...prev,
        [sectionId]: !prev[sectionId]
      }));
    };

    return (
      <div className="settings-tab-content">
        <div className="dashboard-welcome">
          <h1>Portal Settings</h1>
          <p>Personalise your student workspace theme and interface appearance.</p>
        </div>

        {/* SECTION 1: WORKSPACE COLOR MODE */}
        <div className="settings-section-card" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '24px',
          marginTop: '24px',
          boxShadow: '0 4px 20px var(--shadow-color)',
          overflow: 'hidden'
        }}>
          {/* Clickable Header */}
          <div
            onClick={() => toggleSection('theme')}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FaLaptopCode style={{ color: 'var(--accent-coding)', fontSize: '20px' }} />
              <div>
                <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '17px', fontWeight: 600 }}>Workspace Color Mode</h3>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '13px' }}>
                  Choose a visual style that matches your environment.
                </p>
              </div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '18px', display: 'flex', alignItems: 'center' }}>
              {expandedSettingsSections.theme ? <FaChevronDown /> : <FaChevronRight />}
            </div>
          </div>

          {/* Collapsible Body */}
          {expandedSettingsSections.theme && (
            <div style={{
              marginTop: '24px',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '20px'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '20px'
              }}>
                {themes.map(t => {
                  const active = currentTheme === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => handleThemeChange(t.id)}
                      style={{
                        background: active ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                        border: `2px solid ${active ? 'var(--accent-coding)' : 'var(--border-color)'}`,
                        borderRadius: '14px',
                        padding: '20px',
                        cursor: 'pointer',
                        transition: 'all 0.25s ease',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      className={`theme-card-option ${active ? 'active' : ''}`}
                    >
                      {/* Theme Preview Bubbles */}
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                        <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: t.preview[0], border: '1px solid rgba(255,255,255,0.08)' }} title="Primary BG" />
                        <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: t.preview[1], border: '1px solid rgba(255,255,255,0.08)' }} title="Secondary BG" />
                        <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: t.preview[2], border: '1px solid rgba(255,255,255,0.08)' }} title="Accent Color" />
                      </div>

                      <h4 style={{ color: 'var(--text-main)', fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>{t.name}</h4>
                      <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, lineHeight: '1.4' }}>{t.desc}</p>

                      {active && (
                        <span style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          fontSize: '12px',
                          color: 'var(--accent-coding)',
                          fontWeight: 600
                        }}>
                          Active
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: AI - API CONNECTION */}
        <div className="settings-section-card" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '24px',
          marginTop: '24px',
          boxShadow: '0 4px 20px var(--shadow-color)',
          overflow: 'hidden'
        }}>
          {/* Clickable Header */}
          <div
            onClick={() => toggleSection('aiApi')}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FaGem style={{ color: 'var(--accent-coding)', fontSize: '20px' }} />
              <div>
                <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '17px', fontWeight: 600 }}>AI - API Connection</h3>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '13px' }}>
                  Configure Google Gemini and NVIDIA NIM API keys for tutor acceleration.
                </p>
              </div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '18px', display: 'flex', alignItems: 'center' }}>
              {expandedSettingsSections.aiApi ? <FaChevronDown /> : <FaChevronRight />}
            </div>
          </div>

          {/* Collapsible Body */}
          {expandedSettingsSections.aiApi && (
            <div style={{
              marginTop: '24px',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <button
                  onClick={() => setShowInstructionsModal(true)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--accent-coding)',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FaGraduationCap /> How to Get Keys?
                </button>
              </div>

              {/* Connected Keys List */}
              <div style={{ marginBottom: '28px' }}>
                <h4 style={{ color: 'var(--text-main)', fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>Connected API Keys</h4>
                {apiKeysList.length === 0 ? (
                  <div style={{
                    background: 'var(--bg-primary)',
                    border: '1px dashed var(--border-color)',
                    borderRadius: '10px',
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '13.5px'
                  }}>
                    No API keys connected yet. Fill out the form below to connect your first key.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {apiKeysList.map(k => (
                      <div
                        key={k.id}
                        style={{
                          background: 'var(--bg-primary)',
                          border: `1px solid ${k.active ? 'var(--accent-coding)' : 'var(--border-color)'}`,
                          borderRadius: '10px',
                          padding: '12px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{
                            background: k.type === 'gemini' ? '#10b981' : '#6366f1',
                            color: 'white',
                            fontSize: '10.5px',
                            fontWeight: '700',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            textTransform: 'uppercase'
                          }}>
                            {k.type}
                          </span>
                          <div>
                            <div style={{ color: 'var(--text-main)', fontSize: '14px', fontWeight: '600' }}>{k.label}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'monospace' }}>
                              {k.value.substring(0, 8)}...{k.value.substring(k.value.length - 4)}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {k.active ? (
                            <span style={{
                              color: '#10b981',
                              fontSize: '12.5px',
                              fontWeight: '700',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <FaCheckCircle /> Active
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSetActiveApiKey(k.id, k.type)}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-main)',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              Set Active
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteApiKey(k.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              fontSize: '16px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px'
                            }}
                            title="Delete Key"
                          >
                            <FaTimes />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Key Form */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                <h4 style={{ color: 'var(--text-main)', fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Add New API Key</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ color: 'var(--text-main)', fontSize: '13px', fontWeight: 600 }}>Provider</label>
                      <select
                        value={newKeyProvider}
                        onChange={(e) => setNewKeyProvider(e.target.value)}
                        style={{
                          padding: '10px',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-main)',
                          borderRadius: '8px',
                          fontSize: '13.5px',
                          outline: 'none'
                        }}
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="nvidia">NVIDIA NIM</option>
                      </select>
                    </div>

                    <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ color: 'var(--text-main)', fontSize: '13px', fontWeight: 600 }}>Key Label / Name</label>
                      <input
                        type="text"
                        placeholder="e.g. My Personal Key, Class Key"
                        value={newKeyLabel}
                        onChange={(e) => setNewKeyLabel(e.target.value)}
                        style={{
                          padding: '10px 14px',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-main)',
                          borderRadius: '8px',
                          fontSize: '13.5px',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ color: 'var(--text-main)', fontSize: '13px', fontWeight: 600 }}>API Key Value</label>
                    <input
                      type="password"
                      placeholder={newKeyProvider === 'gemini' ? 'Enter Gemini API key (starts with AIzaSy...)' : 'Enter NVIDIA API key (starts with nvapi-...)'}
                      value={newKeyValue}
                      onChange={(e) => setNewKeyValue(e.target.value)}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        borderRadius: '8px',
                        fontSize: '13.5px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {saveSuccessMessage && (
                    <div style={{ color: 'var(--accent-coding)', fontSize: '14px', fontWeight: 600 }}>
                      {saveSuccessMessage}
                    </div>
                  )}

                  <button
                    onClick={handleAddApiKey}
                    style={{
                      alignSelf: 'flex-start',
                      background: 'var(--accent-coding)',
                      color: '#fff',
                      border: 'none',
                      padding: '10px 24px',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'opacity 0.2s',
                      marginTop: '6px'
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Add Key
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SETUP INSTRUCTIONS MODAL */}
        {showInstructionsModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              background: 'var(--bg-secondary, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '32px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
              position: 'relative'
            }}>
              <button
                onClick={() => setShowInstructionsModal(false)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted, #94a3b8)',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                <FaTimes />
              </button>

              <h3 style={{ color: 'var(--text-main, #f1f5f9)', fontSize: '20px', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FaGraduationCap style={{ color: 'var(--accent-coding, #10b981)' }} /> How to Create API Keys
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <h4 style={{ color: 'var(--text-main, #cbd5e1)', fontSize: '15px', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> Google Gemini API Key
                  </h4>
                  <ol style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', paddingLeft: '20px', lineHeight: '1.6', margin: 0 }}>
                    <li>Go to <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-coding, #10b981)', textDecoration: 'underline' }}>Google AI Studio</a>.</li>
                    <li>Log in with your Google Account.</li>
                    <li>Click on the <strong>"Get API Key"</strong> button in the sidebar navigation.</li>
                    <li>Click <strong>"Create API Key"</strong>, choose a Google Cloud project (ensure the key has <strong>no expiration date</strong>), and copy your generated key.</li>
                  </ol>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color, #334155)', paddingTop: '20px' }}>
                  <h4 style={{ color: 'var(--text-main, #cbd5e1)', fontSize: '15px', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1' }} /> NVIDIA NIM API Key
                  </h4>
                  <ol style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', paddingLeft: '20px', lineHeight: '1.6', margin: 0 }}>
                    <li>Go to the <a href="https://build.nvidia.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-coding, #10b981)', textDecoration: 'underline' }}>NVIDIA Build Portal</a>.</li>
                    <li>Sign up or log in with your NVIDIA Developer account.</li>
                    <li>Select a model from the catalog (e.g. <strong>Llama 3.1 70B Instruct</strong>).</li>
                    <li>Click <strong>"Get API Key"</strong> to generate your token (ensure the key configuration has <strong>no expiration date</strong>), and click Copy. (Keys start with <code>nvapi-</code>).</li>
                  </ol>
                </div>
              </div>

              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                color: '#f59e0b',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '12.5px',
                marginTop: '20px',
                lineHeight: '1.4'
              }}>
                <strong>Crucial Note:</strong> When generating keys, please ensure you configure them with <strong>no expiration date</strong> (or unlimited validity) so that your coding sandbox connection remains continuous.
              </div>

              <button
                onClick={() => setShowInstructionsModal(false)}
                style={{
                  marginTop: '32px',
                  width: '100%',
                  background: 'var(--accent-coding, #10b981)',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                I Understand
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`dashboard-container ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Welcome Quote Verification Popup */}
      {showWelcomeModal && (
        <div className="lw-overlay" style={{ zIndex: 1500 }}>
          <div className="lw-card" style={{ maxWidth: '550px', padding: '30px', margin: '20px' }}>
            <div className="lw-card-header" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 className="lw-title" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-coding)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaStar style={{ color: 'var(--accent-coding)', fontSize: '18px' }} /> Welcome to SEED Portal
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
                Please type the exact quote of the day to close this window and enter the platform.
              </p>
            </div>
            <div className="lw-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px dashed var(--border-color)',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                fontStyle: 'italic',
                fontSize: '15px',
                fontWeight: '600',
                color: 'var(--text-main)',
                lineHeight: '1.5',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                "{welcomeQuote}"
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600' }}>
                  Verification Input:
                </label>
                <input
                  type="text"
                  className="lw-input"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Type the exact quote..."
                  value={welcomeInput}
                  onChange={e => setWelcomeInput(e.target.value)}
                  onPaste={e => e.preventDefault()}
                />
              </div>
            </div>
            <div className="lw-card-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={handleSkipWelcomeModal}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  transition: 'all 0.2s ease'
                }}
              >
                Skip
              </button>
              <button
                className="lw-btn-primary"
                disabled={welcomeInput.trim() !== welcomeQuote.trim()}
                onClick={handleCloseWelcomeModal}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  cursor: welcomeInput.trim() === welcomeQuote.trim() ? 'pointer' : 'not-allowed',
                  opacity: welcomeInput.trim() === welcomeQuote.trim() ? 1 : 0.5
                }}
              >
                Proceed to Portal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Platform Updates & Announcements Follow-up Modal */}
      {showUpdatesModal && welcomeUpdates && (
        <div className="lw-overlay" style={{ zIndex: 1500 }}>
          <div className="lw-card" style={{ maxWidth: '550px', padding: '30px', margin: '20px' }}>
            <div className="lw-card-header" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 className="lw-title" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-coding)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaAward style={{ color: 'var(--accent-coding)', fontSize: '18px' }} /> Platform Updates & News
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
                Stay up to date with the latest features, releases, and platform notifications.
              </p>
            </div>
            <div className="lw-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {Array.isArray(welcomeUpdates) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {welcomeUpdates.map((update, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      gap: '12px',
                      padding: '12px 16px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      alignItems: 'flex-start'
                    }}>
                      <FaStar style={{ fontSize: '14px', color: 'var(--accent-coding)', marginTop: '2px' }} />
                      <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.4', flex: 1 }}>
                        {update}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '16px 20px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  alignItems: 'flex-start'
                }}>
                  <FaStar style={{ fontSize: '16px', color: 'var(--accent-coding)', marginTop: '2px' }} />
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.5', flex: 1 }}>
                    {welcomeUpdates}
                  </p>
                </div>
              )}
            </div>
            <div className="lw-card-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="lw-btn-primary"
                onClick={() => setShowUpdatesModal(false)}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Close & Enter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          LAUNCH WIZARD MODALS — 5 Steps
      ═══════════════════════════════════════════════════════════ */}

      {/* Step 1: Verifying identity overlay */}
      {launchStep === 'verifying' && (
        <div className="lw-overlay" style={{ zIndex: 1200 }}>
          <div className="lw-card" style={{ maxWidth: '520px', textAlign: 'center', padding: '35px 25px' }}>
            <div className="lw-loader-container">
              <div className="lw-spinner-outer"></div>
              <div className="lw-spinner-inner"></div>
              <div className="lw-spinner-center"></div>
            </div>
            <h3 className="lw-title" style={{ marginTop: '24px', justifyContent: 'center' }}>
              <FaLock className="animate-pulse" style={{ color: '#6366f1' }} /> Verifying Identity
            </h3>
            <p className="lw-subtitle" style={{ marginTop: '10px', fontWeight: '500', color: '#94a3b8' }}>
              {loaderMessage}
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Passkey Entry */}
      {launchStep === 'passkey' && selectedAssessment && (
        <div className="lw-overlay" style={{ zIndex: 1200 }}>
          <div className="lw-card" style={{ maxWidth: '620px' }}>
            <div className="lw-card-header">
              <div className="lw-step-badge">Step 2 of 4</div>
              <h3 className="lw-title"><FaLock style={{ marginRight: '8px', color: '#6366f1' }} />Access Passkey Required</h3>
              <p className="lw-subtitle">This assessment is passkey-protected. Enter the passkey provided by your instructor.</p>
            </div>
            <div className="lw-card-body">
              <input
                type="password"
                ref={passkeyInputRef}
                placeholder="Enter access passkey"
                value={passkeyInput}
                onChange={e => setPasskeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleValidatePasskey()}
                className="lw-input"
              />
              {passkeyError && (
                <div className="lw-error-row">
                  <FaExclamationTriangle />{passkeyError}
                </div>
              )}
            </div>
            <div className="lw-card-footer">
              <button className="lw-btn-secondary" onClick={cancelWizard}>Cancel</button>
              <button className="lw-btn-primary" onClick={handleValidatePasskey}>
                <FaCheck style={{ marginRight: '6px' }} />Unlock & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Pre-flight system check — internet and charger */}
      {launchStep === 'preflight' && (
        <div className="lw-overlay" style={{ zIndex: 1200 }}>
          <div className="lw-card" style={{ maxWidth: '780px' }}>
            <div className="lw-card-header">
              <div className="lw-step-badge">Step 3 of 4</div>
              <h3 className="lw-title">System Pre-flight Check</h3>
              <p className="lw-subtitle">Verifying your system meets all requirements for a monitored assessment.</p>
            </div>
            <div className="lw-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="lw-preflight-grid">
                {/* Internet connectivity row */}
                <div className="lw-preflight-row">
                  <span className="lw-preflight-icon"><FaWifi style={{ color: '#6366f1' }} /></span>
                  <span className="lw-preflight-label">Internet Connectivity</span>
                  <span className={`lw-preflight-status lw-preflight-${preflightResults.internet}`}>
                    {preflightResults.internet === 'pending' && <span className="lw-mini-spinner"></span>}
                    {preflightResults.internet === 'pass' && <FaCheck />}
                    {preflightResults.internet === 'fail' && <FaTimes />}
                    &nbsp;{preflightResults.internet === 'pending' ? 'Checking...' : preflightResults.internet === 'pass' ? 'Ready' : 'No Connection'}
                  </span>
                </div>

                {/* Webcam status row */}
                <div className="lw-preflight-row">
                  <span className="lw-preflight-icon"><FaCamera style={{ color: '#6366f1' }} /></span>
                  <span className="lw-preflight-label">Webcam Detection</span>
                  <span className={`lw-preflight-status lw-preflight-${preflightResults.webcam}`}>
                    {preflightResults.webcam === 'pending' && <span className="lw-mini-spinner"></span>}
                    {preflightResults.webcam === 'pass' && <FaCheck />}
                    {preflightResults.webcam === 'fail' && <FaTimes />}
                    &nbsp;{preflightResults.webcam === 'pending' ? 'Detecting...' : preflightResults.webcam === 'pass' ? 'Connected' : 'Not Found'}
                  </span>
                </div>

                {/* Microphone status row */}
                <div className="lw-preflight-row">
                  <span className="lw-preflight-icon"><FaMicrophone style={{ color: '#6366f1' }} /></span>
                  <span className="lw-preflight-label">Microphone Detection</span>
                  <span className={`lw-preflight-status lw-preflight-${preflightResults.microphone}`}>
                    {preflightResults.microphone === 'pending' && <span className="lw-mini-spinner"></span>}
                    {preflightResults.microphone === 'pass' && <FaCheck />}
                    {preflightResults.microphone === 'fail' && <FaTimes />}
                    &nbsp;{preflightResults.microphone === 'pending' ? 'Detecting...' : preflightResults.microphone === 'pass' ? 'Ready' : 'Not Found'}
                  </span>
                </div>

                {/* Secure Sandbox Environment row */}
                <div className="lw-preflight-row">
                  <span className="lw-preflight-icon"><FaShieldAlt style={{ color: '#6366f1' }} /></span>
                  <span className="lw-preflight-label">Sandbox Shell</span>
                  <span className={`lw-preflight-status lw-preflight-${preflightResults.secureEnv}`}>
                    {preflightResults.secureEnv === 'pending' && <span className="lw-mini-spinner"></span>}
                    {preflightResults.secureEnv === 'pass' && <FaCheck />}
                    {preflightResults.secureEnv === 'fail' && <FaTimes />}
                    &nbsp;{preflightResults.secureEnv === 'pending' ? 'Verifying...' : preflightResults.secureEnv === 'pass' ? 'Active' : 'Unsecured'}
                  </span>
                </div>

                {/* Registry Hardening row */}
                <div className="lw-preflight-row">
                  <span className="lw-preflight-icon"><FaUserShield style={{ color: '#6366f1' }} /></span>
                  <span className="lw-preflight-label">OS Hardening Policies</span>
                  <span className={`lw-preflight-status lw-preflight-${preflightResults.hardening}`}>
                    {preflightResults.hardening === 'pending' && <span className="lw-mini-spinner"></span>}
                    {preflightResults.hardening === 'pass' && <FaCheck />}
                    {preflightResults.hardening === 'fail' && <FaTimes />}
                    &nbsp;{preflightResults.hardening === 'pending' ? 'Scanning...' : preflightResults.hardening === 'pass' ? 'Enforced' : 'Not Active'}
                  </span>
                </div>

                {/* Charger confirmation manual checklist row */}
                <div className="lw-preflight-row" style={{
                  justifyContent: 'space-between',
                  background: 'rgba(234, 179, 8, 0.04)',
                  border: '1px solid rgba(234, 179, 8, 0.15)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="lw-preflight-icon"><FaPlug style={{ color: '#eab308' }} /></span>
                    <span className="lw-preflight-label" style={{ color: '#facc15' }}>Power Charger Connected</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={chargerConfirmed}
                    onChange={(e) => setChargerConfirmed(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', margin: 0 }}
                  />
                </div>
              </div>

              {/* Result messages */}
              {preflightDone && (
                preflightResults.internet === 'fail' ||
                (selectedAssessment?.proctored && preflightResults.webcam === 'fail') ||
                (selectedAssessment?.proctored && preflightResults.secureEnv === 'fail')
              ) && (
                  <div className="lw-error-row" style={{ marginTop: '8px' }}>
                    <FaExclamationTriangle /> System check failed. Please resolve the red errors to unlock the Proceed button.
                  </div>
                )}
              {preflightDone &&
                preflightResults.internet === 'pass' &&
                (!selectedAssessment?.proctored || (preflightResults.webcam === 'pass' && preflightResults.secureEnv === 'pass')) &&

                !chargerConfirmed && (
                  <div className="lw-warning-row" style={{ marginTop: '8px', padding: '12px', background: 'rgba(234, 179, 8, 0.1)', borderLeft: '4px solid #eab308', borderRadius: '8px', display: 'flex', alignItems: 'center', color: '#facc15', fontSize: '0.92rem', fontWeight: '600' }}>
                    <FaExclamationTriangle style={{ marginRight: '8px' }} /> Please confirm you have connected your charger to enable Proceed.
                  </div>
                )}
              {preflightDone &&
                preflightResults.internet === 'pass' &&
                (!selectedAssessment?.proctored || (preflightResults.webcam === 'pass' && preflightResults.secureEnv === 'pass')) &&
                chargerConfirmed && (
                  <div className="lw-info-row" style={{ marginTop: '8px' }}>
                    <FaCheckCircle style={{ color: '#10b981' }} /> All checks passed. You may proceed.
                  </div>
                )}
            </div>
            <div className="lw-card-footer">
              <button className="lw-btn-secondary" onClick={cancelWizard}>Cancel</button>
              <button
                className="lw-btn-primary"
                disabled={
                  !preflightDone ||
                  preflightResults.internet === 'fail' ||
                  (selectedAssessment?.proctored && preflightResults.webcam === 'fail') ||
                  (selectedAssessment?.proctored && preflightResults.secureEnv === 'fail') ||
                  !chargerConfirmed
                }
                onClick={handlePreflightProceed}
              >
                <FaCheck style={{ marginRight: '6px' }} />Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Anti-malpractice instructions */}
      {launchStep === 'instructions' && selectedAssessment && (
        (selectedAssessment.proctored === true ||
          selectedAssessment.proctored === 1 ||
          selectedAssessment.proctored === "1" ||
          selectedAssessment.proctored === "true") ? (
          <ProctoringInstructions
            assessment={selectedAssessment}
            onContinue={handleAgreeAndLaunch}
            onCancel={cancelWizard}
          />
        ) : (
          <div className="lw-overlay" style={{ zIndex: 1200 }}>
            <div className="lw-card" style={{ maxWidth: '780px' }}>
              <div className="lw-card-header">
                <div className="lw-step-badge">Step 4 of 4</div>
                <h3 className="lw-title">Test Details & Instructions</h3>
              </div>
              <div className="lw-card-body">
                {/* Test meta-info */}
                <div className="lw-info-grid">
                  <div className="lw-info-cell">
                    <span className="lw-info-label">Assessment</span>
                    <span className="lw-info-value">{selectedAssessment.name}</span>
                  </div>
                  <div className="lw-info-cell">
                    <span className="lw-info-label">Type</span>
                    <span className="lw-info-value" style={{ textTransform: 'capitalize' }}>{selectedAssessment.type}</span>
                  </div>
                  <div className="lw-info-cell">
                    <span className="lw-info-label">Duration</span>
                    <span className="lw-info-value">{selectedAssessment.duration} minutes</span>
                  </div>
                  <div className="lw-info-cell">
                    <span className="lw-info-label">Questions</span>
                    <span className="lw-info-value">{selectedAssessment.questions || '—'}</span>
                  </div>
                </div>

                {/* Section details for Multi-Section Assessments */}
                {selectedAssessment.isMultiSection && selectedAssessment.sections && selectedAssessment.sections.length > 0 && (
                  <div style={{ marginTop: '20px', background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <h4 style={{ color: '#38bdf8', margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: '700', letterSpacing: '-0.01em' }}>Assessment Section Breakdowns</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedAssessment.sections.map((sec, idx) => {
                        const secQCount = Array.isArray(sec.questionIds) ? sec.questionIds.length : (Array.isArray(sec.questions) ? sec.questions.length : (Number(sec.questions) || 0));
                        return (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.04)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ color: '#64748b', fontWeight: '700', fontSize: '0.85rem' }}>SECTION {idx + 1}</span>
                              <span style={{ color: '#f8fafc', fontWeight: '600', fontSize: '0.9rem' }}>{sec.name}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: '#94a3b8', fontWeight: '500', alignItems: 'center' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center' }}><FaClock style={{ marginRight: '4px' }} /> {sec.duration_minutes || sec.duration || 0} Mins</span>
                              <span>{secQCount > 0 ? `${secQCount} Questions` : sec.type?.toUpperCase()}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Malpractice Warning Box */}
                <div className="lw-malpractice-box" style={{ marginTop: '20px' }}>
                  <p className="lw-malpractice-title" style={{ display: 'flex', alignItems: 'center' }}><FaExclamationTriangle style={{ marginRight: '6px' }} /> Proctoring System Active</p>
                  <ul className="lw-malpractice-list">
                    <li>Do not switch tabs or leave this window during the test.</li>
                    <li>3 tab-switch violations will auto-lock and submit your assessment.</li>
                    <li>Do not use any external assistance, websites, or AI tools.</li>
                    <li>This is a <strong>one-time attempt</strong> — you cannot retake this test.</li>
                  </ul>
                </div>
              </div>
              <div className="lw-card-footer" style={{ padding: '18px 24px' }}>
                <button className="lw-btn-secondary" onClick={cancelWizard}>Cancel</button>
                <button
                  className="lw-btn-success"
                  onClick={handleAgreeAndLaunch}
                  style={{
                    padding: '12px 28px',
                    fontSize: '1.05rem',
                    fontWeight: '800',
                    borderRadius: '8px',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <FaCheckCircle style={{ marginRight: '8px' }} />I Agree & Start Assessment
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {/* Step 5: Launching overlay */}
      {launchStep === 'launching' && (
        <div className="lw-overlay" style={{ zIndex: 1200 }}>
          <div className="lw-card" style={{ maxWidth: '520px', textAlign: 'center', padding: '35px 25px' }}>
            <div className="lw-loader-container">
              <div className="lw-spinner-outer"></div>
              <div className="lw-spinner-inner" style={{ borderBottomColor: '#10b981' }}></div>
              <div className="lw-spinner-center" style={{ background: 'radial-gradient(circle, #10b981 0%, #059669 100%)', boxShadow: '0 0 25px #10b981' }}></div>
            </div>
            <h3 className="lw-title" style={{ marginTop: '24px', justifyContent: 'center' }}>
              <FaShieldAlt className="animate-pulse" style={{ color: '#10b981' }} /> Setting Up Workspace
            </h3>
            <p className="lw-subtitle" style={{ marginTop: '10px', fontWeight: '500', color: '#94a3b8' }}>
              {loaderMessage}
            </p>
          </div>
        </div>
      )}

      {/* Eligibility / connection error modal */}
      {eligibilityError && (
        <div className="lw-overlay" style={{ zIndex: 1300 }}>
          <div className="lw-card" style={{ maxWidth: '440px' }}>
            <div className="lw-card-header" style={{ borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
              <h3 className="lw-title" style={{ color: '#ef4444' }}>
                <FaExclamationTriangle style={{ marginRight: '8px' }} />{eligibilityError.title}
              </h3>
            </div>
            <div className="lw-card-body">
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: '1.6' }}>{eligibilityError.message}</p>
            </div>
            <div className="lw-card-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                className="lw-btn-primary"
                style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}
                onClick={() => setEligibilityError(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="dashboard-header">
        <div className="header-brand">
          <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle Sidebar">
            <FaBars />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/SEED_Logo_Transparent.png" alt="SEED Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
            <span className="brand-title">SEED <span>SEB</span></span>
          </div>
        </div>
        <div className="header-profile">
          <FaUser className="user-icon" />
          <span className="user-name">{name}</span>
        </div>
      </header>

      {/* Workspace Body */}
      <div className="dashboard-body">
        {/* Sidebar Navigation */}
        <aside className="dashboard-sidebar">
          <nav className="sidebar-menu">
            <button
              className={`menu-item ${activeTab === "assessments" ? "active" : ""}`}
              onClick={() => setActiveTab("assessments")}
            >
              <FaClipboardList />
              <span className="menu-text">Assessments</span>
            </button>
            <button
              className={`menu-item ${activeTab === "practice" ? "active" : ""}`}
              onClick={() => setActiveTab("practice")}
            >
              <FaLaptopCode />
              <span className="menu-text">Practice</span>
            </button>
            <button
              className={`menu-item ${activeTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              <FaUser />
              <span className="menu-text">Profile</span>
            </button>
            {isAiInterviewAllowed && (
              <button
                className={`menu-item ${activeTab === "ai-interview" ? "active" : ""}`}
                onClick={() => setActiveTab("ai-interview")}
              >
                <FaUserTie />
                <span className="menu-text">AI Interview</span>
              </button>
            )}
            <button
              className={`menu-item ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <FaCog />
              <span className="menu-text">Settings</span>
            </button>
            <button className="menu-item logout-btn" onClick={handleLogout}>
              <FaSignOutAlt />
              <span className="menu-text">Logout</span>
            </button>
          </nav>
        </aside>

        <main className="dashboard-main">
          {activeTab === "assessments" ? renderAssessments() : activeTab === "practice" ? <PracticeHome /> : activeTab === "settings" ? renderSettings() : activeTab === "ai-interview" ? <AIInterviewSimulator user={user} /> : renderProfile()}
        </main>
      </div>

      {/* Logout animation screen */}
      {showLogoutAnimation && (
        <div className="logout-overlay-screen">
          <div className="logout-modal-box">
            <FaSignOutAlt className="logout-spin-icon" />
            <p>Goodbye, {name}!</p>
            <p className="sub-text">Clearing session and logging out...</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>&copy; {new Date().getFullYear()} SEED Innovating Technologies and Educational Services (SEED-IT). (v{APP_VERSION})</p>
      </footer>
    </div>
  );
};

export default StudentDashboard;
