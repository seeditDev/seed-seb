import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { APP_VERSION } from "../App";
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
  FaExclamationTriangle,
  FaWifi,
  FaPlug,
  FaCamera,
  FaMicrophone,
  FaUserShield,
  FaCog,
  FaUserTie
} from "react-icons/fa";
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/StudentDashboard.css';
import TrackingService from '../services/trackingService';
import DataService from '../services/dataService';
import MCQService from '../services/mcqService';
import CodingAssessmentService from '../services/codingAssessmentService';
import timeService from '../services/timeService';
import ProctoringInstructions from './ProctoringInstructions';
import PracticeHome from './PracticeHome';
import AIInterviewSimulator from './AIInterviewSimulator';

const LOCAL_BASE_URL = '/seed-contents';
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';
const GITHUB_API_URL = 'https://api.github.com/repos/seeditDev/seed-contents/contents';

const _0x5f = 'Z2l0aHViX3Bh';
const _0x4e = 'dF8xMUJDT1FG';
const _0x3d = 'Q0EwYU1RcHVi';
const _0x2c = 'SmZ0dk9xX3Nv';
const _0x1b = 'S0lDWlVyNVY4';
const _0xa0 = 'ZHN5ckZsTDVa';
const _0xb1 = 'SW5IZWNXYjYw';
const _0xc2 = 'd1ZEdEpsR1dY';
const _0xd3 = 'dG56bWZDUUZK';
const _0xe4 = 'UU9KTjJBZDhocEZO';

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
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('portal_theme') || 'dark';
  });

  // Assessments List State
  const [assessments, setAssessments] = useState([]);
  const [filteredAssessments, setFilteredAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        const githubRes = await fetch("https://raw.githubusercontent.com/seeditDev/SEEDDB/main/Premium/ai-interview.json");
        if (githubRes.ok) {
          const list = await githubRes.json();
          if (Array.isArray(list)) {
            const allowed = list.some(email => String(email).trim().toLowerCase() === userEmail);
            setIsAiInterviewAllowed(allowed);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch AI Interview access list from GitHub:", err);
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
        const res = await fetch("https://raw.githubusercontent.com/seeditDev/seed-contents/main/welcome.json");
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object' && !Array.isArray(data)) {
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
    if (authData.Email || authData.email || authData.Name) {
      setUser(authData);
      loadAssessments(authData);
    } else {
      navigate("/login");
    }
  }, [navigate]);

  // Automatically load free local storage progress on tab visit to ensure instant updates
  useEffect(() => {
    if (activeTab === "profile" && user) {
      const email = user.Email || user.email;
      if (email) {
        import('../services/codingProgressService').then(({ getFullProgress }) => {
          getFullProgress(email).then(progress => {
            setProgressData(progress);
          });
        });
      }
    }
  }, [activeTab, user]);

  const loadAssessments = async (userData) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch access control configurations
      const accessControlData = await DataService.getAccessControl();

      const departmentAccess = accessControlData?.access_control?.colleges?.[userData.College]?.[userData.Year]?.[userData.Department];
      if (!departmentAccess) {
        setAssessments([]);
        setFilteredAssessments([]);
        setLoading(false);
        return;
      }

      const allowedModuleIds = departmentAccess.allowed_modules || [];
      const isPremiumUser = userData?.Premium === true || userData?.Premium === 'true' || userData?.Premium === 1 || userData?.Premium === 'Yes' || !!userData?.isPremium;

      // Helper to compile modules from direct course.modules and nested course.subcourses[subId].modules
      const extractAllModules = (course) => {
        if (!course) return {};
        const modules = {};
        if (course.modules) {
          Object.assign(modules, course.modules);
        }
        if (course.subcourses) {
          Object.values(course.subcourses).forEach(sub => {
            if (sub.modules) {
              Object.assign(modules, sub.modules);
            }
          });
        }
        return modules;
      };

      // 2. Parse MCQ and Coding Modules from all assessment-flagged courses
      const mcqList = [];
      const codingList = [];

      Object.entries(accessControlData?.courses || {}).forEach(([courseId, course]) => {
        const isAssessment = !!course.isAssessment || courseId === 'assessments' || courseId === 'mcqs';
        if (!isAssessment) return; // skip practice courses

        const courseModules = extractAllModules(course);
        Object.entries(courseModules)
          .filter(([key, module]) => {
            const isPremiumModule = !!module.isPremium;
            const premiumAccess = !isPremiumModule || isPremiumUser;
            return allowedModuleIds.includes(module.id) && premiumAccess;
          })
          .forEach(([key, module]) => {
            const derivedSlug = module.slug || slugify(module.id || module.name || key);

            // Determine if it's MCQ or Coding. If module.type is 'mcq' or 'coding', use that.
            // Fallback to courseId or prefix checking (e.g. prefix is 'MA' -> mcq, 'CA' -> coding)
            let type = module.type;
            if (!type) {
              if (courseId === 'mcqs' || module.id?.startsWith('MA') || module.url?.includes('mcqs/')) {
                type = 'mcq';
              } else {
                type = 'coding';
              }
            }

            let finalUrl = module.url || '';
            if (finalUrl && !finalUrl.endsWith('.json')) {
              if (module.slug) {
                finalUrl = `/${type}/${module.slug}.json`;
              } else if (finalUrl.startsWith(`/student/${type}/`)) {
                const slugFromUrl = finalUrl.split('/').filter(Boolean).pop();
                finalUrl = `/${type}/${slugFromUrl}.json`;
              } else {
                finalUrl = `/${type}/${slugify(module.name || key)}.json`;
              }
            }

            const item = {
              key,
              id: module.id,
              name: module.name,
              url: finalUrl,
              passkey: module.passkey,
              schedule: module.schedule,
              difficulty: module.difficulty || 'Medium',
              duration: module.duration_minutes || 60,
              slug: derivedSlug,
              type,
              isMultiSection: !!module.isMultiSection,
              sections: module.sections || [],
              proctored: module.proctored,
              maxViolations: module.maxViolations,
              display_order: typeof module.display_order === 'number' ? module.display_order : (typeof module.displayOrder === 'number' ? module.displayOrder : 9999),
              questionIds: module.questionIds || (Array.isArray(module.questions) ? module.questions : []),
              questions: Array.isArray(module.questions) ? module.questions.length : (typeof module.questions === 'number' ? module.questions : (module.questionIds?.length || 0))
            };

            if (type === 'coding') {
              item.languages = module.languages || ["c", "cpp", "java", "python"];
              codingList.push(item);
            } else {
              mcqList.push(item);
            }
          });
      });

      const combined = [...mcqList, ...codingList];

      // Sort combined array based on availability status, display order, and date/time
      combined.sort((a, b) => {
        const statusPriority = { "Active": 0, "Upcoming": 1, "Expired": 2 };
        const statusA = getScheduleStatus(a.schedule).status;
        const statusB = getScheduleStatus(b.schedule).status;

        const priorityA = statusPriority[statusA] ?? 99;
        const priorityB = statusPriority[statusB] ?? 99;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // Secondary sort: display_order (ascending)
        const orderA = typeof a.display_order === 'number' ? a.display_order : 9999;
        const orderB = typeof b.display_order === 'number' ? b.display_order : 9999;
        if (orderA !== orderB) {
          return orderA - orderB;
        }

        // Tertiary sort: startDate (ascending)
        const dateA = a.schedule?.startDate || '';
        const dateB = b.schedule?.startDate || '';
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }

        // Quaternary sort: startTime (ascending)
        const timeA = a.schedule?.startTime || '';
        const timeB = b.schedule?.startTime || '';
        return timeA.localeCompare(timeB);
      });

      // Check attempt status for each assessment in parallel to determine completion
      const statusPromises = combined.map(async (item) => {
        try {
          if (item.type === 'mcq') {
            const check = await MCQService.checkExistingAttempt(
              userData.Email || userData.email,
              item.id,
              userData.College,
              userData.Year,
              userData.Department
            );
            item.completed = !!check?.completed;
          } else {
            const check = await CodingAssessmentService.checkExistingAttempt(
              userData.Email || userData.email,
              item.id,
              userData.College,
              userData.Year,
              userData.Department
            );
            item.completed = !!check?.completed;
          }
        } catch (e) {
          console.warn("Failed to check status for assessment:", item.id, e);
          item.completed = false;
        }
      });
      await Promise.all(statusPromises);

      setAssessments(combined);
      setFilteredAssessments(combined);
    } catch (err) {
      console.error("Failed to load assessments map:", err);
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

  // Fetch JSON files (local or GitHub fallback)
  const fetchJSONFile = async (url) => {
    try {
      const localUrl = `${LOCAL_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
      try {
        const response = await fetch(localUrl);
        if (response.ok) return await response.json();
      } catch (err) {
        console.log("Local fetch failed, trying GitHub repository fallback");
      }

      const token = atob([_0x5f, _0x4e, _0x3d, _0x2c, _0x1b, _0xa0, _0xb1, _0xc2, _0xd3, _0xe4].join(''));
      const githubUrl = `${GITHUB_API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
      const apiRes = await fetch(githubUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${token}`
        }
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        const decoded = atob(data.content);
        return JSON.parse(decoded);
      }

      const rawUrl = `${GITHUB_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
      const rawRes = await fetch(rawUrl);
      if (!rawRes.ok) throw new Error("Could not download questions JSON.");
      return await rawRes.json();
    } catch (err) {
      console.error("All fetch attempts failed:", err);
      throw err;
    }
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
      if (assessment.type === 'mcq') {
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

    // 1. Internet Check
    await new Promise(r => setTimeout(r, 1000));
    const internetOk = navigator.onLine;
    setPreflightResults(prev => ({ ...prev, internet: internetOk ? 'pass' : 'fail' }));

    // 2. Webcam Check
    await new Promise(r => setTimeout(r, 800));
    let webcamOk = false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      webcamOk = devices.some(d => d.kind === 'videoinput');
    } catch (_) { }
    setPreflightResults(prev => ({ ...prev, webcam: webcamOk ? 'pass' : 'fail' }));

    // 3. Microphone Check
    await new Promise(r => setTimeout(r, 800));
    let micOk = false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      micOk = devices.some(d => d.kind === 'audioinput');
    } catch (_) { }
    setPreflightResults(prev => ({ ...prev, microphone: micOk ? 'pass' : 'fail' }));

    // 4. Secure Env Check
    await new Promise(r => setTimeout(r, 800));
    const secureEnvOk = !!window.desktopBridge || !!window.qt;
    setPreflightResults(prev => ({ ...prev, secureEnv: secureEnvOk ? 'pass' : 'fail' }));

    // 5. System Hardening Check
    await new Promise(r => setTimeout(r, 800));
    const hardeningOk = !!window.desktopBridge;
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

      const testData = await fetchJSONFile(assessment.url);

      if (assessment.isMultiSection) {
        localStorage.setItem("multisectionAssessmentData", JSON.stringify(assessment));
        setLaunchStep(null);
        navigate(`/student/assessment/multisection/${assessment.slug}`);
      } else if (assessment.type === 'mcq') {
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
        setLaunchStep(null);
        navigate(`/student/mcq/${assessment.slug}`);
      } else {
        // Collect questionIds from all sources
        let questionIds = [];
        const collectIds = (src) => {
          if (!src) return;
          if (Array.isArray(src)) {
            src.forEach(item => {
              if (typeof item === 'string') {
                questionIds.push(item);
              } else if (item && (item.id || item.questionId)) {
                questionIds.push(item.id || item.questionId);
              }
            });
          }
        };

        collectIds(assessment.questionIds);
        collectIds(assessment.questions);
        collectIds(testData.questionIds);
        collectIds(testData.questions);

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

        // Fallback to inline questions if bank resolving returned nothing
        if (resolvedQuestions.length === 0) {
          const inline = [];
          const addInline = (src) => {
            if (Array.isArray(src)) {
              src.forEach(item => {
                if (item && typeof item === 'object' && (item.id || item.questionId)) {
                  inline.push(item);
                }
              });
            }
          };
          addInline(assessment.questions);
          addInline(testData.questions);
          resolvedQuestions = inline;
        }

        await CodingAssessmentService.createInitialAttempt(user, assessment);
        localStorage.setItem("codingAssessmentStartTime", now.toString());
        localStorage.setItem("codingAssessmentTimer", durationSec.toString());
        localStorage.setItem("codingAssessmentData", JSON.stringify({
          assessment,
          questions: resolvedQuestions
        }));
        localStorage.setItem("codingAssessmentNewLaunch", "true");
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

    try {
      localStorage.removeItem("auth_data");
      localStorage.removeItem("role");
      localStorage.removeItem("portal_links");

      setTimeout(() => {
        localStorage.clear();
      }, 100);
    } catch (error) {
      console.error('Error clearing storage:', error);
    }

    setTimeout(() => {
      setShowLogoutAnimation(false);
      navigate("/login");
    }, 1500);
  };

  const name = user?.Name || user?.name || "Student";
  const email = user?.Email || user?.email || "N/A";
  const college = user?.College || user?.college || "N/A";
  const rollNumber = user?.["Roll Number"] || user?.roll || "N/A";
  const year = user?.Year || "N/A";
  const dept = user?.Department || "N/A";

  const renderAssessments = () => {
    return (
      <div className="assessments-tab-content">
        <div className="dashboard-welcome">
          <h1>Welcome, {name}!</h1>
          <p>Complete your scheduled MCQ quizzes and coding assessments below.</p>
        </div>

        {/* Filters Panel */}
        <div className="dashboard-filters-bar">
          <div className="search-box-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search by assessment name..."
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

        {/* Grid List */}
        {loading ? (
          <div className="learn-loading">
            <div className="learn-spinner"></div>
            <p>Loading assessments catalog...</p>
          </div>
        ) : error ? (
          <div className="error-banner">
            <FaExclamationTriangle /> {error}
          </div>
        ) : filteredAssessments.length > 0 ? (
          <div className="assessments-cards-grid">
            {filteredAssessments.map(a => {
              const sched = getScheduleStatus(a.schedule);
              const isExpired = sched.status === "Expired";
              const isUpcoming = sched.status === "Upcoming";
              const isActive = sched.status === "Active";

              return (
                <div key={a.id} className={`assessment-dashboard-card type-${a.type}`}>
                  <div className="card-badge-row">
                    <span className={`type-badge badge-${a.type}`}>
                      {a.type === 'mcq' ? <FaQuestionCircle /> : <FaLaptopCode />} {a.type.toUpperCase()}
                    </span>
                    {a.completed && (
                      <span className="difficulty-badge diff-easy" style={{ background: '#0e4429', color: '#39d353', border: '1px solid rgba(57, 211, 83, 0.2)' }}>
                        ✓ Completed
                      </span>
                    )}
                    <span className={`difficulty-badge diff-${a.difficulty.toLowerCase()}`}>
                      {a.difficulty}
                    </span>
                  </div>

                  <h3 className="assessment-card-title">{a.name}</h3>

                  <div className="assessment-card-details">
                    <div className="detail-item">
                      <FaClock /> <span>{a.duration} Minutes</span>
                    </div>
                    <div className="detail-item">
                      <FaClipboardList /> <span>{a.questions} {a.type === 'mcq' ? 'Questions' : 'Coding Tasks'}</span>
                    </div>
                    <div className="detail-item schedule">
                      <FaCalendarAlt />
                      <span>
                        {a.schedule ? `${a.schedule.startDate} ${a.schedule.startTime} - ${a.schedule.endTime}` : 'Always open'}
                      </span>
                    </div>
                  </div>

                  <div className="assessment-card-actions">
                    {a.completed ? (
                      <button className="start-btn" disabled style={{ background: '#0e4429', color: '#39d353', cursor: 'not-allowed', border: '1px solid rgba(57, 211, 83, 0.3)', width: '100%' }}>
                        ✓ Assessment Submitted
                      </button>
                    ) : isExpired ? (
                      <span className="expired-badge-label">Expired</span>
                    ) : isUpcoming ? (
                      <button className="start-btn disabled" disabled>
                        <FaLock /> Locks Until {a.schedule.startTime}
                      </button>
                    ) : (
                      <button className="start-btn active" onClick={() => handleStartClick(a)}>
                        Start Assessment
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="no-contests-message" style={{ textAlign: 'center', padding: '60px' }}>
            No assessments match your current filters.
          </div>
        )}
      </div>
    );
  };

  const loadProfileProgress = async () => {
    if (!user) return;
    const email = user.Email || user.email;
    if (!email) return;

    setLoadingProfileProgress(true);
    try {
      const { syncProgressWithFirebase, getFullProgress } = await import('../services/codingProgressService');
      if (navigator.onLine) {
        const syncRes = await syncProgressWithFirebase(email);
        if (syncRes.success) {
          setProgressData(syncRes.progress);
          return;
        }
      }
      const progress = await getFullProgress(email);
      setProgressData(progress);
    } catch (err) {
      console.warn("Failed to load user progress:", err);
    } finally {
      setLoadingProfileProgress(false);
    }
  };

  const renderProfile = () => {
    const isPremium = user?.Premium === true || user?.Premium === 'true' || user?.Premium === 1 || user?.Premium === 'Yes' || !!user?.isPremium;

    const getCompletedCourses = () => {
      const badges = [];
      const solvedCount = progressData?.solvedProblems?.length || 0;
      
      // 1. Solve milestones
      if (solvedCount >= 1) {
        badges.push({
          id: 'first_steps',
          title: 'First Steps',
          desc: 'Solved your first coding problem!',
          icon: '🚀',
          color: '#38bdf8'
        });
      }
      if (solvedCount >= 10) {
        badges.push({
          id: 'coding_scholar',
          title: 'Coding Scholar',
          desc: 'Solved 10+ coding practice problems.',
          icon: '📚',
          color: '#a78bfa'
        });
      }
      if (solvedCount >= 30) {
        badges.push({
          id: 'dsa_expert',
          title: 'DSA Expert',
          desc: 'Solved 30+ coding practice problems.',
          icon: '🏆',
          color: '#fb923c'
        });
      }
      if (solvedCount >= 50) {
        badges.push({
          id: 'grandmaster',
          title: 'SEED-IT Grandmaster',
          desc: 'Solved 50+ coding practice problems.',
          icon: '👑',
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
            icon: '📝',
            color: '#34d399'
          });
        }
        
        if (completedCodings.length > 0 && completedCodings.length === codingAssessments.length) {
          badges.push({
            id: 'assessment_master',
            title: 'Assessment Master',
            desc: 'Completed all mapped Coding courses.',
            icon: '🛡️',
            color: '#fbbf24'
          });
        }

        const totalCompleted = assessments.filter(a => a.completed).length;
        if (totalCompleted > 0 && totalCompleted === assessments.length) {
          badges.push({
            id: 'seed_graduate',
            title: 'SEED-IT Graduate',
            desc: 'Completed 100% of all assigned academic courses.',
            icon: '🎓',
            color: '#2dd4bf'
          });
        }
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
                  <span className={`status-badge-premium ${isPremium ? 'premium' : 'basic'}`}>
                    {isPremium ? '★ Premium Edition' : 'Standard Edition'}
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
              <div style={{ fontSize: '48px' }}>📊</div>
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
    let totalHours = 0;
    let totalProblemsSolved = progressData?.solvedProblems?.length || 0;
    if (progressData?.activity) {
      Object.values(progressData.activity).forEach(act => {
        totalHours += act.hours || 0;
      });
    }

    const getStreakCount = () => {
      if (!progressData?.activity) return 0;
      let streak = 0;
      const checkDate = new Date();
      while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const dayInfo = progressData.activity[dateStr];
        if (dayInfo && (dayInfo.hours > 0 || dayInfo.problemsSolved > 0)) {
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
                <span className={`status-badge-premium ${isPremium ? 'premium' : 'basic'}`}>
                  {isPremium ? '★ Premium Edition' : 'Standard Edition'}
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
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#38bdf8' }}>{totalHours.toFixed(1)} hrs</div>
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
                  {loadingProfileProgress ? 'Syncing...' : '🔄 Sync with Cloud'}
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
                          const solved = dayInfo.problemsSolved || 0;

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
                                  dayInfo
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
            <span>🏆</span> Achievements & Badges
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
              <span style={{ fontSize: '32px', marginBottom: '8px' }}>🎖️</span>
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
              • Portal Time: {hoveredDay.dayInfo.hours.toFixed(2)} hours
            </div>
          </div>
        )}

      </div>
    );
  };

  const renderSettings = () => {
    const themes = [
      {
        id: 'dark',
        name: 'Midnight Space (Dark)',
        desc: 'Futuristic slate theme with indigo highlights (default).',
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

    return (
      <div className="settings-tab-content">
        <div className="dashboard-welcome">
          <h1>Portal Settings</h1>
          <p>Personalise your student workspace theme and interface appearance.</p>
        </div>

        <div className="settings-section-card" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '28px',
          marginTop: '24px',
          boxShadow: '0 4px 20px var(--shadow-color)'
        }}>
          <h3 style={{ color: 'var(--text-main)', marginBottom: '8px', fontSize: '18px', fontWeight: 600 }}>Workspace Color Mode</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
            Choose a visual style that matches your environment. Themes apply globally to the login screen, sandboxes, and exams.
          </p>

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
                <span>✨</span> Welcome to SEED Portal
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
            <div className="lw-card-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
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
                <span>📢</span> Platform Updates & News
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
                      <span style={{ fontSize: '16px', color: 'var(--accent-coding)', marginTop: '2px' }}>⚡</span>
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
                  <span style={{ fontSize: '18px', color: 'var(--accent-coding)', marginTop: '2px' }}>⚡</span>
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
            <div className="lw-card" style={{ maxWidth: '740px' }}>
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

                {/* Malpractice Warning Box */}
                <div className="lw-malpractice-box">
                  <p className="lw-malpractice-title">⚠️ Proctoring System Active</p>
                  <ul className="lw-malpractice-list">
                    <li>Do not switch tabs or leave this window during the test.</li>
                    <li>3 tab-switch violations will auto-lock and submit your assessment.</li>
                    <li>Do not use any external assistance, websites, or AI tools.</li>
                    <li>This is a <strong>one-time attempt</strong> — you cannot retake this test.</li>
                  </ul>
                </div>
              </div>
              <div className="lw-card-footer">
                <button className="lw-btn-secondary" onClick={cancelWizard}>Cancel</button>
                <button className="lw-btn-success" onClick={handleAgreeAndLaunch}>
                  <FaCheckCircle style={{ marginRight: '6px' }} />I Agree & Start Assessment
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
          <span className="brand-title">SEED SEB Dashboard</span>
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
        <p>&copy; {new Date().getFullYear()} SEED Innovating Technologies and Educatio Services (SEED-IT). (v{APP_VERSION})</p>
      </footer>
    </div>
  );
};

export default StudentDashboard;
