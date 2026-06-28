import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
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
  FaTimes,
  FaCheck,
  FaCheckCircle,
  FaExclamationTriangle
} from "react-icons/fa";
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/StudentDashboard.css';
import TrackingService from '../services/trackingService';
import DataService from '../services/dataService';
import MCQService from '../services/mcqService';
import CodingAssessmentService from '../services/codingAssessmentService';
import timeService from '../services/timeService';
import ProctoringInstructions from './ProctoringInstructions';

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
  const [activeTab, setActiveTab] = useState("assessments"); // "assessments" or "profile"
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogoutAnimation, setShowLogoutAnimation] = useState(false);
  
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
    internet: 'pending'
  });
  const [preflightDone, setPreflightDone] = useState(false);
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

      // 2. Parse MCQ Modules
      const mcqModules = accessControlData?.courses?.mcqs?.modules || {};
      const mcqList = Object.entries(mcqModules)
        .filter(([key, module]) => {
          const isPremiumModule = !!module.isPremium;
          const premiumAccess = !isPremiumModule || isPremiumUser;
          return allowedModuleIds.includes(module.id) && premiumAccess;
        })
        .map(([key, module]) => {
          const derivedSlug = module.slug || slugify(module.id || module.name || key);
          
          let finalUrl = module.url || '';
          if (!finalUrl.endsWith('.json')) {
            if (module.slug) {
              finalUrl = `/mcq/${module.slug}.json`;
            } else if (finalUrl.startsWith('/student/mcq/')) {
              const slugFromUrl = finalUrl.split('/').filter(Boolean).pop();
              finalUrl = `/mcq/${slugFromUrl}.json`;
            } else {
              finalUrl = `/mcq/${slugify(module.name || key)}.json`;
            }
          }

          return {
            key,
            id: module.id,
            name: module.name,
            url: finalUrl,
            passkey: module.passkey,
            schedule: module.schedule,
            difficulty: module.difficulty || 'Medium',
            questions: module.questions || 0,
            duration: module.duration_minutes || 60,
            slug: derivedSlug,
            type: 'mcq',
            proctored: module.proctored,
            maxViolations: module.maxViolations
          };
        });

      // 3. Parse Coding Modules
      const codingModules = accessControlData?.courses?.assessments?.modules || {};
      const codingList = Object.entries(codingModules)
        .filter(([key, module]) => {
          const isPremiumModule = !!module.isPremium;
          const premiumAccess = !isPremiumModule || isPremiumUser;
          return allowedModuleIds.includes(module.id) && premiumAccess;
        })
        .map(([key, module]) => {
          const derivedSlug = module.slug || slugify(module.id || module.name || key);
          
          let finalUrl = module.url || '';
          if (!finalUrl.endsWith('.json')) {
            if (module.slug) {
              finalUrl = `/coding/${module.slug}.json`;
            } else if (finalUrl.startsWith('/student/coding/')) {
              const slugFromUrl = finalUrl.split('/').filter(Boolean).pop();
              finalUrl = `/coding/${slugFromUrl}.json`;
            } else {
              finalUrl = `/coding/${slugify(module.name || key)}.json`;
            }
          }

          return {
            key,
            id: module.id,
            name: module.name,
            url: finalUrl,
            passkey: module.passkey,
            schedule: module.schedule,
            difficulty: module.difficulty || 'Medium',
            questions: module.questions || 0,
            duration: module.duration_minutes || 60,
            slug: derivedSlug,
            type: 'coding',
            languages: module.languages || ["c", "cpp", "java", "python"],
            proctored: module.proctored,
            maxViolations: module.maxViolations
          };
        });

      const combined = [...mcqList, ...codingList];
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

  // STEP 3 — Run pre-flight system checks (internet only — camera/mic skipped)
  const runPreflightChecks = async (assessment) => {
    setSelectedAssessment(assessment);
    setPreflightResults({ internet: 'pending' });
    setPreflightDone(false);
    setLaunchStep('preflight');

    // Hold 'pending' state visibly for 2 seconds so the animation is noticeable
    await new Promise(r => setTimeout(r, 2000));

    // Internet check
    const internetOk = navigator.onLine;
    setPreflightResults({ internet: internetOk ? 'pass' : 'fail' });

    // Hold result visible for another 3 seconds before enabling Proceed (total ~5 s)
    await new Promise(r => setTimeout(r, 3000));

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
        setLaunchStep(null);
        navigate(`/student/mcq/${assessment.slug}`);
      } else {
        await CodingAssessmentService.createInitialAttempt(user, assessment);
        localStorage.setItem("codingAssessmentStartTime", now.toString());
        localStorage.setItem("codingAssessmentTimer", durationSec.toString());
        localStorage.setItem("codingAssessmentData", JSON.stringify({
          assessment,
          questions: testData.questions || []
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
                    {isExpired ? (
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

  const renderProfile = () => {
    const isPremium = user?.Premium === true || user?.Premium === 'true' || user?.Premium === 1 || user?.Premium === 'Yes' || !!user?.isPremium;

    return (
      <div className="profile-tab-content">
        <div className="dashboard-welcome">
          <h1>Student Profile</h1>
          <p>Your academic registration info mapped within SEED-IT.</p>
        </div>

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

          <div className="profile-details-table-grid">
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
      </div>
    );
  };

  return (
    <div className={`dashboard-container ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* ═══════════════════════════════════════════════════════════
          LAUNCH WIZARD MODALS — 5 Steps
      ═══════════════════════════════════════════════════════════ */}

      {/* Step 1: Verifying identity overlay */}
      {launchStep === 'verifying' && (
        <div className="lw-overlay" style={{ zIndex: 1200 }}>
          <div className="lw-card" style={{ maxWidth: '460px', padding: '40px 30px', textAlign: 'center' }}>
            <div className="lw-spinner" style={{ width: '56px', height: '56px', borderWidth: '4px' }}></div>
            <h3 className="lw-title" style={{ marginTop: '24px', justifyContent: 'center', fontSize: '1.4rem' }}>Verifying Identity</h3>
            <p className="lw-subtitle" style={{ fontSize: '0.95rem', marginTop: '8px' }}>Checking your previous attempt records. Please wait...</p>
          </div>
        </div>
      )}

      {/* Step 2: Passkey Entry */}
      {launchStep === 'passkey' && selectedAssessment && (
        <div className="lw-overlay" style={{ zIndex: 1200 }}>
          <div className="lw-card" style={{ maxWidth: '540px' }}>
            <div className="lw-card-header" style={{ padding: '30px 30px 20px' }}>
              <div className="lw-step-badge">Step 2 of 4</div>
              <h3 className="lw-title" style={{ fontSize: '1.35rem', gap: '10px' }}><FaLock style={{ color: '#6366f1' }}/>Access Passkey Required</h3>
              <p className="lw-subtitle" style={{ fontSize: '0.92rem', marginTop: '6px' }}>This assessment is passkey-protected. Enter the passkey provided by your instructor.</p>
            </div>
            <div className="lw-card-body" style={{ padding: '24px 30px' }}>
              <input
                type="password"
                ref={passkeyInputRef}
                placeholder="Enter access passkey"
                value={passkeyInput}
                onChange={e => setPasskeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleValidatePasskey()}
                className="lw-input"
                style={{ padding: '14px 18px', fontSize: '1.05rem', borderRadius: '10px' }}
              />
              {passkeyError && (
                <div className="lw-error-row" style={{ marginTop: '16px', padding: '12px' }}>
                  <FaExclamationTriangle style={{ marginRight: '8px' }} />{passkeyError}
                </div>
              )}
            </div>
            <div className="lw-card-footer" style={{ padding: '20px 30px 24px' }}>
              <button className="lw-btn-secondary" onClick={cancelWizard} style={{ padding: '12px 24px' }}>Cancel</button>
              <button className="lw-btn-primary" onClick={handleValidatePasskey} style={{ padding: '12px 28px' }}>
                <FaCheck style={{ marginRight: '6px' }}/>Unlock & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Pre-flight system check — internet only */}
      {launchStep === 'preflight' && (
        <div className="lw-overlay" style={{ zIndex: 1200 }}>
          <div className="lw-card" style={{ maxWidth: '560px' }}>
            <div className="lw-card-header" style={{ padding: '30px 30px 20px' }}>
              <div className="lw-step-badge">Step 3 of 4</div>
              <h3 className="lw-title" style={{ fontSize: '1.35rem' }}>System Pre-flight Check</h3>
              <p className="lw-subtitle" style={{ fontSize: '0.92rem', marginTop: '6px' }}>Verifying your system meets all requirements for a monitored assessment.</p>
            </div>
            <div className="lw-card-body" style={{ padding: '24px 30px' }}>
              {/* Internet connectivity row */}
              <div className="lw-preflight-row" style={{ padding: '16px', borderRadius: '10px' }}>
                <span className="lw-preflight-icon" style={{ fontSize: '1.4rem' }}>🌐</span>
                <span className="lw-preflight-label" style={{ fontSize: '1rem', fontWeight: '600' }}>Internet Connectivity</span>
                <span className={`lw-preflight-status lw-preflight-${preflightResults.internet}`} style={{ fontSize: '0.95rem' }}>
                  {preflightResults.internet === 'pending' && <span className="lw-mini-spinner"></span>}
                  {preflightResults.internet === 'pass'    && <FaCheck />}
                  {preflightResults.internet === 'fail'    && <FaTimes />}
                  &nbsp;{preflightResults.internet === 'pending' ? 'Checking...' : preflightResults.internet === 'pass' ? 'Ready' : 'No Connection'}
                </span>
              </div>

              {/* Result messages */}
              {preflightDone && preflightResults.internet === 'fail' && (
                <div className="lw-error-row" style={{ marginTop: '16px', padding: '12px' }}>
                  <FaExclamationTriangle style={{ marginRight: '8px' }} /> No internet connection detected. Please connect and try again.
                </div>
              )}
              {preflightDone && preflightResults.internet === 'pass' && (
                <div className="lw-info-row" style={{ marginTop: '16px', padding: '12px' }}>
                  <FaCheckCircle style={{ color: '#10b981', marginRight: '8px' }} /> All checks passed. You may proceed.
                </div>
              )}
            </div>
            <div className="lw-card-footer" style={{ padding: '20px 30px 24px' }}>
              <button className="lw-btn-secondary" onClick={cancelWizard} style={{ padding: '12px 24px' }}>Cancel</button>
              <button
                className="lw-btn-primary"
                disabled={!preflightDone || preflightResults.internet === 'fail'}
                onClick={handlePreflightProceed}
                style={{ padding: '12px 28px' }}
              >
                <FaCheck style={{ marginRight: '6px' }}/>Proceed
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
            onContinue={handleAgreeAndLaunch}
            onCancel={cancelWizard}
          />
        ) : (
          <div className="lw-overlay" style={{ zIndex: 1200 }}>
            <div className="lw-card" style={{ maxWidth: '640px' }}>
              <div className="lw-card-header" style={{ padding: '30px 30px 20px' }}>
                <div className="lw-step-badge">Step 4 of 4</div>
                <h3 className="lw-title" style={{ fontSize: '1.35rem' }}>Test Details & Instructions</h3>
              </div>
              <div className="lw-card-body" style={{ padding: '24px 30px' }}>
                {/* Test meta-info */}
                <div className="lw-info-grid" style={{ gap: '16px', marginBottom: '24px' }}>
                  <div className="lw-info-cell" style={{ padding: '14px' }}>
                    <span className="lw-info-label">Assessment</span>
                    <span className="lw-info-value" style={{ fontSize: '1.05rem' }}>{selectedAssessment.name}</span>
                  </div>
                  <div className="lw-info-cell" style={{ padding: '14px' }}>
                    <span className="lw-info-label">Type</span>
                    <span className="lw-info-value" style={{ textTransform: 'capitalize', fontSize: '1.05rem' }}>{selectedAssessment.type}</span>
                  </div>
                  <div className="lw-info-cell" style={{ padding: '14px' }}>
                    <span className="lw-info-label">Duration</span>
                    <span className="lw-info-value" style={{ fontSize: '1.05rem' }}>{selectedAssessment.duration} minutes</span>
                  </div>
                  <div className="lw-info-cell" style={{ padding: '14px' }}>
                    <span className="lw-info-label">Questions</span>
                    <span className="lw-info-value" style={{ fontSize: '1.05rem' }}>{selectedAssessment.questions || '—'}</span>
                  </div>
                </div>

                {/* Malpractice Warning Box */}
                <div className="lw-malpractice-box" style={{ padding: '20px', borderRadius: '10px' }}>
                  <p className="lw-malpractice-title" style={{ fontSize: '1.05rem', marginBottom: '12px' }}>⚠️ Proctoring System Active</p>
                  <ul className="lw-malpractice-list" style={{ gap: '8px' }}>
                    <li>Do not switch tabs or leave this window during the test.</li>
                    <li>3 tab-switch violations will auto-lock and submit your assessment.</li>
                    <li>Do not use any external assistance, websites, or AI tools.</li>
                    <li>This is a <strong>one-time attempt</strong> — you cannot retake this test.</li>
                  </ul>
                </div>
              </div>
              <div className="lw-card-footer" style={{ padding: '20px 30px 24px' }}>
                <button className="lw-btn-secondary" onClick={cancelWizard} style={{ padding: '12px 24px' }}>Cancel</button>
                <button className="lw-btn-success" onClick={handleAgreeAndLaunch} style={{ padding: '12px 28px' }}>
                  <FaCheckCircle style={{ marginRight: '6px' }}/>I Agree & Start Assessment
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {/* Step 5: Launching overlay */}
      {launchStep === 'launching' && (
        <div className="lw-overlay" style={{ zIndex: 1200 }}>
          <div className="lw-card" style={{ maxWidth: '460px', padding: '40px 30px', textAlign: 'center' }}>
            <div className="lw-spinner" style={{ width: '56px', height: '56px', borderWidth: '4px' }}></div>
            <h3 className="lw-title" style={{ marginTop: '24px', justifyContent: 'center', fontSize: '1.4rem' }}>Setting Up Workspace</h3>
            <p className="lw-subtitle" style={{ fontSize: '0.95rem', marginTop: '8px' }}>Loading questions and preparing your secure test environment...</p>
          </div>
        </div>
      )}

      {/* Eligibility / connection error modal */}
      {eligibilityError && (
        <div className="lw-overlay" style={{ zIndex: 1300 }}>
          <div className="lw-card" style={{ maxWidth: '440px' }}>
            <div className="lw-card-header" style={{ borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
              <h3 className="lw-title" style={{ color: '#ef4444' }}>
                <FaExclamationTriangle style={{ marginRight: '8px' }}/>{eligibilityError.title}
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
          <span className="brand-title">SEED-IT Student Shell</span>
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
              className={`menu-item ${activeTab === "profile" ? "active" : ""}`} 
              onClick={() => setActiveTab("profile")}
            >
              <FaUser />
              <span className="menu-text">Profile</span>
            </button>
            <button className="menu-item logout-btn" onClick={handleLogout}>
              <FaSignOutAlt />
              <span className="menu-text">Logout</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="dashboard-main">
          {activeTab === "assessments" ? renderAssessments() : renderProfile()}
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
