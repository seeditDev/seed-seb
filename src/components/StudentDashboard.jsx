import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, Link, useLocation } from './router-compat';
import { APP_VERSION } from './AppShell';
import { fetchArticleFile } from '../utils/articleFetcher';
import { auth } from '../lib/firebase-config';
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
  FaEye,
  FaEyeSlash,
  FaShieldAlt,
  FaTimes,
  FaCheck,
  FaCheckCircle,
  FaArrowLeft,
  FaArrowUp,
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
  FaChevronRight,
  FaBell,
  FaSun,
  FaMoon,
  FaFire,
  FaBullseye,
  FaKey,
  FaThLarge,
  FaTachometerAlt,
  FaMobileAlt,
  FaCode,
  FaExpand,
  FaPlay,
  FaHeadset,
  FaCommentDots,
  FaDesktop,
  FaArrowRight,
  FaLifeRing,
  FaLinkedin,
  FaGlobe,
  FaGithub,
  FaExternalLinkAlt,
  FaDownload,
  FaCopy,
  FaAndroid,
  FaBolt,
  FaCoins,
  FaListOl,
  FaLayerGroup,
  FaBoxOpen,
  FaBatteryFull
} from "react-icons/fa";
import 'bootstrap/dist/css/bootstrap.min.css';
import { isQuestionBankProblem } from '../services/codingProgressService';
import SeedCreditCoin from './SeedCreditCoin';
import '../styles/StudentDashboard.css';
import '../styles/PracticeHome.css';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase-config';
import TrackingService from '../services/trackingService';
import DataService from '../services/dataService';
import MCQService from '../services/mcqService';
import CodingAssessmentService from '../services/codingAssessmentService';
import timeService from '../services/timeService';
import ProctoringInstructions from './ProctoringInstructions';
import PracticeHome from './PracticeHome';
import MyLearningDashboard from '../courses/components/MyLearningDashboard';
import CourseCatalog from '../courses/components/CourseCatalog';
import '../courses/styles/CourseLearningPlayer.css';
import { COURSE_CATALOG } from '../courses/data/courseCatalogData';
import { getEnrolledCourseIds, fetchEnrolledCourseIds, getCourseProgress } from '../courses/services/learningEngineService';
import { fetchContentJSON } from '../utils/contentApi';
import { fetchCompletionMap, invalidateCompletionCache } from '../services/attemptStatusService';
import { requireTenant } from '../utils/tenant';
import { RESUMABLE_STATES, ATTEMPT_STATES } from '../services/attemptStateMachine';
import { loadUserDailyGoals, saveUserDailyGoals, getDailyGoalsForDate, ALL_GOALS_COMPLETION_BONUS } from '../utils/dailyGoalsPool';
import { calculateLevel, awardUserXPAndCredits, getUserGamification } from '../utils/gamificationService';
import { toast } from 'sonner';
import { getAuthData } from '../utils/storageUtils';
import { stopAllMediaAndAI } from '../utils/hardwareTeardown';
import NotificationCenterPopover from './NotificationCenterPopover';
import {
  subscribeStudentNotifications,
  getReadNotifIds,
  markAsRead,
  markAllAsRead,
} from '../services/notificationService';
import SupportTicketModal from './SupportTicketModal';
import SupportTicketChatModal from './SupportTicketChatModal';
import { DocumentationModal, AuthenticityModal } from './SupportDocModals';
import {
  subscribeStudentTickets,
  TICKET_STATUSES,
  TICKET_CATEGORIES,
} from '../services/supportService';
import { ensureUserHasUsername } from '../services/usernameService';
import { publishPublicProfile } from '../services/publicProfileService';
import GitHubSyncModal from './common/GitHubSyncModal';
import PremiumUpgradeModal from './PremiumUpgradeModal';
import { purchaseContestPass } from '../services/razorpayService';
import {
  getGitHubConfig,
  saveGitHubConfig,
  fetchGitHubConfigFromFirestore,
  saveGitHubConfigToFirestore,
  clearGitHubConfigFromFirestore,
  verifyGitHubToken,
  connectWithGitHubOAuth,
  batchSyncAllSolved,
  DEFAULT_REPO_NAME,
} from '../services/githubSyncService';

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
  const navigate = useNavigate();
  const location = useLocation();

  // Guarantee that all camera, microphone, AudioContext, and AI proctoring engines are cleanly shut down when on dashboard
  useEffect(() => {
    try {
      stopAllMediaAndAI();
    } catch (_) { }
  }, []);

  const [activeTab, setActiveTab] = useState(() => {
    return location.state?.tab || "dashboard";
  });
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState(() => getAuthData());
  const [dailyGoals, setDailyGoals] = useState([]);
  const [seedCredits, setSeedCredits] = useState(() => (user?.seedCredits !== undefined ? user.seedCredits : 2450));
  const [totalXP, setTotalXP] = useState(() => (user?.totalXP !== undefined ? user.totalXP : 0));
  const [userLevelInfo, setUserLevelInfo] = useState(() => calculateLevel(user?.totalXP || 0));
  const [todayCreditsGained, setTodayCreditsGained] = useState(120);
  const [userStreak, setUserStreak] = useState(() => (user?.streak !== undefined ? user.streak : 1));
  const [goalOffset, setGoalOffset] = useState(0);
  const [progressData, setProgressData] = useState(() => {
    try {
      const authObj = getAuthData() || {};
      const uid = authObj.uid || authObj.id || authObj.email || 'demo-student';
      let raw = localStorage.getItem(`practice_progress_${uid}`);
      if (!raw) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('practice_progress_')) {
            raw = localStorage.getItem(k);
            break;
          }
        }
      }
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  });
  const [hoveredDay, setHoveredDay] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [loadingProfileProgress, setLoadingProfileProgress] = useState(false);
  const [showLogoutAnimation, setShowLogoutAnimation] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [userPremiumState, setUserPremiumState] = useState(null);
  const [profileSubTab, setProfileSubTab] = useState('info'); // 'info', 'utilisation', 'widget', 'password'
  const [studentUsername, setStudentUsername] = useState(() => user?.username || '');
  const [practiceInitialTab, setPracticeInitialTab] = useState(() => location.state?.practiceTab || 'bank');
  const [practiceInitialCourse, setPracticeInitialCourse] = useState(null);

  // Synchronize dashboard tab and practice tab when navigating via location.state (e.g. Home button from PracticeSandbox)
  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
    if (location.state?.practiceTab) {
      setPracticeInitialTab(location.state.practiceTab);
      setPracticeInitialCourse(null);
    }
  }, [location.state]);
  const [primaryColor, setPrimaryColor] = useState(() => localStorage.getItem('portal_primary_color') || 'green');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('portal_font_size') || 'medium');
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [practiceReminders, setPracticeReminders] = useState(true);
  const [assessmentAlerts, setAssessmentAlerts] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('portal_theme') || 'seed-seb';
  });
  const [showSupportModal, setShowSupportModal] = useState(false);

  useEffect(() => {
    const onPremiumUpdated = () => {
      setUser((prev) => {
        const next = { ...(prev || {}), isPremium: true, premium: true };
        loadAssessments(next);
        return next;
      });
    };
    window.addEventListener('seedit:premium-updated', onPremiumUpdated);
    return () => window.removeEventListener('seedit:premium-updated', onPremiumUpdated);
  }, []);

  const handleContestPassCheckout = async (contest) => {
    toast.info(`Contest passes can be acquired on seedit.site. Visit the website to unlock this contest.`, {
      action: {
        label: 'Go to Website',
        onClick: () => {
          try {
            if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
              window.electronAPI.openExternal('https://seedit.site');
              return;
            }
          } catch (_) {}
          window.open('https://seedit.site', '_blank', 'noopener,noreferrer');
        }
      },
      duration: 6000
    });
  };
  const [supportInitialCategory, setSupportInitialCategory] = useState('download_seb');
  const [showDocModal, setShowDocModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [chatTicket, setChatTicket] = useState(null);
  const [supportTicketsList, setSupportTicketsList] = useState([]);

  useEffect(() => {
    const effectiveUid = user?.uid || 'demo-student';
    const unsub = subscribeStudentTickets(effectiveUid, (list) => {
      setSupportTicketsList(list);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    ensureUserHasUsername(user).then((handle) => {
      if (handle) {
        setStudentUsername(handle);
        publishPublicProfile(user.uid, { ...user, username: handle }, progressData || {}, typeof assessments !== 'undefined' ? assessments : []).catch(() => {});
      }
    }).catch((e) => console.warn('[StudentDashboard] Error ensuring username:', e));
  }, [user?.uid]);

  // Real-time notifications with time limits
  const [notifications, setNotifications] = useState([]);
  const [readNotifIds, setReadNotifIds] = useState(() => getReadNotifIds(user?.uid));
  const [notifPopoverOpen, setNotifPopoverOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    setReadNotifIds(getReadNotifIds(user.uid));

    const unsubscribe = subscribeStudentNotifications(user, (items) => {
      setNotifications(items);
    });

    return () => {
      try {
        unsubscribe();
      } catch (_) {}
    };
  }, [user?.uid, user?.tenantId, user?.college, user?.cohortId, user?.year, user?.batch]);

  const handleMarkNotifAsRead = useCallback((notifId) => {
    if (!user?.uid) return;
    markAsRead(user.uid, notifId);
    setReadNotifIds(getReadNotifIds(user.uid));
  }, [user?.uid]);

  const handleMarkAllNotifsAsRead = useCallback(() => {
    if (!user?.uid) return;
    markAllAsRead(user.uid, notifications.map((n) => n.id));
    setReadNotifIds(getReadNotifIds(user.uid));
  }, [user?.uid, notifications]);

  const unreadNotifCount = useMemo(() => {
    const readSet = new Set(readNotifIds);
    return notifications.filter((n) => !readSet.has(n.id)).length;
  }, [notifications, readNotifIds]);
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

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editRollNo, setEditRollNo] = useState('');
  const [editGithub, setEditGithub] = useState('');
  const [editLinkedin, setEditLinkedin] = useState('');
  const [editPortfolio, setEditPortfolio] = useState('');
  const [editLeetcode, setEditLeetcode] = useState('');
  const [editCodechef, setEditCodechef] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const fileInputRef = useRef(null);

  // GitHub Sync & Personal Access Token (PAT) State (stored in users/{uid}/settings/githubSync)
  const [githubConfig, setGithubConfig] = useState(() => getGitHubConfig());
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [githubPatInput, setGithubPatInput] = useState(() => getGitHubConfig().token || '');
  const [showPatSecret, setShowPatSecret] = useState(false);
  const [isVerifyingPat, setIsVerifyingPat] = useState(false);
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);
  const [githubRepoName, setGithubRepoName] = useState(() => getGitHubConfig().repo || DEFAULT_REPO_NAME);
  const [githubAutoSync, setGithubAutoSync] = useState(() => getGitHubConfig().autoSync);
  const [githubIsPrivate, setGithubIsPrivate] = useState(() => getGitHubConfig().isPrivate);
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [batchSyncProgress, setBatchSyncProgress] = useState(null);

  // Fetch student's private GitHub Sync settings from Firestore
  useEffect(() => {
    const effectiveUid = user?.uid || getAuthData()?.uid;
    if (effectiveUid) {
      fetchGitHubConfigFromFirestore(effectiveUid).then((cfg) => {
        if (cfg) {
          setGithubConfig(cfg);
          setGithubPatInput(cfg.token || '');
          setGithubRepoName(cfg.repo || DEFAULT_REPO_NAME);
          setGithubAutoSync(cfg.autoSync);
          setGithubIsPrivate(cfg.isPrivate);
        }
      });
    }
  }, [user?.uid]);

  useEffect(() => {
    if (user) {
      setEditName(user.name ?? user.Name ?? user.fullName ?? '');
      setEditRollNo(user.rollNumber ?? user.RollNumber ?? user.rollNo ?? user.RollNo ?? user.regNo ?? user.RegNo ?? '');
      setEditPhone(user.phone ?? user.phoneNumber ?? user.mobile ?? '');
      setEditBio(user.bio || '');
      setAvatarUrl(user.photoURL ?? '');
      setEditGithub(user.github || user.githubUrl || '');
      setEditLinkedin(user.linkedin || user.linkedIn || '');
      setEditPortfolio(user.portfolio || user.portfolioUrl || user.website || '');
      setEditLeetcode(user.leetcode || user.leetcodeUrl || '');
      setEditCodechef(user.codechef || user.codechefUrl || '');
    }
  }, [user]);

  // Sync fresh profile fields from Firestore for existing users upon sign-in/mount
  useEffect(() => {
    if (!user?.uid || user.uid === 'demo-student') return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) {
        const remoteData = snap.data();
        setUser((prev) => {
          const merged = { ...prev, ...remoteData };
          try { localStorage.setItem('auth_data', JSON.stringify(merged)); } catch (_) {}
          return merged;
        });
      }
    }).catch(() => {});
  }, [user?.uid]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result;
      if (b64) {
        setAvatarUrl(b64);
        const updated = { ...user, photoURL: b64 };
        setUser(updated);
        localStorage.setItem('auth_data', JSON.stringify(updated));
        if (user?.uid) {
          updateDoc(doc(db, 'users', user.uid), { photoURL: b64 }).catch(() => { });
        }
        toast.success('Profile photo updated!');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    const updated = {
      ...user,
      name: editName.trim() || user.name,
      phone: editPhone.trim(),
      bio: editBio.trim(),
      photoURL: avatarUrl,
      github: editGithub.trim(),
      linkedin: editLinkedin.trim(),
      portfolio: editPortfolio.trim(),
      leetcode: editLeetcode.trim(),
      codechef: editCodechef.trim()
    };
    setUser(updated);
    localStorage.setItem('auth_data', JSON.stringify(updated));
    if (user?.uid) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          name: editName.trim() || user.name,
          phone: editPhone.trim(),
          bio: editBio.trim(),
          photoURL: avatarUrl,
          github: editGithub.trim(),
          linkedin: editLinkedin.trim(),
          portfolio: editPortfolio.trim(),
          leetcode: editLeetcode.trim(),
          codechef: editCodechef.trim()
        });
        if (studentUsername || user.username) {
          publishPublicProfile(user.uid, updated, progressData || {}, typeof assessments !== 'undefined' ? assessments : []).catch(() => {});
        }
      } catch (e) {
        console.warn('Failed to update user profile in Firestore:', e);
      }
    }
    setIsEditingProfile(false);
    toast.success('Profile details saved successfully!');
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    try {
      if (auth.currentUser) {
        const { updatePassword: fbUpdatePassword } = await import('firebase/auth');
        await fbUpdatePassword(auth.currentUser, newPassword);
        toast.success('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.success('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update password. Please re-authenticate.');
    }
  };

  const handleProfileConnectOAuth = async () => {
    const uid = user?.uid || getAuthData()?.uid;
    setIsConnectingOAuth(true);
    try {
      const authResult = await connectWithGitHubOAuth();
      const updatedConfig = {
        token: authResult.token,
        username: authResult.username,
        name: authResult.name || user?.name || authResult.username,
        email: authResult.email || user?.email || '',
        avatar: authResult.avatar || '',
        repo: githubRepoName || DEFAULT_REPO_NAME,
        autoSync: githubAutoSync,
        isPrivate: githubIsPrivate,
        authMethod: 'oauth',
      };
      await saveGitHubConfigToFirestore(uid, updatedConfig);
      setGithubConfig({ ...updatedConfig, isConnected: true });
      setGithubPatInput(authResult.token);
      toast.success(`Connected with GitHub as @${authResult.username}!`);
    } catch (err) {
      console.error('[GitHub Profile Connect Error]', err);
      toast.error(`GitHub Connection Failed: ${err.message}`);
    } finally {
      setIsConnectingOAuth(false);
    }
  };

  const handleProfileSavePat = async () => {
    const trimmed = (githubPatInput || '').trim();
    if (!trimmed) {
      toast.error('Please paste your GitHub Personal Access Token (PAT).');
      return;
    }
    const uid = user?.uid || getAuthData()?.uid;
    setIsVerifyingPat(true);
    try {
      const userMeta = await verifyGitHubToken(trimmed);
      const updatedConfig = {
        token: trimmed,
        username: userMeta.login,
        name: userMeta.name || userMeta.login,
        email: userMeta.email || '',
        avatar: userMeta.avatar_url || '',
        repo: githubRepoName || DEFAULT_REPO_NAME,
        autoSync: githubAutoSync,
        isPrivate: githubIsPrivate,
        authMethod: 'pat',
      };
      await saveGitHubConfigToFirestore(uid, updatedConfig);
      setGithubConfig({ ...updatedConfig, isConnected: true });
      toast.success(`Verified & Saved PAT for @${userMeta.login}!`);
    } catch (err) {
      toast.error(`PAT Verification Failed: ${err.message}`);
    } finally {
      setIsVerifyingPat(false);
    }
  };

  const handleProfileSaveRepoSettings = async () => {
    const uid = user?.uid || getAuthData()?.uid;
    const repoClean = (githubRepoName || DEFAULT_REPO_NAME).trim().replace(/\s+/g, '-');
    const updated = {
      ...githubConfig,
      repo: repoClean,
      autoSync: githubAutoSync,
      isPrivate: githubIsPrivate,
    };
    await saveGitHubConfigToFirestore(uid, updated);
    setGithubConfig(updated);
    setGithubRepoName(repoClean);
    toast.success('GitHub repository settings saved!');
  };

  const handleProfileDisconnectGitHub = async () => {
    const uid = user?.uid || getAuthData()?.uid;
    await clearGitHubConfigFromFirestore(uid);
    setGithubConfig(getGitHubConfig());
    setGithubPatInput('');
    toast.info('GitHub integration disconnected.');
  };

  const handleProfileBatchSync = async () => {
    const uid = user?.uid || getAuthData()?.uid;
    if (!uid || !githubConfig.isConnected) {
      toast.error('Connect your GitHub account first.');
      return;
    }
    setIsBatchSyncing(true);
    setBatchSyncProgress({ current: 0, total: 0, questionTitle: 'Starting batch sync...' });
    try {
      const result = await batchSyncAllSolved(uid, (prog) => {
        setBatchSyncProgress(prog);
      });
      if (result.success) {
        toast.success(`Sync complete! Pushed ${result.synced} solutions to GitHub.`);
      } else {
        toast.error(`Sync finished with issues: ${result.errors.length} errors.`);
      }
    } catch (err) {
      toast.error(`Batch sync failed: ${err.message}`);
    } finally {
      setIsBatchSyncing(false);
      setBatchSyncProgress(null);
    }
  };

  const handleSyncProfileProgress = async () => {
    setLoadingProfileProgress(true);
    try {
      const uid = user?.uid;
      if (uid) {
        const { syncProgressWithFirebase } = await import('../services/codingProgressService');
        const res = await syncProgressWithFirebase(uid);
        if (res.success && res.progress) {
          setProgressData(res.progress);
          toast.success('Progress synced with cloud!');
        } else {
          toast.info('Local progress is up to date.');
        }
      } else {
        toast.info('Progress up to date.');
      }
    } catch (err) {
      toast.error('Failed to sync progress.');
    } finally {
      setLoadingProfileProgress(false);
    }
  };

  // ─── Live Progress, Dynamic Streak & Daily Goals Lifecycle ───────────
  const initProgressAndGoals = useCallback(async () => {
    const authObj = getAuthData() || {};
    const uid = user?.uid || user?.id || user?.rollNumber || authObj.uid || authObj.id || auth?.currentUser?.uid || 'demo-student';

    // 1. Load Coding Progress
    let prog = null;
    try {
      const { getFullProgress } = await import('../services/codingProgressService');
      prog = await getFullProgress(uid);
      if (prog) {
        setProgressData(prog);

        // Calculate Live Streak from actual activity dates
        const activity = prog.activity || {};
        const details = prog.problemDetails || {};
        const activeDates = new Set();
        Object.keys(activity).forEach(d => {
          if (activity[d]?.problemsSolved > 0 || activity[d]?.hours > 0) activeDates.add(d);
        });
        Object.values(details).forEach(p => {
          if ((p.status === 'SOLVED' || p.lastSolvedAt) && p.lastSolvedAt) {
            activeDates.add(p.lastSolvedAt.split('T')[0]);
          }
        });

        const todayStr = new Date().toISOString().split('T')[0];
        let computedStreak = 0;
        let currDate = new Date();

        if (activeDates.has(todayStr)) {
          computedStreak++;
          currDate.setDate(currDate.getDate() - 1);
        } else {
          currDate.setDate(currDate.getDate() - 1);
        }

        let daysChecked = 0;
        while (daysChecked < 365) {
          const dStr = currDate.toISOString().split('T')[0];
          if (activeDates.has(dStr)) {
            computedStreak++;
            currDate.setDate(currDate.getDate() - 1);
            daysChecked++;
          } else {
            break;
          }
        }

        const finalStreak = computedStreak;
        setUserStreak(finalStreak);
      }
    } catch (err) {
      console.warn('[Dashboard] Could not calculate live streak:', err);
    }

    // 2. Load and Dynamically Evaluate Daily Goals
    try {
      const data = await loadUserDailyGoals(uid);
      const todayStr = new Date().toISOString().split('T')[0];
      let baseGoals = (data && Array.isArray(data.goals)) ? data.goals : getDailyGoalsForDate(todayStr, uid, 0);

      // Evaluate each goal against live progress data
      const localProg = prog || (await (await import('../services/codingProgressService')).getFullProgress(uid));
      const solvedToday = Object.entries(localProg?.problemDetails || {})
        .filter(([id, p]) => (p.status === 'SOLVED' || p.lastSolvedAt) && p.lastSolvedAt && p.lastSolvedAt.startsWith(todayStr) && isQuestionBankProblem(p.questionId || id));
      const todaySolvedCount = solvedToday.length;
      const todayTimeMins = Math.round((localProg?.activity?.[todayStr]?.hours || 0) * 60);

      let allCompleted = true;
      let newlyAwardedGoals = false;
      const evaluated = baseGoals.map(g => {
        let isComp = g.completed || false;
        let curr = g.current || 0;
        const tgt = g.target || 1;
        let progLabel = '';

        if (g.type === 'solve') {
          curr = todaySolvedCount;
          if (curr >= tgt) isComp = true;
          progLabel = ` (${Math.min(curr, tgt)}/${tgt})`;
        } else if (g.type === 'time') {
          curr = todayTimeMins;
          if (curr >= tgt) isComp = true;
          progLabel = ` (${Math.min(curr, tgt)}/${tgt} mins)`;
        } else if (g.type === 'difficulty') {
          const reqDiff = (g.difficulty ?? '').toLowerCase();
          const diffCount = solvedToday.filter(([id, p]) => {
            const pDiff = (p.difficulty ?? '').toLowerCase();
            if (reqDiff === 'easy') return pDiff === 'easy' || pDiff === 'beginner' || !pDiff || id.startsWith('Q0.');
            if (reqDiff === 'medium') return pDiff === 'medium';
            return pDiff === reqDiff;
          }).length;
          curr = Math.max(diffCount, reqDiff === 'easy' ? todaySolvedCount : 0);
          if (curr >= tgt) isComp = true;
          progLabel = ` (${Math.min(curr, tgt)}/${tgt})`;
        } else if (g.type === 'category') {
          const catCount = solvedToday.filter(([id, p]) => (p.category ?? '').toLowerCase() === (g.category ?? '').toLowerCase()).length;
          curr = catCount;
          if (curr >= tgt) isComp = true;
          progLabel = ` (${Math.min(curr, tgt)}/${tgt})`;
        }

        if (!isComp) allCompleted = false;

        // Check if this goal was completed and not yet awarded today
        const wasAwarded = g.awarded === true;
        if (isComp && !wasAwarded && uid && uid !== 'guest') {
          newlyAwardedGoals = true;
          const xpVal = g.xp || g.points || 30;
          const creditsVal = g.credits || 10;
          awardUserXPAndCredits(uid, xpVal, creditsVal, 'DAILY_TASK_COMPLETED', { goalId: g.id, title: g.title });
          toast.success(`Daily Goal Completed: "${g.title}" (+${xpVal} XP · +${creditsVal} Credits)!`);
          return { ...g, current: curr, target: tgt, completed: true, awarded: true, displayProgress: progLabel };
        }

        return { ...g, current: curr, target: tgt, completed: isComp, displayProgress: progLabel };
      });

      setDailyGoals(evaluated);

      // 1-Question Streak Rule: Solving 1 question today maintains/advances streak for today!
      if (todaySolvedCount >= 1 && uid && uid !== 'guest') {
        const cleanUserLastStreak = (user?.lastStreakDate || '').split('T')[0];
        if (cleanUserLastStreak !== todayStr) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          const nextStreak = (cleanUserLastStreak === yesterdayStr && userStreak > 0) ? (userStreak + 1) : Math.max(1, userStreak);
          setUserStreak(nextStreak);
          setUser(prev => prev ? { ...prev, lastStreakDate: todayStr, streak: nextStreak } : prev);
          import('firebase/firestore').then(({ updateDoc, doc, serverTimestamp }) => {
            updateDoc(doc(db, 'users', uid), {
              streak: nextStreak,
              lastStreakDate: todayStr,
              lastActiveDate: todayStr,
              updatedAt: serverTimestamp()
            }).catch(() => {});
          }).catch(() => {});
        }
      }

      // Bonus Rewards: If all 3 daily goals are completed today, award bonus XP and Credits
      if (evaluated.length > 0 && allCompleted && uid && uid !== 'guest') {
        const alreadyAwardedToday = data?.allCompletedAwarded === true || (baseGoals.every(g => g.completed) && data?.allCompleted === true);
        if (!alreadyAwardedToday) {
          const bonusXP = ALL_GOALS_COMPLETION_BONUS?.xp || 100;
          const bonusCredits = ALL_GOALS_COMPLETION_BONUS?.credits || 50;
          awardUserXPAndCredits(uid, bonusXP, bonusCredits, 'ALL_DAILY_GOALS_COMPLETED', { date: todayStr });
          toast.success(`Outstanding! All 3 Daily Tasks Completed! Bonus +${bonusXP} XP & +${bonusCredits} SEED Credits awarded!`);
          saveUserDailyGoals(uid, todayStr, evaluated.map(g => ({ ...g, completed: true, awarded: true })), userStreak, seedCredits + bonusCredits);
        }
      }

      if (newlyAwardedGoals) {
        saveUserDailyGoals(uid, todayStr, evaluated, userStreak, seedCredits).catch(() => {});
      }

      if (user) {
        if (user.seedCredits !== undefined) setSeedCredits(user.seedCredits);
        if (user.totalXP !== undefined) {
          setTotalXP(user.totalXP);
          setUserLevelInfo(calculateLevel(user.totalXP));
        }
      }
    } catch (err) {
      console.warn('[Dashboard] Daily goals evaluation skipped:', err);
    }
  }, [user?.uid, user?.lastStreakDate, userStreak, seedCredits]);

  useEffect(() => {
    initProgressAndGoals();

    const handleProgressUpdate = (e) => {
      if (e?.detail?.progress) {
        setProgressData(e.detail.progress);
      }
      initProgressAndGoals();
    };

    const handleGamificationUpdate = (e) => {
      if (e.detail) {
        if (typeof e.detail.totalXP === 'number') {
          setTotalXP(e.detail.totalXP);
          setUserLevelInfo(calculateLevel(e.detail.totalXP));
        }
        if (typeof e.detail.seedCredits === 'number') {
          setSeedCredits(e.detail.seedCredits);
        }
      }
    };

    window.addEventListener('coding_progress_updated', handleProgressUpdate);
    window.addEventListener('user_gamification_updated', handleGamificationUpdate);
    window.addEventListener('storage', handleProgressUpdate);
    window.addEventListener('focus', handleProgressUpdate);

    return () => {
      window.removeEventListener('coding_progress_updated', handleProgressUpdate);
      window.removeEventListener('user_gamification_updated', handleGamificationUpdate);
      window.removeEventListener('storage', handleProgressUpdate);
      window.removeEventListener('focus', handleProgressUpdate);
    };
  }, [initProgressAndGoals]);

  useEffect(() => {
    if (activeTab === 'dashboard' || activeTab === 'profile') {
      initProgressAndGoals();
    }
  }, [activeTab, initProgressAndGoals]);

  // Verify tenant validity on mount and update user.tenant details
  useEffect(() => {
    DataService.verifyCurrentTenantStatus().then((res) => {
      if (res && res.valid === false) {
        alert(res.reason || "Your college subscription has expired or is inactive. Please reach out to your placement department.");
        navigate('/login?reason=subscription_expired');
      } else if (res?.tenant) {
        setUser(prev => prev ? { ...prev, tenant: res.tenant } : prev);
      }
    }).catch(() => {});
  }, [navigate]);

  // Log activity on Tab Change
  useEffect(() => {
    const uid = user?.uid || auth?.currentUser?.uid || 'guest';
    if (uid && uid !== 'guest') {
      import('../services/activityLoggerService').then(mod => {
        mod.logUserActivity(uid, 'PAGE_VIEW', { tab: activeTab });
      }).catch(() => { });
    }
  }, [activeTab, user]);

  const handleToggleGoal = async (idx) => {
    if (!dailyGoals || !dailyGoals[idx]) return;
    const goal = dailyGoals[idx];
    const willBeCompleted = !goal.completed;

    // Toggle goal and update Firestore + Local Profile cache
    const updated = dailyGoals.map((g, i) => (i === idx ? { ...g, completed: willBeCompleted, awarded: willBeCompleted } : g));
    setDailyGoals(updated);

    const uid = user?.uid || auth?.currentUser?.uid || 'guest';
    const todayStr = new Date().toISOString().split('T')[0];
    const wereAllCompletedBefore = dailyGoals.every(g => g.completed);
    const areAllCompletedNow = updated.every(g => g.completed);

    let nextStreak = userStreak;

    // Activity Log for Goal Toggle
    import('../services/activityLoggerService').then(mod => {
      mod.logUserActivity(uid, 'GOAL_TOGGLED', { goalId: goal.id, title: goal.title, completed: willBeCompleted });
    }).catch(() => { });

    if (willBeCompleted) {
      const xpVal = goal.xp || goal.points || 30;
      const creditsVal = goal.credits || 10;
      awardUserXPAndCredits(uid, xpVal, creditsVal, 'DAILY_TASK_MANUAL_COMPLETE', { goalId: goal.id, title: goal.title });
      toast.success(`"${goal.title}" completed! (+${xpVal} XP · +${creditsVal} Credits)`);

      // If it's a solve/difficulty goal, consider streak
      if (goal.type === 'difficulty' || goal.type === 'solve') {
        const lastDate = (user?.lastStreakDate || '').split('T')[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastDate !== todayStr) {
          nextStreak = (lastDate === yesterdayStr && userStreak > 0) ? (userStreak + 1) : Math.max(1, userStreak);
          setUserStreak(nextStreak);
          setUser(prev => prev ? { ...prev, lastStreakDate: todayStr, streak: nextStreak } : prev);
        }
      }
    }

    if (!wereAllCompletedBefore && areAllCompletedNow) {
      const bonusXP = ALL_GOALS_COMPLETION_BONUS?.xp || 100;
      const bonusCredits = ALL_GOALS_COMPLETION_BONUS?.credits || 50;
      awardUserXPAndCredits(uid, bonusXP, bonusCredits, 'ALL_DAILY_GOALS_COMPLETED', { date: todayStr });

      const lastDate = (user?.lastStreakDate || '').split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastDate !== todayStr) {
        nextStreak = (lastDate === yesterdayStr && userStreak > 0) ? (userStreak + 1) : Math.max(1, userStreak);
        setUserStreak(nextStreak);
        setUser(prev => prev ? { ...prev, lastStreakDate: todayStr, streak: nextStreak } : prev);
      }

      toast.success(`Streak Active! All 3 daily goals completed! +${bonusXP} XP & +${bonusCredits} SEED Credits bonus awarded!`);

      // Activity Log for Streak Approval
      import('../services/activityLoggerService').then(mod => {
        mod.logUserActivity(uid, 'STREAK_APPROVED', { streak: nextStreak, date: todayStr });
      }).catch(() => { });
    }

    await saveUserDailyGoals(uid, todayStr, updated, nextStreak, seedCredits);
  };

  const handleRefreshOrEditGoals = async () => {
    const uid = user?.uid || auth?.currentUser?.uid || 'guest';
    const todayStr = new Date().toISOString().split('T')[0];
    const nextOffset = goalOffset + 1;
    setGoalOffset(nextOffset);
    const newGoals = getDailyGoalsForDate(todayStr, uid, nextOffset);
    setDailyGoals(newGoals);
    await saveUserDailyGoals(uid, todayStr, newGoals, userStreak, seedCredits);
    toast.info('Refreshed 3 new daily goals for today!');
  };

  // ─── Course Syllabi & Dynamic Progress Mapping ───────────────────────
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
      if (cSyllabus && cSyllabus.modules) {
        cSyllabus.modules.forEach(m => (m.submodules || []).forEach(s => (s.problems || []).forEach(p => cQids.push(p.id))));
      }
      const javaQids = [];
      if (javaSyllabus && javaSyllabus.modules) {
        javaSyllabus.modules.forEach(m => (m.submodules || []).forEach(s => (s.problems || []).forEach(p => javaQids.push(p.id))));
      }
      const cppQids = [];
      if (cppSyllabus && cppSyllabus.modules) {
        cppSyllabus.modules.forEach(m => (m.submodules || []).forEach(s => (s.problems || []).forEach(p => cppQids.push(p.id))));
      }
      const dsaQids = [];
      if (dsaSyllabus && dsaSyllabus.modules) {
        dsaSyllabus.modules.forEach(m => (m.submodules || []).forEach(s => (s.problems || []).forEach(p => dsaQids.push(p.id))));
      }
      setCQuestionIds(cQids);
      setJavaQuestionIds(javaQids);
      setCppQuestionIds(cppQids);
      setDsaQuestionIds(dsaQids);
    });
  }, []);

  // ─── Dynamic Current Week Activity Calculation ──────────────────────
  const currentWeekDays = useMemo(() => {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0: Sunday, 1: Monday, ... 6: Saturday
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - currentDayOfWeek);

    const activity = progressData?.activity || {};
    const details = progressData?.problemDetails || {};

    // Set of active date strings "YYYY-MM-DD"
    const activeDateSet = new Set();
    Object.keys(activity).forEach(d => {
      if (activity[d]?.problemsSolved > 0 || activity[d]?.hours > 0) activeDateSet.add(d);
    });
    Object.values(details).forEach(p => {
      if ((p.status === 'SOLVED' || p.lastSolvedAt) && p.lastSolvedAt) {
        activeDateSet.add(p.lastSolvedAt.split('T')[0]);
      }
    });

    const days = [];
    let activeDaysCount = 0;
    const todayStr = today.toISOString().split('T')[0];

    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isToday = dateStr === todayStr;
      const isActive = activeDateSet.has(dateStr);

      if (isActive) activeDaysCount++;

      days.push({
        dayLetter: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][i],
        dateNum: d.getDate(),
        dateStr,
        isActive,
        isToday
      });
    }

    return { days, activeDaysCount };
  }, [progressData]);

  // ─── Dynamic Activity Snapshot Stats ────────────────────────────────
  const activitySnapshotStats = useMemo(() => {
    const details = progressData?.problemDetails || {};
    const activity = progressData?.activity || {};
    const solvedList = progressData?.solvedProblems || progressData?.completedQuestions || [];
    const detailsSolved = Object.values(details).filter(p => p?.status === 'SOLVED').length;
    const totalSolved = Math.max(solvedList.length, detailsSolved);

    // Accuracy Calculation
    const problemEntries = Object.values(details);
    let totalAttempts = 0;
    let totalScore = 0;
    let scoredProblemsCount = 0;

    problemEntries.forEach(p => {
      const attempts = typeof p.attempts === 'number' && p.attempts > 0 ? p.attempts : 1;
      totalAttempts += attempts;
      if (typeof p.bestScore === 'number') {
        totalScore += p.bestScore;
        scoredProblemsCount++;
      }
    });

    let accuracy = 0;
    if (scoredProblemsCount > 0) {
      // Average score percentage across attempted problems
      accuracy = Math.round(totalScore / scoredProblemsCount);
    } else if (totalAttempts > 0) {
      // Solved vs total attempts ratio
      accuracy = Math.min(100, Math.round((totalSolved / totalAttempts) * 100));
    } else if (totalSolved > 0) {
      accuracy = 100;
    } else {
      accuracy = 0;
    }

    // Today vs Yesterday Time & Problems
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const yestStr = yest.toISOString().split('T')[0];

    const todayHours = activity[todayStr]?.hours || 0;
    const todayMins = Math.round(todayHours * 60);
    const yestHours = activity[yestStr]?.hours || 0;
    const yestMins = Math.round(yestHours * 60);

    const todaySolvedCount = activity[todayStr]?.problemsSolved || 0;
    const yestSolvedCount = activity[yestStr]?.problemsSolved || 0;

    const solvedDiff = todaySolvedCount - yestSolvedCount;
    const timeDiffMins = todayMins - yestMins;

    return {
      totalSolved,
      todayMins,
      todayMinsFormatted: todayMins >= 60 ? `${(todayMins / 60).toFixed(1)} hrs` : `${todayMins} mins`,
      accuracy,
      solvedTrend: solvedDiff > 0 ? `+${solvedDiff} vs yesterday` : solvedDiff < 0 ? `${solvedDiff} vs yesterday` : '0 vs yesterday',
      timeTrend: timeDiffMins > 0 ? `+${timeDiffMins}m vs yesterday` : timeDiffMins < 0 ? `${timeDiffMins}m vs yesterday` : '0m vs yesterday',
      accuracyTrend: accuracy > 0 ? `${accuracy}% overall` : 'No attempts yet'
    };
  }, [progressData]);

  const solvedIdsSet = useMemo(() => {
    const ids = progressData?.solvedProblems || [];
    return new Set(ids.map(String));
  }, [progressData]);

  const rawCoursesList = useMemo(() => {
    const list = [
      {
        id: 'learn_c',
        title: 'Learn C',
        subtitle: 'Foundations & Pointers',
        icon: <FaCode />,
        boxClass: 'box-green',
        barClass: 'bar-green',
        qids: cQuestionIds,
        defaultTotal: 42
      },
      {
        id: 'learn_java',
        title: 'Learn Java',
        subtitle: 'OOP & Collections',
        icon: <FaThLarge />,
        boxClass: 'box-blue',
        barClass: 'bar-blue',
        qids: javaQuestionIds,
        defaultTotal: 40
      },
      {
        id: 'learn_cpp',
        title: 'Learn C++',
        subtitle: 'STL & Competitive Coding',
        icon: <FaRocket />,
        boxClass: 'box-purple',
        barClass: 'bar-purple',
        qids: cppQuestionIds,
        defaultTotal: 39
      },
      {
        id: 'learn_dsa',
        title: 'Data Structures & Algorithms',
        subtitle: 'Trees, Graphs & DP',
        icon: <FaGem />,
        boxClass: 'box-orange',
        barClass: 'bar-orange',
        qids: dsaQuestionIds,
        defaultTotal: 38
      }
    ];

    return list.map(c => {
      const totalTopics = c.qids.length || c.defaultTotal;
      const completedTopics = c.qids.filter(id => solvedIdsSet.has(String(id))).length;
      const pct = Math.min(100, Math.round((completedTopics / Math.max(1, totalTopics)) * 100));
      return {
        ...c,
        totalTopics,
        completedTopics,
        percentage: pct,
        isStarted: completedTopics > 0
      };
    });
  }, [cQuestionIds, javaQuestionIds, cppQuestionIds, dsaQuestionIds, solvedIdsSet]);

  const [dashboardEnrolledProgress, setDashboardEnrolledProgress] = useState({});

  useEffect(() => {
    let isMounted = true;
    async function loadDashboardCourses() {
      const uid = user?.uid || 'guest';
      const enrolled = await fetchEnrolledCourseIds(uid);
      const map = {};
      for (const course of COURSE_CATALOG) {
        if (enrolled.includes(course.courseId)) {
          const prog = await getCourseProgress(uid, course);
          if (prog) map[course.courseId] = prog;
        }
      }
      if (isMounted) setDashboardEnrolledProgress(map);
    }
    loadDashboardCourses();
    return () => { isMounted = false; };
  }, [user?.uid, activeTab]);

  const displayedCourses = useMemo(() => {
    const uid = user?.uid || 'guest';
    const enrolledIds = getEnrolledCourseIds(uid);

    const enrolledCourses = COURSE_CATALOG.filter(c => enrolledIds.includes(c.courseId)).map(c => {
      const prog = dashboardEnrolledProgress[c.courseId];
      const pct = prog?.percentage || 0;
      const totalModules = c.modules?.length || 1;
      const completedModules = typeof prog?.completedModules === 'number'
        ? prog.completedModules
        : Object.values(prog?.modules || {}).filter(m => m?.completed).length;
      const currentMod = c.modules?.find(m => m.moduleId === prog?.currentModuleId) || c.modules?.[0];
      const currentTopic = currentMod?.topics?.find(t => t.topicId === prog?.currentTopicId) || currentMod?.topics?.[0];

      return {
        id: c.courseId,
        title: c.title,
        subtitle: currentTopic
          ? `${currentMod?.title?.replace(/^Module\s*\d+:\s*/i, '')} • ${currentTopic.title?.replace(/^\d+\.\d+\s*/, '')}`
          : (c.description || currentMod?.title || c.category),
        description: c.description || '',
        percentage: pct,
        completedTopics: completedModules,
        totalTopics: totalModules,
        isStarted: pct > 0,
        rawCourse: c,
        boxClass: 'box-blue',
        barClass: 'bar-blue',
        icon: <FaCode />
      };
    });

    if (enrolledCourses.length > 0) {
      return enrolledCourses.slice(0, 4);
    }

    return COURSE_CATALOG.slice(0, 4).map(c => ({
      id: c.courseId,
      title: c.title,
      subtitle: c.description || `${c.modules?.length || 1} Modules • ${c.level}`,
      description: c.description || '',
      percentage: 0,
      completedTopics: 0,
      totalTopics: c.modules?.length || 1,
      isStarted: false,
      rawCourse: c,
      boxClass: 'box-blue',
      barClass: 'bar-blue',
      icon: <FaCode />
    }));
  }, [dashboardEnrolledProgress, user?.uid]);

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
    const email = user.email ?? '';
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
          const lastActiveMs = lastSavedAt ? lastSavedAt.getTime() : (data.submittedAt ? new Date(data.submittedAt).getTime() : 0);
          const elapsedOfflineSec = lastActiveMs ? Math.floor((nowMs - lastActiveMs) / 1000) : Infinity;

          if (elapsedOfflineSec <= 300) {
            setActiveResumeSession({
              type: data.type || 'multisection',
              id: data.assessmentId || docSnap.id,
              name: data.assessmentTitle || data.assessmentTitle || 'Active Assessment',
              slug: data.slug || data.assessmentId || docSnap.id,
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
      localStorage.setItem(`msaProgress_${session.id}`, JSON.stringify(session.remoteSnapshot));
      sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(session.remoteSnapshot.assessmentData || { id: session.id, name: session.name }));
      navigate(`/student/assessment/id/${session.slug}`);
      return;
    }

    if (session.assessmentData) {
      sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(session.assessmentData));
    }
    navigate(`/student/assessment/id/${session.slug}`);
  };

  useEffect(() => {
    const checkAiInterviewAccess = async () => {
      if (!user) return;
      const userEmail = (user.email ?? "").trim().toLowerCase();
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

  // Initial welcome quote fetch (Commented out)
  /*
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
  */

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

  // ─── Streamlined Launch State ─────────────────────────────────────
  const [launchStep, setLaunchStep] = useState(null); // null | 'modal'
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [eligibilityError, setEligibilityError] = useState(null);
  const [isLaunching, setIsLaunching] = useState(false);

  // Passkey
  const [passkeyInput, setPasskeyInput] = useState("");
  const [passkeyError, setPasskeyError] = useState("");
  const [showPasskey, setShowPasskey] = useState(false);
  const passkeyInputRef = useRef(null);

  // Themes Dropdown (Profile Tab)
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const themeDropdownRef = useRef(null);

  // Instant Pre-flight checks
  const [preflightResults, setPreflightResults] = useState({
    internet: 'pass',
    webcam: 'pass',
    microphone: 'pass',
    secureEnv: 'pass'
  });
  // ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target)) {
        setThemeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    const authData = getAuthData() || {};
    const userEmail = (authData.email ?? '').toLowerCase();
    const userUid = authData.uid ?? auth?.currentUser?.uid ?? '';
    if (userEmail || userUid) {
      setUser(authData);
      loadAssessments(authData);

      // ── Force completion refresh when returning from an assessment ──
      if (location.state?.justCompleted) {
        if (userEmail) invalidateCompletionCache(userEmail);
        window.history.replaceState({}, '', window.location.pathname);
      }

      // ── Firestore profile enrichment (background, non-blocking) ──
      // Reads users/{uid} and merges fresh canonical profile fields into user state
      const enrichProfile = async () => {
        const lookupId = auth?.currentUser?.uid || userUid;
        if (!lookupId) {
          console.warn('[Dashboard] enrichProfile: no Firebase Auth UID. Skipping.');
          return;
        }
        try {
          const profileSnap = await getDoc(doc(db, 'users', lookupId));
          if (profileSnap.exists()) {
            const p = profileSnap.data();

            const enriched = {
              ...authData,
              ...p,
              uid: lookupId,
              email: (p.email ?? authData.email ?? userEmail).toLowerCase(),
              tenantId: p.tenantId ?? authData.tenantId ?? p.college ?? '',
              college: p.college ?? authData.college ?? p.tenantId ?? '',
              name: p.name ?? authData.name ?? '',
              rollNumber: p.rollNumber ?? authData.rollNumber ?? '',
              cohortId: p.cohortId ?? authData.cohortId ?? p.year ?? '',
              year: p.year ?? authData.year ?? p.cohortId ?? '',
              department: p.department ?? authData.department ?? '',
              phone: p.phone ?? authData.phone ?? '',
              role: p.role ?? authData.role ?? 'student',
              isPremium: Boolean(p.isPremium ?? authData.isPremium),
              seedCredits: typeof p.seedCredits === 'number' ? p.seedCredits : (typeof authData.seedCredits === 'number' ? authData.seedCredits : 2450),
              totalXP: typeof p.totalXP === 'number' ? p.totalXP : (typeof authData.totalXP === 'number' ? authData.totalXP : 0),
              level: typeof p.level === 'number' ? p.level : (typeof authData.level === 'number' ? authData.level : 1),
              streak: typeof p.streak === 'number' ? p.streak : (typeof authData.streak === 'number' ? authData.streak : 0),
              lastStreakDate: p.lastStreakDate ?? authData.lastStreakDate ?? null,
              photoURL: p.photoURL ?? authData.photoURL ?? '',
              isAuthenticated: true,
            };
            setUser(enriched);
            if (enriched.seedCredits !== undefined) setSeedCredits(enriched.seedCredits);
            if (enriched.streak !== undefined) setUserStreak(enriched.streak);
            if (enriched.totalXP !== undefined) {
              setTotalXP(enriched.totalXP);
              setUserLevelInfo(calculateLevel(enriched.totalXP));
            }
            localStorage.setItem('auth_data', JSON.stringify(enriched));

            if (!authData.tenantId && enriched.tenantId) {
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
      // ── Fetch TestDocs strictly from courses/{courseId}/series/{seriesId}/tests/{testId}
      // Strictly official assessments created by Admin and Staff (never real courses)
      let testDocs = await DataService.getAllowedTestDocs();

      const isPremiumUser = Boolean(userData?.isPremium) === true;

      const combined = (testDocs || []).map(t => {
          // Normalise schedule from { startDate, startTime, endDate, endTime } or { start, end }
          let schedule = null;
          if (t.schedule) {
            if (t.schedule.startDate) {
              schedule = {
                startDate: t.schedule.startDate,
                startTime: t.schedule.startTime || '00:00:00',
                endDate: t.schedule.endDate,
                endTime: t.schedule.endTime || '23:59:59',
                timezone: t.schedule.timezone || 'Asia/Kolkata',
              };
            } else if (t.schedule.start || t.schedule.end) {
              const s = t.schedule.start ? new Date(t.schedule.start) : null;
              const e = t.schedule.end ? new Date(t.schedule.end) : null;
              if (s || e) {
                schedule = {
                  startDate: s ? s.toISOString().slice(0, 10) : '',
                  startTime: s ? s.toTimeString().slice(0, 8) : '00:00:00',
                  endDate: e ? e.toISOString().slice(0, 10) : '',
                  endTime: e ? e.toTimeString().slice(0, 8) : '23:59:59',
                  timezone: t.schedule.timezone || 'Asia/Kolkata',
                };
              }
            }
          }

          const durMin = t.duration_minutes || t.duration || t.timeLimit || 45;
          const qCount = t.questionCount || (Array.isArray(t.sections) && t.sections.length > 0
            ? t.sections.reduce((acc, s) => acc + (s.questionCount || (Array.isArray(s.questions) ? s.questions.length : 0) || (Array.isArray(s.problems) ? s.problems.length : 0)), 0)
            : 15);

          // All assessments use the unified Assessment runtime (MSA).
          const isMultiSection = true;

          return {
            // ── identity ──
            id: t.id,
            courseId: t.courseId,
            seriesId: t.seriesId,
            // ── display ──
            name: t.name,
            description: t.description || `Milestone assessment evaluation covering core concepts in ${t.name}.`,
            seriesName: t.seriesTitle || t.courseTitle || 'Assessments',
            seriesDescription: t.seriesDescription || `Comprehensive milestone evaluation and evaluation series for ${t.seriesTitle || t.courseTitle || 'programming tracks'}.`,
            courseTitle: t.courseTitle ?? '',
            seriesKey: t.seriesId || t.courseId || 'general',
            difficulty: t.difficulty || 'Medium',
            // ── engine routing ──
            type: 'assessment',
            isMultiSection,
            slug: t.assessmentId || t.slug || t.id,
            url: t.cdnUrl ?? '',
            cdnUrl: t.cdnUrl ?? '',
            // ── sections ──
            sections: t.sections || [],
            // ── timing ──
            duration: durMin,
            timeLimit: durMin,
            schedule,
            // ── access ──
            passkey: t.passkey ?? '',
            isPremium: Boolean(t.isPremium || t.accessTier === 'premium'),
            isGlobal: Boolean(t.isGlobal),
            accessTier: t.accessTier || (t.isPremium ? 'premium' : 'free'),
            entryFeeINR: t.entryFeeINR || 0,
            isLocked: Boolean(
              ((t.isPremium || t.accessTier === 'premium') && !isPremiumUser) ||
              (t.accessTier === 'paid_entry' && !isPremiumUser && !userData?.contestPasses?.[t.id])
            ),
            guestEnabled: t.guestEnabled,
            // ── proctor ──
            proctored: t.proctored !== false,
            audioProctored: Boolean(t.audioProctored),
            maxViolations: t.maxViolations ?? 5,
            maxAudioViolations: t.maxAudioViolations ?? 3,
            // ── settings ──
            settings: t.settings,
            display_order: t.display_order ?? 999,
            totalMarks: t.totalMarks || t.maxScore || 100,
            questionCount: qCount,
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
        return (a.schedule?.startDate ?? '').localeCompare(b.schedule?.startDate ?? '');
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
    if (!schedule || typeof schedule !== 'object' || !schedule.startDate) {
      return { status: "Active", reason: "Always open" };
    }
    try {
      const now = (typeof timeService !== "undefined" && timeService?.getNow) ? timeService.getNow() : new Date();
      const startTimeStr = (schedule.startTime && typeof schedule.startTime === 'string' && schedule.startTime.trim()) ? schedule.startTime.trim() : "00:00:00";
      const start = new Date(schedule.startDate + (schedule.startDate.includes('T') ? '' : 'T' + startTimeStr));
      const end = schedule.endDate ? new Date(schedule.endDate + (schedule.endDate.includes('T') ? '' : 'T' + ((schedule.endTime && typeof schedule.endTime === 'string') ? schedule.endTime.trim() : "23:59:59"))) : null;

      if (start && !isNaN(start.getTime()) && now < start) {
        return {
          status: "Upcoming",
          reason: `Unlocks on ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          time: start
        };
      }
      if (end && !isNaN(end.getTime()) && now > end) {
        return {
          status: "Expired",
          reason: `Ended on ${end.toLocaleDateString()} at ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
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
  // ─────────────────────────────────────────────────────────────────
  // STREAMLINED UNIFIED ASSESSMENT LAUNCH
  // ─────────────────────────────────────────────────────────────────

  const cancelWizard = () => {
    setLaunchStep(null);
    setSelectedAssessment(null);
    setPasskeyInput("");
    setPasskeyError("");
    setEligibilityError(null);
    setIsLaunching(false);
  };

  const runParallelPreflight = async (assessment) => {
    const isProctored = Boolean(assessment.proctored && assessment.proctored !== 'false');
    const internet = navigator.onLine ? 'pass' : 'fail';
    let webcam = 'pass';
    let microphone = 'pass';

    if (isProctored && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        webcam = devices.some(d => d.kind === 'videoinput') ? 'pass' : 'fail';
        microphone = devices.some(d => d.kind === 'audioinput') ? 'pass' : 'fail';
      } catch (_) {
        webcam = 'pass'; // Non-blocking in desktop environment
        microphone = 'pass';
      }
    }

    setPreflightResults({
      internet,
      webcam: isProctored ? webcam : 'pass',
      microphone: isProctored ? microphone : 'pass',
      secureEnv: 'pass'
    });
  };

  // Direct Streamlined Launch on test click
  const handleStartClick = (assessment) => {
    if (!assessment) return;

    // 0. Schedule restriction guard
    if (assessment.schedule) {
      const schedCheck = getScheduleStatus(assessment.schedule);
      if (schedCheck.status === "Upcoming") {
        toast.error(`This assessment is not open yet. ${schedCheck.reason}. Please wait until the scheduled start time.`);
        return;
      }
      if (schedCheck.status === "Expired") {
        toast.error(`The access window for this assessment has ended. ${schedCheck.reason}. Access is locked.`);
        return;
      }
    }

    if (assessment.completed) {
      toast.error('You have already completed and submitted this assessment. Re-attempts are not permitted.');
      return;
    }

    // Guard: Premium or Paid Contest Pass access
    if (assessment.isLocked) {
      if (assessment.accessTier === 'paid_entry') {
        handleContestPassCheckout(assessment);
      } else {
        toast.info("⭐ This assessment or contest requires SEED Premium access.");
        setShowPremiumModal(true);
      }
      return;
    }

    // Direct launch into the unified Assessment runtime
    sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(assessment));
    sessionStorage.setItem('msaCourseCtx', JSON.stringify({
      courseId: assessment.courseId ?? '',
      seriesId: assessment.seriesId ?? '',
      assessmentId: assessment.id ?? '',
      totalMarks: assessment.maxScore || 100,
      settings: assessment.settings || {},
    }));
    navigate(`/student/assessment/id/${assessment.slug}`);
  };

  // Validate passkey, eligibility, and launch workspace immediately
  const handleUnifiedLaunch = async () => {
    if (!selectedAssessment || isLaunching) return;

    // 0. Double-check schedule window
    if (selectedAssessment.schedule) {
      const schedLock = getScheduleStatus(selectedAssessment.schedule);
      if (schedLock.status === "Upcoming") {
        setEligibilityError({
          title: "Assessment Not Started",
          message: `This assessment has not started yet. ${schedLock.reason}.`
        });
        return;
      }
      if (schedLock.status === "Expired") {
        setEligibilityError({
          title: "Assessment Schedule Expired",
          message: `This assessment's schedule has ended. ${schedLock.reason}. Access is locked.`
        });
        return;
      }
    }

    // 1. Mandatory passkey check if test requires it
    if (selectedAssessment.passkey) {
      if (!passkeyInput.trim()) {
        setPasskeyError("Please enter the access passkey.");
        if (passkeyInputRef.current) passkeyInputRef.current.focus();
        return;
      }
      if (passkeyInput.trim() !== selectedAssessment.passkey) {
        setPasskeyError("Incorrect passkey. Please try again.");
        if (passkeyInputRef.current) passkeyInputRef.current.focus();
        return;
      }
    }

    setIsLaunching(true);
    setPasskeyError("");

    try {
      if (!navigator.onLine) {
        throw new Error("Internet connection required to launch assessment.");
      }

      const liveUid = auth?.currentUser?.uid;
      if (!liveUid) throw new Error('Authentication required. Please log in again.');

      // 2. Instant eligibility / duplicate check
      const tenantId = user?.tenantId || user?.college || 'default';
      try {
        if (selectedAssessment.id) {
          const canonDocPath = `assessmentResults/${tenantId}/${selectedAssessment.id}/${liveUid}`;
          const docSnap = await getDoc(doc(db, canonDocPath));
          const isCompleted = docSnap.exists() && (docSnap.data().completed === true || docSnap.data().status === 'submitted');
          if (isCompleted) {
            setIsLaunching(false);
            setEligibilityError({
              title: "Assessment Already Completed",
              message: "You have already completed and submitted this assessment. Re-attempts are not permitted."
            });
            return;
          }
        }
      } catch (checkErr) {
        console.warn("Non-fatal eligibility check issue:", checkErr);
      }

      // 3. Launch directly into workspace
      await launchAssessment(selectedAssessment);
    } catch (err) {
      console.error("Launch failed:", err);
      setIsLaunching(false);
      setEligibilityError({
        title: "Launch Error",
        message: err.message || "Failed to start the assessment. Please try again."
      });
    }
  };

  // STEP 5 — Load JSON + create initial Firebase doc + navigate
  const launchAssessment = async (assessment) => {
    try {
      // Final schedule restriction check
      if (assessment.schedule) {
        const schedFinal = getScheduleStatus(assessment.schedule);
        if (schedFinal.status === "Upcoming" || schedFinal.status === "Expired") {
          setEligibilityError({
            title: schedFinal.status === "Upcoming" ? "Assessment Not Started" : "Assessment Schedule Expired",
            message: schedFinal.reason
          });
          return;
        }
      }
      const now = timeService.now();
      const nowISO = timeService.getNow().toISOString();
      const durationSec = assessment.duration * 60;

      // ── UNIFIED LAUNCH (all assessments go through MultiSectionAssessment) ──
      // normalizeAssessment guarantees sections always exist. If the Firestore doc
      // has inline questions (legacy MCQ) they are wrapped in a 1-section Assessment.
      const canonicalAss = assessment;
      sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(canonicalAss));
      sessionStorage.setItem('msaCourseCtx', JSON.stringify({
        courseId: assessment.courseId ?? '',
        seriesId: assessment.seriesId ?? '',
        assessmentId: assessment.id ?? '',
        totalMarks: assessment.maxScore || 100,
        settings: assessment.settings || {},
      }));
      setLaunchStep(null);
      navigate(`/student/assessment/id/${assessment.slug}`);
      return;
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

  const name = user?.name || user?.Name || user?.fullName || "Student";
  const email = user?.email || user?.Email || "";
  const college = user?.college || user?.College || user?.collegeName || user?.tenantName || user?.tenantId || "";
  const rollNumber = user?.rollNumber || user?.RollNumber || user?.rollNo || user?.RollNo || user?.regNo || user?.RegNo || "";
  const year = user?.year || user?.Year || user?.cohortId || user?.CohortId || "";
  const dept = user?.department || user?.Department || user?.dept || user?.Dept || user?.branch || user?.Branch || "";

  const renderDashboardHome = () => {
    const totalBankQuestions = 9328;
    const liveSolvedCount = Math.max(
      progressData?.solvedProblems?.length || 0,
      progressData?.completedQuestions?.length || 0,
      Object.values(progressData?.problemDetails || {}).filter(p => p?.status === 'SOLVED').length
    );
    const liveAttemptedCount = Math.max(
      liveSolvedCount,
      progressData?.attemptedQuestions?.length || 0,
      Object.keys(progressData?.problemDetails || {}).length || 0
    );
    const liveUnattemptedCount = Math.max(0, totalBankQuestions - liveAttemptedCount);
    const liveSolvedPct = totalBankQuestions > 0 ? ((liveSolvedCount / totalBankQuestions) * 100).toFixed(1) : '0.0';
    const liveAttemptedPct = totalBankQuestions > 0 ? (((liveAttemptedCount - liveSolvedCount) / totalBankQuestions) * 100).toFixed(1) : '0.0';
    const liveUnattemptedPct = totalBankQuestions > 0 ? ((liveUnattemptedCount / totalBankQuestions) * 100).toFixed(1) : '100.0';
    const donutDashArray = `${Math.min(100, Math.max(liveSolvedCount > 0 ? 2 : 0, Math.round((liveSolvedCount / totalBankQuestions) * 100)))}, 100`;

    return (
      <div className="dashboard-grid-layout">
        {/* ── Left / Center Main Feed Column ── */}
        <div className="dashboard-main-col">
          {/* Welcome Header */}
          <div className="home-welcome-header">
            <h1 className="home-welcome-title">Welcome back, {name}!</h1>
            <p className="home-welcome-subtitle">Stay consistent and keep building your problem solving skills.</p>
          </div>

          {/* 1. Quick Start */}
          <div className="home-section-block">
            <h3 className="home-section-heading">Quick Start</h3>
            <div className="quick-start-grid">
              <div
                className="quick-start-card"
                onClick={() => setActiveTab('assessments')}
              >
                <div className="qs-icon-box qs-purple">
                  <FaBookOpen />
                </div>
                <div className="qs-info">
                  <h4 className="qs-title">Assessments</h4>
                  <span className="qs-sub">Attempt tests</span>
                </div>
                <FaChevronRight className="qs-arrow" />
              </div>

              <div
                className="quick-start-card"
                onClick={() => {
                  setPracticeInitialTab('bank');
                  setPracticeInitialCourse(null);
                  setActiveTab('practice');
                }}
              >
                <div className="qs-icon-box qs-orange">
                  <FaBullseye />
                </div>
                <div className="qs-info">
                  <h4 className="qs-title">Weak Areas</h4>
                  <span className="qs-sub">Improve your skills</span>
                </div>
                <FaChevronRight className="qs-arrow" />
              </div>
            </div>
          </div>

          {/* 2. Your Activity Snapshot */}
          <div className="home-section-block">
            <h3 className="home-section-heading">Your Activity Snapshot</h3>
            <div className="activity-snapshot-grid">
              <div className="activity-snapshot-card">
                <div className="snapshot-icon-box icon-green">
                  <FaThLarge />
                </div>
                <div className="snapshot-stat-val">
                  {activitySnapshotStats.totalSolved}
                  <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500, marginLeft: '4px' }}>/ 9,000+</span>
                </div>
                <div className="snapshot-stat-lbl">Questions Solved</div>
                <div className="snapshot-stat-trend trend-green">
                  <FaArrowUp style={{ fontSize: '10px' }} /> {activitySnapshotStats.solvedTrend}
                </div>
              </div>

              <div className="activity-snapshot-card">
                <div className="snapshot-icon-box icon-blue">
                  <FaClock />
                </div>
                <div className="snapshot-stat-val">{activitySnapshotStats.todayMinsFormatted}</div>
                <div className="snapshot-stat-lbl">Time Spent Today</div>
                <div className="snapshot-stat-trend trend-blue">
                  <FaArrowUp style={{ fontSize: '10px' }} /> {activitySnapshotStats.timeTrend}
                </div>
              </div>

              <div className="activity-snapshot-card">
                <div className="snapshot-icon-box icon-orange">
                  <FaFire />
                </div>
                <div className="snapshot-stat-val">{userStreak} Day{userStreak === 1 ? '' : 's'}</div>
                <div className="snapshot-stat-lbl">Current Streak</div>
                <div className="snapshot-stat-trend trend-orange">
                  <FaArrowUp style={{ fontSize: '10px' }} /> {userStreak > 1 ? `${userStreak} days active` : 'Active today'}
                </div>
              </div>

              <div className="activity-snapshot-card">
                <div className="snapshot-icon-box icon-purple">
                  <FaBullseye />
                </div>
                <div className="snapshot-stat-val">{activitySnapshotStats.accuracy}%</div>
                <div className="snapshot-stat-lbl">Accuracy</div>
                <div className="snapshot-stat-trend trend-purple">
                  <FaArrowUp style={{ fontSize: '10px' }} /> {activitySnapshotStats.accuracyTrend}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Continue Learning */}
          <div className="home-section-block">
            <div className="home-section-header-row">
              <h3 className="home-section-heading">Continue Learning</h3>
              <button
                className="home-section-link-btn"
                onClick={() => {
                  setActiveTab('my-learning');
                }}
              >
                View All
              </button>
            </div>

            <div className="continue-learning-grid">
              {displayedCourses.map(course => (
                <div
                  key={course.id}
                  className="continue-course-card"
                  onClick={() => {
                    if (course.rawCourse) {
                      const cid = course.rawCourse.courseId || course.rawCourse.id || course.rawCourse.slug || course.id;
                      try { sessionStorage.setItem(`seed_learning_course_${cid}`, JSON.stringify(course.rawCourse)); } catch (_) {}
                      navigate(`/student/learning/${cid}?view=CLASS`, { state: { view: 'CLASS' } });
                    } else if (course.id) {
                      navigate(`/student/learning/${course.id}?view=CLASS`, { state: { view: 'CLASS' } });
                    } else {
                      setActiveTab('my-learning');
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="course-card-top">
                    <div className={`course-icon-box ${course.boxClass}`}>
                      {course.icon}
                    </div>
                    <button className="course-menu-btn" onClick={(e) => e.stopPropagation()}>
                      ⋮
                    </button>
                  </div>
                  <h4 className="course-card-title" title={course.title}>{course.title}</h4>
                  <p className="course-card-sub" title={course.subtitle || course.description}>{course.subtitle || course.description}</p>
                  <div className="course-progress-track">
                    <div className={`course-progress-bar ${course.barClass}`} style={{ width: `${course.percentage}%` }} />
                  </div>
                  <div className="course-card-footer">
                    <span className="course-pct-label">{course.percentage > 0 ? `${course.percentage}% Completed` : 'Available to Start'}</span>
                    <span className="course-topics-count">{course.completedTopics}/{course.totalTopics} Modules</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Recent Activity (Commented out) */}
          {/*
          <div className="home-section-block">
            <div className="home-section-header-row">
              <h3 className="home-section-heading">Recent Activity</h3>
              <button
                className="home-section-link-btn"
                onClick={() => setActiveTab('practice')}
              >
                View All
              </button>
            </div>

            <div className="recent-activity-rows-list">
              <div
                className="recent-activity-row-item"
                onClick={() => {
                  setPracticeInitialTab('bank');
                  setActiveTab('practice');
                }}
              >
                <div className="act-avatar-box act-green">
                  <FaLaptopCode />
                </div>
                <div className="act-info-col">
                  <h4 className="act-item-title">Visited Practice Bank</h4>
                  <span className="act-item-sub">Math • 2 hours ago</span>
                </div>
                <FaChevronRight className="act-arrow" />
              </div>

              <div
                className="recent-activity-row-item"
                onClick={() => setActiveTab('profile')}
              >
                <div className="act-avatar-box act-purple">
                  <FaUser />
                </div>
                <div className="act-info-col">
                  <h4 className="act-item-title">Profile Updated</h4>
                  <span className="act-item-sub">Today</span>
                </div>
                <FaChevronRight className="act-arrow" />
              </div>
            </div>
          </div>
          */}
        </div>

        {/* ── Right Column (Widgets Feed) ── */}
        <div className="dashboard-side-col">
          {/* Card 1: This Week */}
          <div className="dashboard-widget-card">
            <div className="widget-card-header">
              <span className="widget-card-title">This Week</span>
              <button
                className="widget-link-btn"
                onClick={() => setActiveTab('profile')}
              >
                View Report
              </button>
            </div>

            <div className="week-tracker-days-grid">
              {currentWeekDays.days.map((d, idx) => (
                <span key={idx} className={`week-day-letter ${d.isToday ? 'today' : ''}`}>{d.dayLetter}</span>
              ))}
            </div>

            <div className="week-tracker-circles-grid">
              {currentWeekDays.days.map((d, idx) => (
                <div
                  key={idx}
                  className={`week-date-circle ${d.isActive ? 'active' : ''} ${d.isToday ? 'today' : ''}`}
                  title={`${d.dateStr}: ${d.isActive ? 'Activity logged' : 'No activity logged'}`}
                >
                  {d.dateNum}
                </div>
              ))}
            </div>

            <div className="week-streak-footer">
              {currentWeekDays.activeDaysCount > 0
                ? `Great job! ${currentWeekDays.activeDaysCount} active day${currentWeekDays.activeDaysCount === 1 ? '' : 's'} this week.`
                : `No activity yet this week. Solve a problem to light up your streak!`}
            </div>
          </div>

          {/* Card 2: Progress Overview */}
          <div className="dashboard-widget-card">
            <div className="widget-card-header">
              <span className="widget-card-title">Progress Overview</span>
            </div>

            <div className="progress-overview-wrap">
              <div className="po-donut-box">
                <svg viewBox="0 0 36 36" className="po-donut-svg">
                  <path
                    className="po-donut-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="po-donut-fill"
                    strokeDasharray={donutDashArray}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="po-center-text">
                  <span className="po-num">{liveSolvedCount}</span>
                  <span className="po-denom">/{totalBankQuestions}</span>
                </div>
              </div>

              <div className="po-legend-col">
                <div className="po-legend-item">
                  <span className="po-dot dot-green" />
                  <span className="po-label">Solved</span>
                  <span className="po-val">{liveSolvedCount} ({liveSolvedPct}%)</span>
                </div>
                <div className="po-legend-item">
                  <span className="po-dot dot-blue" />
                  <span className="po-label">Attempted</span>
                  <span className="po-val">{Math.max(0, liveAttemptedCount - liveSolvedCount)} ({liveAttemptedPct}%)</span>
                </div>
                <div className="po-legend-item">
                  <span className="po-dot dot-grey" />
                  <span className="po-label">Unattempted</span>
                  <span className="po-val">{liveUnattemptedCount} ({liveUnattemptedPct}%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Skills Overview (Commented out) */}
          {/*
          <div className="dashboard-widget-card">
            <div className="widget-card-header">
              <span className="widget-card-title">Skills Overview</span>
              <button
                className="widget-link-btn"
                onClick={() => setActiveTab('profile')}
              >
                View All
              </button>
            </div>

            <div className="skills-bar-chart-container">
              <div className="skills-y-axis">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>

              <div className="skills-bars-area">
                <div className="skills-grid-lines">
                  <div className="grid-line" />
                  <div className="grid-line" />
                  <div className="grid-line" />
                  <div className="grid-line" />
                  <div className="grid-line" />
                </div>

                <div className="skills-bar-cols">
                  <div className="skill-col">
                    <span className="skill-pct-tag">72%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-green" style={{ height: '72%' }} />
                    </div>
                    <span className="skill-col-label">Math</span>
                  </div>

                  <div className="skill-col">
                    <span className="skill-pct-tag">58%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-blue" style={{ height: '58%' }} />
                    </div>
                    <span className="skill-col-label">DSA</span>
                  </div>

                  <div className="skill-col">
                    <span className="skill-pct-tag">64%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-purple" style={{ height: '64%' }} />
                    </div>
                    <span className="skill-col-label">Logic</span>
                  </div>

                  <div className="skill-col">
                    <span className="skill-pct-tag">40%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-orange" style={{ height: '40%' }} />
                    </div>
                    <span className="skill-col-label">Chem</span>
                  </div>

                  <div className="skill-col">
                    <span className="skill-pct-tag">30%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-teal" style={{ height: '30%' }} />
                    </div>
                    <span className="skill-col-label">Physics</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          */}

          {/* Card 4: Top Achievements (Commented out) */}
          {/*
          <div className="dashboard-widget-card">
            <div className="widget-card-header">
              <span className="widget-card-title">Top Achievements</span>
              <button
                className="widget-link-btn"
                onClick={() => setActiveTab('profile')}
              >
                View All
              </button>
            </div>

            <div className="top-achievement-item">
              <div className="achievement-hex-badge">
                <span className="hex-num">1</span>
              </div>
              <div className="achievement-info-col">
                <h4 className="achievement-title">Getting Started</h4>
                <p className="achievement-desc">Complete your first question</p>
                <div className="achievement-progress-row">
                  <div className="achievement-bar-bg">
                    <div className="achievement-bar-fill" style={{ width: '100%' }} />
                  </div>
                  <span className="achievement-count-label">1/1</span>
                </div>
              </div>
            </div>
          </div>
          */}
        </div>
      </div>
    );
  };

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
        <div className="home-welcome-header" style={{ marginBottom: '20px' }}>
          <h1 className="home-welcome-title">Assigned Assessments</h1>
          <p className="home-welcome-subtitle">Review scheduled test series and start your proctored evaluation modules.</p>
        </div>

        {/* Resumable Session Banner if active */}
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
                fontSize: '18px', fontWeight: 'bold'
              }}>
                <FaBolt style={{ color: '#d97706' }} />
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
            <div className="dashboard-filters-bar" style={{ marginBottom: '16px' }}>
              <div className="search-box-wrapper" style={{ width: '100%' }}>
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
              <div className="ps-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
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
                              style={{
                                padding: '8px 18px',
                                fontSize: '13px',
                                fontWeight: '700',
                                color: '#ffffff',
                                backgroundColor: '#15803d',
                                border: '1px solid #15803d',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 6px rgba(21, 128, 61, 0.25)'
                              }}
                            >
                              Explore Series →
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="no-contests-message" style={{ textAlign: 'center', padding: '40px' }}>
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
                          key={`${a.courseId || ''}_${a.seriesId || ''}_${a.id}`}
                          className="ps-sheet-card"
                          style={{
                            '--theme-border-color': 'var(--accent-primary, #16a34a)',
                            border: a.completed ? '1px solid #10b981' : '1px solid var(--border-color)',
                            boxShadow: a.completed ? '0 4px 20px rgba(16, 185, 129, 0.08)' : 'var(--shadow-sm)',
                            minHeight: '220px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                              <div>
                                <h3 className="ps-card-title" style={{ margin: 0, fontSize: '15px', fontWeight: 700, lineHeight: '1.3' }}>
                                  {a.name}
                                </h3>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                  {a.isGlobal && (
                                    <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      🌐 Global
                                    </span>
                                  )}
                                  {a.isPremium && (
                                    <span style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      ⭐ Premium
                                    </span>
                                  )}
                                  {a.accessTier === 'paid_entry' && (
                                    <span style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      🎟️ Pass ₹{a.entryFeeINR || 99}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {a.completed ? (
                                <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '11px', padding: '3px 9px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  <FaCheck size={10} /> Done
                                </span>
                              ) : (
                                <span className={`difficulty-badge diff-${(a.difficulty || 'Medium').toLowerCase()}`} style={{ whiteSpace: 'nowrap' }}>
                                  {a.difficulty || 'Medium'}
                                </span>
                              )}
                            </div>

                            <p className="ps-card-desc" style={{ fontSize: '12.5px', marginTop: '4px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                              {a.description}
                            </p>

                            <div className="ps-meta-tags" style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              <span className="ps-tag" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px 8px', color: 'var(--text-main)' }}>
                                <FaClock style={{ fontSize: '10px', color: '#38bdf8' }} /> {a.duration || a.timeLimit || 45} mins
                              </span>
                              <span className="ps-tag" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px 8px', color: 'var(--text-main)' }}>
                                <FaAward style={{ fontSize: '10px', color: '#10b981' }} /> {a.totalMarks || 100} Marks
                              </span>
                              <span className="ps-tag" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px 8px', color: 'var(--text-main)' }}>
                                <FaListOl style={{ fontSize: '10px', color: '#a855f7' }} /> {a.questionCount || 15} Questions
                              </span>
                              <span className="ps-tag" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px 8px', color: 'var(--text-main)' }}>
                                <FaShieldAlt style={{ fontSize: '10px', color: '#f59e0b' }} /> {a.proctored ? 'Proctored' : 'Open'}
                              </span>
                              {a.sections && a.sections.length > 0 && (
                                <span className="ps-tag" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px 8px', color: 'var(--text-main)' }}>
                                  <FaLayerGroup style={{ fontSize: '10px', color: '#6366f1' }} /> {a.sections.map(s => (s.type || 'mcq').toUpperCase()).filter((v, i, arr) => arr.indexOf(v) === i).join(' + ')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="ps-card-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div className="ps-schedule-status">
                              <span className={`status-pill ${sched.status.toLowerCase()}`} style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '6px', fontWeight: 600 }}>
                                {sched.status}
                              </span>
                            </div>

                            <div className="ps-card-actions">
                              {a.completed ? (
                                <button className="ps-action-btn" disabled style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '7px 16px', borderRadius: '8px', cursor: 'default', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600 }}>
                                  <FaCheck /> Done
                                </button>
                              ) : isExpired ? (
                                <button className="ps-action-btn" disabled style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '7px 16px', borderRadius: '8px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600 }}>
                                  <FaLock /> Expired
                                </button>
                              ) : isUpcoming ? (
                                <button className="ps-action-btn" disabled style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '7px 16px', borderRadius: '8px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600 }}>
                                  <FaLock /> Locked
                                </button>
                              ) : a.isLocked ? (
                                a.accessTier === 'paid_entry' ? (
                                  <button
                                    onClick={() => handleContestPassCheckout(a)}
                                    className="ps-action-btn"
                                    style={{
                                      padding: '7px 16px',
                                      fontSize: '12.5px',
                                      fontWeight: '700',
                                      color: '#ffffff',
                                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                      border: '1px solid #4338ca',
                                      borderRadius: '8px',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                                    }}
                                  >
                                    🎟️ Get Pass ₹{a.entryFeeINR || 99}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setShowPremiumModal(true)}
                                    className="ps-action-btn"
                                    style={{
                                      padding: '7px 16px',
                                      fontSize: '12.5px',
                                      fontWeight: '700',
                                      color: '#000000',
                                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                      border: '1px solid #b45309',
                                      borderRadius: '8px',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                                    }}
                                  >
                                    <FaLock size={11} /> Unlock Premium
                                  </button>
                                )
                              ) : (
                                <button
                                  onClick={() => handleStartClick(a)}
                                  className="ps-action-btn primary"
                                  style={{
                                    padding: '7px 18px',
                                    fontSize: '12.5px',
                                    fontWeight: '700',
                                    color: '#ffffff',
                                    backgroundColor: '#10b981',
                                    border: '1px solid #059669',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  Start Assessment <FaArrowRight size={11} />
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
    const isPremium = userPremiumState !== null ? userPremiumState : (Boolean(user?.isPremium));

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
        const completed = assessments.filter(a => a.completed);

        if (completed.length > 0 && completed.length >= Math.ceil(assessments.length / 2)) {
          badges.push({
            id: 'assessment_achiever',
            title: 'Assessment Achiever',
            desc: `Completed ${completed.length} of ${assessments.length} assessments.`,
            icon: <FaClipboardList />,
            color: '#34d399'
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

    // Statistics computation (strictly QuestionBank problems)
    const getSolvedCountForDate = (dateStr) => {
      let count = 0;
      if (progressData?.problemDetails) {
        Object.entries(progressData.problemDetails).forEach(([id, detail]) => {
          if (detail.status === 'SOLVED' && detail.lastSolvedAt) {
            if (!isQuestionBankProblem(detail.questionId || id)) return;
            const solvedDate = detail.lastSolvedAt.split('T')[0];
            if (solvedDate === dateStr) {
              count++;
            }
          }
        });
      }
      return count;
    };

    let totalHours = 0;
    let totalProblemsSolved = (progressData?.completedQuestions || progressData?.solvedProblems || []).filter(isQuestionBankProblem).length;
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
      const todayStr = checkDate.toISOString().split('T')[0];
      const todaySolved = getSolvedCountForDate(todayStr);
      const todayActivity = progressData?.activity?.[todayStr];
      const activeToday = todaySolved > 0 || (todayActivity && (todayActivity.hours > 0 || todayActivity.problemsSolved > 0));

      // If today hasn't been completed yet, check consecutive streak starting from yesterday
      if (!activeToday) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      for (let i = 0; i < 365; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const dayInfo = progressData?.activity?.[dateStr];
        const solved = getSolvedCountForDate(dateStr);
        if (solved > 0 || (dayInfo && (dayInfo.hours > 0 || dayInfo.problemsSolved > 0))) {
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
      <div className="profile-tab-content">
        {/* Top Profile Subtabs */}
        <div className="profile-subtabs-nav">
          <button
            className={`profile-subtab-btn ${profileSubTab === 'info' ? 'active' : ''}`}
            onClick={() => setProfileSubTab('info')}
          >
            <FaUser className="profile-tab-icon" /> Profile Information
          </button>
          <button
            className={`profile-subtab-btn ${profileSubTab === 'github' ? 'active' : ''}`}
            onClick={() => setProfileSubTab('github')}
          >
            <FaGithub className="profile-tab-icon" /> GitHub Integration &amp; PAT
          </button>
          <button
            className={`profile-subtab-btn ${profileSubTab === 'utilisation' ? 'active' : ''}`}
            onClick={() => setProfileSubTab('utilisation')}
          >
            <FaGraduationCap className="profile-tab-icon" /> Academic Details
          </button>
          <button
            className={`profile-subtab-btn ${profileSubTab === 'widget' ? 'active' : ''}`}
            onClick={() => setProfileSubTab('widget')}
          >
            <FaMobileAlt className="profile-tab-icon" /> Android Widget
          </button>
          <button
            className={`profile-subtab-btn ${profileSubTab === 'password' ? 'active' : ''}`}
            onClick={() => setProfileSubTab('password')}
          >
            <FaShieldAlt className="profile-tab-icon" /> Change Password
          </button>
        </div>

        {profileSubTab === 'info' ? (
          /* ─── REDESIGNED: Profile Information ─── */
          <div className="profile-info-cards-stack">
            {/* Hidden file input for photo upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />

            {/* Card 0: Profile Identity Hero */}
            <div className="profile-hero-card">
              <div className="profile-hero-left">
                <div className="profile-hero-avatar-wrapper">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile Avatar"
                      className="profile-hero-avatar-img"
                    />
                  ) : (
                    <div className="profile-hero-avatar-initials">
                      {(user?.name || name || 'S').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    className="profile-avatar-camera-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload profile photo"
                  >
                    <FaCamera size={12} />
                  </button>
                </div>

                <div className="profile-hero-info">
                  <div className="profile-hero-name-row">
                    <h2 className="profile-hero-name">{user?.name || name || 'Student'}</h2>
                    <span className="profile-handle-badge">@{studentUsername || user?.username || 'student'}</span>
                  </div>
                  <div className="profile-hero-badges-row">
                    <span className="profile-badge-pill pill-role">STUDENT</span>
                    <span className="profile-badge-pill pill-tenant">
                      <FaGraduationCap size={12} style={{ marginRight: '4px' }} />
                      {user?.tenant?.name || user?.college || college || 'SEED Institution'}
                    </span>
                    <span className="profile-badge-pill pill-active">
                      <span className="live-status-dot" /> Active
                    </span>
                  </div>
                  {studentUsername && (
                    <div className="profile-hero-actions-row">
                      <a
                        href={`/user/${studentUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="profile-quick-action-link"
                      >
                        <FaExternalLinkAlt size={10} /> View Public Profile
                      </a>
                      <button
                        type="button"
                        className="profile-quick-action-link"
                        onClick={() => {
                          const url = `${window.location.origin}/user/${studentUsername}`;
                          navigator.clipboard.writeText(url);
                          toast.success('Public profile link copied to clipboard!');
                        }}
                      >
                        <FaCopy size={10} /> Copy Share Link
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="profile-hero-right">
                <button
                  type="button"
                  className={`profile-action-btn ${isEditingProfile ? 'btn-save' : 'btn-edit'}`}
                  onClick={() => {
                    if (isEditingProfile) {
                      handleSaveProfile();
                    } else {
                      setIsEditingProfile(true);
                    }
                  }}
                >
                  {isEditingProfile ? <><FaCheck size={12} /> Save Changes</> : <><FaCog size={12} /> Edit Details</>}
                </button>
                {isEditingProfile && (
                  <button
                    type="button"
                    className="profile-cancel-btn"
                    onClick={() => setIsEditingProfile(false)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Wide 2-Column Responsive Layout to utilize right-side space */}
            <div className="profile-info-cards-grid">
              {/* Left Column: Personal Information & Coding Profiles */}
              <div className="profile-info-col-left">
                {/* Card: Personal Information */}
                <div className="profile-info-card">
                  <div className="profile-card-header-bar">
                    <div>
                      <h3 className="profile-card-section-title">Personal Information</h3>
                      <p className="profile-card-section-subtitle">Manage your personal identification, contact coordinates, and student bio.</p>
                    </div>
                  </div>

                  {isEditingProfile ? (
                    <div className="profile-form-grid">
                      <div className="form-field-group">
                        <label className="form-field-label">Full Name</label>
                        <input
                          type="text"
                          className="form-text-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Enter full name"
                        />
                      </div>
                      <div className="form-field-group">
                        <label className="form-field-label">Roll Number</label>
                        <input
                          type="text"
                          className="form-text-input disabled"
                          value={user?.rollNumber || rollNumber || editRollNo || ''}
                          disabled
                          title="Roll Number is verified and linked to your institutional registration and cannot be edited"
                        />
                      </div>
                      <div className="form-field-group">
                        <label className="form-field-label">Phone Number</label>
                        <input
                          type="text"
                          className="form-text-input"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="Enter phone number"
                        />
                      </div>
                      <div className="form-field-group">
                        <label className="form-field-label">Registered Email</label>
                        <input
                          type="email"
                          className="form-text-input disabled"
                          value={user?.email || email || ''}
                          disabled
                          title="Email is linked to institutional authentication and cannot be edited"
                        />
                      </div>
                      <div className="form-field-group full-width">
                        <label className="form-field-label">Student Bio</label>
                        <textarea
                          rows={3}
                          className="form-text-input textarea"
                          value={editBio}
                          onChange={(e) => setEditBio(e.target.value)}
                          placeholder="Brief personal bio, interests, or career aspirations"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="profile-details-grid">
                      <div className="profile-grid-cell">
                        <span className="field-label">Full Name</span>
                        <span className="field-value">{user?.name || name || '—'}</span>
                      </div>
                      <div className="profile-grid-cell">
                        <span className="field-label">Roll Number</span>
                        <span className="field-value">{user?.rollNumber || rollNumber || '—'}</span>
                      </div>
                      <div className="profile-grid-cell">
                        <span className="field-label">Registered Email</span>
                        <span className="field-value">{user?.email || email || '—'}</span>
                      </div>
                      <div className="profile-grid-cell">
                        <span className="field-label">Phone Number</span>
                        <span className="field-value">{user?.phone || user?.phoneNumber || user?.mobile || editPhone || '—'}</span>
                      </div>
                      <div className="profile-grid-cell full-width">
                        <span className="field-label">Student Bio</span>
                        <span className="field-value bio-text">{user?.bio || editBio || 'No student biography provided yet. Click "Edit Details" to add one.'}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card: Coding & Professional Profiles */}
                <div className="profile-info-card">
                  <div className="profile-card-header-bar">
                    <div>
                      <h3 className="profile-card-section-title">Coding &amp; Professional Profiles</h3>
                      <p className="profile-card-section-subtitle">Link your competitive programming handles and portfolio to enhance your public profile.</p>
                    </div>
                  </div>

                  {isEditingProfile ? (
                    <div className="profile-form-grid">
                      <div className="form-field-group">
                        <label className="form-field-label">
                          <FaGithub style={{ marginRight: '6px' }} /> GitHub Handle or URL
                        </label>
                        <input
                          type="text"
                          className="form-text-input"
                          placeholder="github.com/username or username"
                          value={editGithub}
                          onChange={(e) => setEditGithub(e.target.value)}
                        />
                      </div>
                      <div className="form-field-group">
                        <label className="form-field-label">
                          <FaLinkedin style={{ color: '#0a66c2', marginRight: '6px' }} /> LinkedIn Handle or URL
                        </label>
                        <input
                          type="text"
                          className="form-text-input"
                          placeholder="linkedin.com/in/username or username"
                          value={editLinkedin}
                          onChange={(e) => setEditLinkedin(e.target.value)}
                        />
                      </div>
                      <div className="form-field-group">
                        <label className="form-field-label">
                          <FaGlobe style={{ color: '#10b981', marginRight: '6px' }} /> Personal Portfolio URL
                        </label>
                        <input
                          type="text"
                          className="form-text-input"
                          placeholder="https://yourportfolio.dev"
                          value={editPortfolio}
                          onChange={(e) => setEditPortfolio(e.target.value)}
                        />
                      </div>
                      <div className="form-field-group">
                        <label className="form-field-label">
                          <FaCode style={{ color: '#f59e0b', marginRight: '6px' }} /> LeetCode Handle or URL
                        </label>
                        <input
                          type="text"
                          className="form-text-input"
                          placeholder="leetcode.com/u/username or handle"
                          value={editLeetcode}
                          onChange={(e) => setEditLeetcode(e.target.value)}
                        />
                      </div>
                      <div className="form-field-group">
                        <label className="form-field-label">
                          <FaCode style={{ color: '#7c3aed', marginRight: '6px' }} /> CodeChef Handle or URL
                        </label>
                        <input
                          type="text"
                          className="form-text-input"
                          placeholder="codechef.com/users/username or handle"
                          value={editCodechef}
                          onChange={(e) => setEditCodechef(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="profile-coding-chips-grid">
                      <div className="coding-chip-card">
                        <div className="coding-chip-header">
                          <FaGithub className="coding-icon github" />
                          <span className="coding-chip-title">GitHub</span>
                        </div>
                        {user?.github ? (
                          <a
                            href={user.github.startsWith('http') ? user.github : `https://${user.github.startsWith('github.com') ? user.github : 'github.com/' + user.github}`}
                            target="_blank"
                            rel="noreferrer"
                            className="coding-chip-link"
                          >
                            <span>{user.github.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '')}</span>
                            <FaExternalLinkAlt size={10} />
                          </a>
                        ) : (
                          <span className="coding-chip-empty">Not linked</span>
                        )}

                        {githubConfig.isConnected ? (
                          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                              Synced: {githubConfig.repo}
                            </span>
                            <button
                              type="button"
                              onClick={() => setProfileSubTab('github')}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-primary, #10b981)', cursor: 'pointer', padding: 0, fontWeight: 700, fontSize: '11px' }}
                            >
                              Manage &rarr;
                            </button>
                          </div>
                        ) : (
                          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Heatmap sync off</span>
                            <button
                              type="button"
                              onClick={() => setProfileSubTab('github')}
                              style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: 0, fontWeight: 700, fontSize: '11px' }}
                            >
                              + Connect PAT
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="coding-chip-card">
                        <div className="coding-chip-header">
                          <FaLinkedin className="coding-icon linkedin" />
                          <span className="coding-chip-title">LinkedIn</span>
                        </div>
                        {user?.linkedin ? (
                          <a
                            href={user.linkedin.startsWith('http') ? user.linkedin : `https://${user.linkedin.startsWith('linkedin.com') ? user.linkedin : 'linkedin.com/in/' + user.linkedin}`}
                            target="_blank"
                            rel="noreferrer"
                            className="coding-chip-link"
                          >
                            <span>{user.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '')}</span>
                            <FaExternalLinkAlt size={10} />
                          </a>
                        ) : (
                          <span className="coding-chip-empty">Not linked</span>
                        )}
                      </div>

                      <div className="coding-chip-card">
                        <div className="coding-chip-header">
                          <FaGlobe className="coding-icon portfolio" />
                          <span className="coding-chip-title">Portfolio</span>
                        </div>
                        {user?.portfolio ? (
                          <a
                            href={user.portfolio.startsWith('http') ? user.portfolio : `https://${user.portfolio}`}
                            target="_blank"
                            rel="noreferrer"
                            className="coding-chip-link"
                          >
                            <span>{user.portfolio.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                            <FaExternalLinkAlt size={10} />
                          </a>
                        ) : (
                          <span className="coding-chip-empty">Not linked</span>
                        )}
                      </div>

                      <div className="coding-chip-card">
                        <div className="coding-chip-header">
                          <FaCode className="coding-icon leetcode" />
                          <span className="coding-chip-title">LeetCode</span>
                        </div>
                        {user?.leetcode ? (
                          <a
                            href={user.leetcode.startsWith('http') ? user.leetcode : `https://leetcode.com/u/${user.leetcode}`}
                            target="_blank"
                            rel="noreferrer"
                            className="coding-chip-link"
                          >
                            <span>{user.leetcode.replace(/^https?:\/\/(www\.)?leetcode\.com\/u\//, '').replace(/\/$/, '')}</span>
                            <FaExternalLinkAlt size={10} />
                          </a>
                        ) : (
                          <span className="coding-chip-empty">Not linked</span>
                        )}
                      </div>

                      <div className="coding-chip-card">
                        <div className="coding-chip-header">
                          <FaCode className="coding-icon codechef" />
                          <span className="coding-chip-title">CodeChef</span>
                        </div>
                        {user?.codechef ? (
                          <a
                            href={user.codechef.startsWith('http') ? user.codechef : `https://www.codechef.com/users/${user.codechef}`}
                            target="_blank"
                            rel="noreferrer"
                            className="coding-chip-link"
                          >
                            <span>{user.codechef.replace(/^https?:\/\/(www\.)?codechef\.com\/users\//, '').replace(/\/$/, '')}</span>
                            <FaExternalLinkAlt size={10} />
                          </a>
                        ) : (
                          <span className="coding-chip-empty">Not linked</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Gamification Level, Academic Details & System Info */}
              <div className="profile-info-col-right">
                {/* Card 1: Gamification Level & Progression */}
                <div className="profile-level-card">
                  <div className="profile-level-header">
                    <div className="profile-level-badge-col">
                      <div className="profile-level-number-badge">
                        <span className="profile-level-label">TIER</span>
                        <span className="profile-level-value">{userLevelInfo.level}</span>
                      </div>
                      <div className="profile-level-title-group">
                        <div className="level-title-row">
                          <h3 className="profile-level-title">{userLevelInfo.levelTitle}</h3>
                          <span className="level-status-pill">Active Tier</span>
                        </div>
                        <span className="profile-level-subtitle">Experience &amp; Algorithmic Mastery Ranking</span>
                      </div>
                    </div>

                    <div className="profile-level-stats-row">
                      <div className="profile-level-stat-item">
                        <span className="profile-stat-num">
                          {userLevelInfo.totalXP.toLocaleString()} <span className="profile-stat-unit">XP</span>
                        </span>
                        <span className="profile-stat-lbl">Total XP Gained</span>
                      </div>
                      <div className="profile-level-stat-item">
                        <span className="profile-stat-num stat-credits">
                          <SeedCreditCoin size={15} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: '5px' }} />
                          {seedCredits.toLocaleString()} <span className="profile-stat-unit">SC</span>
                        </span>
                        <span className="profile-stat-lbl">SEED Credits</span>
                      </div>
                      <div className="profile-level-stat-item">
                        <span className="profile-stat-num stat-streak">
                          {userStreak} <span className="profile-stat-unit">Day{userStreak === 1 ? '' : 's'}</span>
                        </span>
                        <span className="profile-stat-lbl">Active Streak</span>
                      </div>
                    </div>
                  </div>

                  <div className="profile-level-progress-wrapper">
                    <div className="profile-level-progress-header">
                      <span className="level-prog-text">
                        Rank Progression: <strong>Level {userLevelInfo.level} &rarr; Level {userLevelInfo.level + 1}</strong>
                      </span>
                      <span className="level-prog-percent">
                        {userLevelInfo.progressInLevelXP.toLocaleString()} / {(userLevelInfo.nextLevelXP - userLevelInfo.currentLevelMinXP).toLocaleString()} XP ({userLevelInfo.progressPercent}%)
                      </span>
                    </div>
                    <div className="profile-level-progress-bar-track">
                      <div
                        className="profile-level-progress-bar-fill"
                        style={{ width: `${userLevelInfo.progressPercent}%` }}
                      />
                    </div>
                    <span className="level-prog-hint">
                      Earn {userLevelInfo.neededForNextLevel.toLocaleString()} more XP to reach Level {userLevelInfo.level + 1}. Practice Question Bank problems and complete courses to level up.
                    </span>
                  </div>
                </div>

                {/* Card 4: Academic & Institutional Information */}
                <div className="profile-info-card">
                  <div className="profile-card-header-bar">
                    <div>
                      <h3 className="profile-card-section-title">Academic &amp; Institutional Information</h3>
                      <p className="profile-card-section-subtitle">Verified registration records from your college or partner university.</p>
                    </div>
                  </div>
                  <div className="profile-details-grid">
                    <div className="profile-grid-cell">
                      <span className="field-label">College / University</span>
                      <span className="field-value">{user?.tenant?.name || user?.college || user?.College || user?.collegeName || user?.tenantName || user?.tenantId || college || "—"}</span>
                    </div>
                    <div className="profile-grid-cell">
                      <span className="field-label">Institution Code / Tenant</span>
                      <span className="field-value code-pill">{user?.tenantId || user?.tenant?.id || "—"}</span>
                    </div>
                    <div className="profile-grid-cell">
                      <span className="field-label">Institutional Access</span>
                      <span className="field-value" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span className="live-status-dot" />
                        <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span>
                        {user?.tenant?.validUntil ? (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(Valid until {user.tenant.validUntil})</span>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(Lifetime Access)</span>
                        )}
                      </span>
                    </div>
                    <div className="profile-grid-cell">
                      <span className="field-label">Department</span>
                      <span className="field-value">{user?.department || user?.Department || user?.dept || user?.Dept || user?.branch || user?.Branch || dept || "—"}</span>
                    </div>
                    <div className="profile-grid-cell">
                      <span className="field-label">Graduation Year / Cohort</span>
                      <span className="field-value">{user?.year || user?.Year || user?.cohortId || user?.CohortId || year || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Card 5: Account & System Information */}
                <div className="profile-info-card">
                  <div className="profile-card-header-bar">
                    <div>
                      <h3 className="profile-card-section-title">Account &amp; System Information</h3>
                      <p className="profile-card-section-subtitle">Authentication identifiers and connected client tools.</p>
                    </div>
                  </div>
                  <div className="profile-details-grid">
                    <div className="profile-grid-cell">
                      <span className="field-label">Account Status</span>
                      <span className="field-value">
                        <span className="status-badge-active">Active</span>
                      </span>
                    </div>
                    <div className="profile-grid-cell">
                      <span className="field-label">Account Role</span>
                      <span className="field-value" style={{ textTransform: 'capitalize' }}>{user?.role || 'Student'}</span>
                    </div>
                    <div className="profile-grid-cell full-width">
                      <span className="field-label">Authentication UID</span>
                      <span className="field-value code-pill uid-pill">
                        {user?.uid || auth?.currentUser?.uid || '—'}
                        <button
                          type="button"
                          className="btn-copy-mini"
                          onClick={() => {
                            const uid = user?.uid || auth?.currentUser?.uid || '';
                            if (uid) {
                              navigator.clipboard.writeText(uid);
                              toast.success('UID copied to clipboard!');
                            }
                          }}
                          title="Copy Authentication UID"
                        >
                          <FaCopy size={11} />
                        </button>
                      </span>
                    </div>
                    <div className="profile-grid-cell full-width">
                      <span className="field-label">Android Home Widget</span>
                      <span className="field-value">
                        <button
                          onClick={() => setProfileSubTab('widget')}
                          className="btn-widget-shortcut"
                        >
                          <FaMobileAlt size={12} /> Setup Mobile Widget &rarr;
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : profileSubTab === 'github' ? (
          /* ─── REDESIGNED: GitHub Sync & Personal Access Token (PAT) ─── */
          <div className="profile-github-container">
            {/* Top Status & Intro Hero Banner */}
            <div className="github-profile-hero-card">
              <div className="github-hero-left">
                <div className="github-hero-icon-box">
                  <FaGithub size={36} />
                </div>
                <div>
                  <div className="github-hero-title-row">
                    <h3 className="github-hero-title">GitHub Portfolio &amp; One-Way Sync</h3>
                    {githubConfig.isConnected ? (
                      <span className="github-connection-pill connected">
                        <span className="live-status-dot" /> Connected ({githubConfig.authMethod === 'oauth' ? 'OAuth' : 'PAT'})
                      </span>
                    ) : (
                      <span className="github-connection-pill disconnected">
                        Not Connected
                      </span>
                    )}
                  </div>
                  <p className="github-hero-subtitle">
                    Automatically push every verified, accepted coding solution to your personal GitHub repository to illuminate your <strong>GitHub Contribution Heatmap</strong> and maintain a recruiter-ready algorithmic portfolio.
                  </p>
                </div>
              </div>

              {githubConfig.isConnected && (
                <div className="github-hero-right">
                  <a
                    href={`https://github.com/${githubConfig.username}/${githubConfig.repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="github-repo-link-badge"
                  >
                    <FaExternalLinkAlt size={11} /> github.com/{githubConfig.username}/{githubConfig.repo}
                  </a>
                  <button
                    type="button"
                    onClick={handleProfileDisconnectGitHub}
                    className="github-btn-disconnect"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>

            {/* 2-Column Responsive Layout: Left Configuration, Right Security & Directory Preview */}
            <div className="github-config-grid">
              {/* Left Column: Connection Methods & Settings */}
              <div className="github-config-col-left">

                {/* Method A: One-Click GitHub Connect (OAuth) */}
                <div className="github-settings-card">
                  <div className="github-card-header">
                    <div>
                      <h4 className="github-card-title">1-Click GitHub Connect (No PAT Needed)</h4>
                      <p className="github-card-desc">Sign in with your GitHub account securely via OAuth popup with repository access.</p>
                    </div>
                  </div>

                  <div className="github-oauth-action-box">
                    <button
                      type="button"
                      disabled={isConnectingOAuth}
                      onClick={handleProfileConnectOAuth}
                      className="github-oauth-btn"
                    >
                      <FaGithub size={18} />
                      <span>{isConnectingOAuth ? 'Authorizing with GitHub...' : githubConfig.isConnected && githubConfig.authMethod === 'oauth' ? 'Re-authorize GitHub (OAuth)' : 'Connect with GitHub (1-Click)'}</span>
                    </button>
                    <span className="github-helper-text">
                      No manual token copying needed. Securely requests <code>repo</code> write scope to push code to your profile.
                    </span>
                  </div>
                </div>

                {/* Method B: Personal Access Token (PAT) Manual Option */}
                <div className="github-settings-card">
                  <div className="github-card-header">
                    <div>
                      <h4 className="github-card-title">Personal Access Token (PAT)</h4>
                      <p className="github-card-desc">Prefer fine-grained access? Enter or update your GitHub Personal Access Token directly.</p>
                    </div>
                  </div>

                  <div className="github-pat-form">
                    <div className="form-field-group">
                      <label className="form-field-label">
                        <FaKey size={11} style={{ marginRight: '6px' }} /> GitHub Personal Access Token
                      </label>
                      <div className="password-input-wrapper">
                        <input
                          type={showPatSecret ? 'text' : 'password'}
                          placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          value={githubPatInput}
                          onChange={(e) => setGithubPatInput(e.target.value)}
                          className="form-text-input"
                        />
                        <button
                          type="button"
                          className="btn-toggle-eye"
                          onClick={() => setShowPatSecret(!showPatSecret)}
                          title={showPatSecret ? 'Hide PAT' : 'Show PAT'}
                        >
                          {showPatSecret ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                        </button>
                      </div>
                      <div className="pat-help-links">
                        <a
                          href="https://github.com/settings/tokens/new?scopes=repo&description=SEED-IT%20Portfolio%20Sync"
                          target="_blank"
                          rel="noreferrer"
                          className="pat-link"
                        >
                          <FaExternalLinkAlt size={10} /> Generate GitHub Classic PAT (with repo scope)
                        </a>
                        <span className="pat-sep">·</span>
                        <a
                          href="https://github.com/settings/personal-access-tokens/new"
                          target="_blank"
                          rel="noreferrer"
                          className="pat-link"
                        >
                          Fine-grained PAT
                        </a>
                      </div>
                    </div>

                    <div className="github-pat-action-row">
                      <button
                        type="button"
                        disabled={isVerifyingPat || !githubPatInput}
                        onClick={handleProfileSavePat}
                        className="github-save-pat-btn"
                      >
                        {isVerifyingPat ? <><FaSyncAlt className="spin" size={12} /> Verifying Token...</> : <><FaCheck size={12} /> Verify &amp; Save PAT</>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Target Repository & Automation Settings */}
                <div className="github-settings-card">
                  <div className="github-card-header">
                    <div>
                      <h4 className="github-card-title">Repository &amp; Automation Settings</h4>
                      <p className="github-card-desc">Configure where your solutions are stored and how sync triggers.</p>
                    </div>
                  </div>

                  <div className="github-repo-settings-form">
                    <div className="form-field-group">
                      <label className="form-field-label">Target Repository Name</label>
                      <input
                        type="text"
                        value={githubRepoName}
                        onChange={(e) => setGithubRepoName(e.target.value)}
                        placeholder="seed-it-solutions"
                        className="form-text-input"
                      />
                      <span className="github-helper-text">
                        If the repository does not exist on your GitHub profile, SEED-IT will automatically create it for you on first push!
                      </span>
                    </div>

                    <div className="github-toggles-stack">
                      <label className="github-toggle-row">
                        <input
                          type="checkbox"
                          checked={githubAutoSync}
                          onChange={(e) => setGithubAutoSync(e.target.checked)}
                          className="github-checkbox"
                        />
                        <div>
                          <div className="toggle-label">Auto-Push on 100% Test Pass</div>
                          <div className="toggle-sub">Automatically pushes solution code and README whenever you pass all test cases in Question Bank or Course Coding Practice.</div>
                        </div>
                      </label>

                      <label className="github-toggle-row">
                        <input
                          type="checkbox"
                          checked={githubIsPrivate}
                          onChange={(e) => setGithubIsPrivate(e.target.checked)}
                          className="github-checkbox"
                        />
                        <div>
                          <div className="toggle-label">Create Repository as Private</div>
                          <div className="toggle-sub">Default is public so recruiters can view your solutions. Check this if you prefer a private repository.</div>
                        </div>
                      </label>
                    </div>

                    <div className="github-pat-action-row" style={{ marginTop: '16px' }}>
                      <button
                        type="button"
                        onClick={handleProfileSaveRepoSettings}
                        className="github-save-pat-btn"
                      >
                        <FaCheck size={12} /> Save Repository Settings
                      </button>
                    </div>
                  </div>
                </div>

                {/* Batch Sync Action */}
                <div className="github-settings-card">
                  <div className="github-card-header">
                    <div>
                      <h4 className="github-card-title">Batch Sync All Solved Problems</h4>
                      <p className="github-card-desc">Backfill your GitHub repository with all previously solved accepted problems.</p>
                    </div>
                  </div>

                  <div className="github-batch-sync-box">
                    <p className="batch-sync-desc">
                      Have previously solved problems that are not yet on your GitHub? Click below to batch-commit your solutions, generate READMEs, and refresh your portfolio index in one click.
                    </p>

                    {batchSyncProgress && (
                      <div className="batch-progress-wrap">
                        <div className="batch-progress-text">
                          <span>Syncing: {batchSyncProgress.questionTitle}</span>
                          <span>{batchSyncProgress.current} / {batchSyncProgress.total}</span>
                        </div>
                        <div className="batch-progress-bar">
                          <div
                            className="batch-progress-fill"
                            style={{
                              width: `${batchSyncProgress.total > 0 ? (batchSyncProgress.current / batchSyncProgress.total) * 100 : 0}%`
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={isBatchSyncing || !githubConfig.isConnected}
                      onClick={handleProfileBatchSync}
                      className="github-batch-btn"
                    >
                      {isBatchSyncing ? <><FaSyncAlt className="spin" size={13} /> Batch Syncing Solutions...</> : <><FaSyncAlt size={13} /> Batch Sync All Solved Problems</>}
                    </button>
                  </div>
                </div>

              </div>

              {/* Right Column: Security Isolation & Directory Structure */}
              <div className="github-config-col-right">

                {/* Security Guarantee Card */}
                <div className="github-security-card">
                  <div className="security-card-header">
                    <FaShieldAlt className="security-icon" />
                    <div>
                      <h4 className="security-title">Private Cloud Server Security Guarantee</h4>
                      <span className="security-badge">Isolated Storage</span>
                    </div>
                  </div>
                  <p className="security-body">
                    Your GitHub Personal Access Token (PAT) and OAuth access tokens are stored strictly within your private document at:
                  </p>
                  <div className="security-path-box">
                    <code>users/{user?.uid || 'your-uid'}/settings/githubSync</code>
                  </div>
                  <ul className="security-bullets">
                    <li><FaCheck size={11} className="bullet-check" /> <strong>Never Public:</strong> Public profile visitors, peer students, and leaderboards cannot see or access your token.</li>
                    <li><FaCheck size={11} className="bullet-check" /> <strong>Cloud Server Rules Protected:</strong> Only your authenticated Cloud Server UID (<code>isUser(userId)</code>) has read and write permissions.</li>
                    <li><FaCheck size={11} className="bullet-check" /> <strong>One-Way Sync:</strong> Code flows strictly from SEED-IT to your personal GitHub repository. We never read or modify your other repositories.</li>
                  </ul>
                </div>

                {/* Recruiter-Ready Repository Hierarchy */}
                <div className="github-tree-card">
                  <h4 className="tree-card-title">Recruiter-Ready Directory Hierarchy</h4>
                  <p className="tree-card-subtitle">Every solution is structured to maximize interview readiness and clean organization:</p>

                  <div className="github-tree-view">
                    <div className="tree-line root"><FaBoxOpen className="tree-icon" /> {githubConfig.repo || 'seed-it-solutions'}/</div>
                    <div className="tree-line file indent-1"><FaCode className="tree-icon file" /> README.md <span className="tree-tag">Dynamic stats &amp; badges</span></div>
                    <div className="tree-line file indent-1"><FaCog className="tree-icon file" /> .seed-tracker.json <span className="tree-tag">Sync manifest</span></div>
                    <div className="tree-line folder indent-1"><FaBoxOpen className="tree-icon" /> Problems/</div>
                    <div className="tree-line folder indent-2"><FaBoxOpen className="tree-icon" /> Arrays/</div>
                    <div className="tree-line folder indent-3"><FaBoxOpen className="tree-icon" /> 001-Two-Sum/</div>
                    <div className="tree-line file indent-4"><FaCode className="tree-icon file" /> README.md <span className="tree-tag">Statement &amp; examples</span></div>
                    <div className="tree-line file indent-4"><FaCode className="tree-icon file" /> solution.py <span className="tree-tag">Formatted code</span></div>
                    <div className="tree-line folder indent-2"><FaBoxOpen className="tree-icon" /> Dynamic-Programming/</div>
                    <div className="tree-line folder indent-3"><FaBoxOpen className="tree-icon" /> 070-Climbing-Stairs/</div>
                    <div className="tree-line file indent-4"><FaCode className="tree-icon file" /> README.md</div>
                    <div className="tree-line file indent-4"><FaCode className="tree-icon file" /> Solution.java</div>
                  </div>
                </div>

                {/* Heatmap Impact Info */}
                <div className="github-heatmap-info-card">
                  <div className="heatmap-info-header">
                    <FaFire className="fire-icon" />
                    <h4 className="heatmap-info-title">GitHub Contribution Heatmap</h4>
                  </div>
                  <p className="heatmap-info-body">
                    Every problem you solve creates a verified commit authored with your GitHub email and timestamp. This lights up your green contribution squares on your GitHub profile, visibly demonstrating your continuous day-to-day algorithmic practice to technical interviewers and hiring managers!
                  </p>
                </div>

              </div>
            </div>
          </div>
        ) : profileSubTab === 'utilisation' ? (
          /* ─── REDESIGNED: Academic Details & Platform Utilisation ─── */
          <div className="profile-utilisation-container">
            <div className="profile-subtab-header">
              <h2 className="profile-subtab-title">Academic Details &amp; Utilisation</h2>
              <p className="profile-subtab-subtitle">Review your verified institutional registration and explore your platform practice metrics.</p>
            </div>

            <div className="profile-view-layout">
              {/* Left Student Registration Details Card */}
              <div className="profile-card-left">
                <div className="profile-avatar-wrapper">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile Avatar"
                      className="profile-card-avatar-img"
                    />
                  ) : (
                    <div className="profile-avatar-large">
                      {(user?.name || name || 'S').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <h3 className="profile-name-title">{user?.name || name || 'Student'}</h3>
                <div className="profile-username-tag">
                  @{studentUsername || user?.username || 'student'}
                </div>
                <div className="profile-badge-strip">
                  <span className="profile-student-badge">STUDENT</span>
                  <span className="profile-student-badge level-badge">
                    <FaBolt size={10} style={{ marginRight: '4px' }} /> LEVEL {userLevelInfo.level}
                  </span>
                </div>

                <div className="profile-details-table">
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Roll Number</span>
                    <span className="profile-detail-val">{user?.rollNumber || rollNumber || "—"}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">College</span>
                    <span className="profile-detail-val">{user?.tenant?.name || user?.college || college || "—"}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Department</span>
                    <span className="profile-detail-val">{user?.department || dept || "—"}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Graduation Year</span>
                    <span className="profile-detail-val">{user?.year || year || "—"}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Registered Email</span>
                    <span className="profile-detail-val">{user?.email || email || "—"}</span>
                  </div>
                </div>

                {(user?.github || user?.linkedin || user?.portfolio || user?.leetcode || user?.codechef) && (
                  <div className="profile-social-icons-strip">
                    {user?.github && (
                      <a href={user.github.startsWith('http') ? user.github : `https://${user.github.startsWith('github.com') ? user.github : 'github.com/' + user.github}`} target="_blank" rel="noreferrer" title="GitHub" className="social-icon-btn github">
                        <FaGithub />
                      </a>
                    )}
                    {user?.linkedin && (
                      <a href={user.linkedin.startsWith('http') ? user.linkedin : `https://${user.linkedin}`} target="_blank" rel="noreferrer" title="LinkedIn" className="social-icon-btn linkedin">
                        <FaLinkedin />
                      </a>
                    )}
                    {user?.portfolio && (
                      <a href={user.portfolio.startsWith('http') ? user.portfolio : `https://${user.portfolio}`} target="_blank" rel="noreferrer" title="Portfolio" className="social-icon-btn portfolio">
                        <FaGlobe />
                      </a>
                    )}
                    {user?.leetcode && (
                      <a href={user.leetcode.startsWith('http') ? user.leetcode : `https://leetcode.com/u/${user.leetcode}`} target="_blank" rel="noreferrer" title="LeetCode" className="social-icon-btn leetcode">
                        <FaCode />
                      </a>
                    )}
                    {user?.codechef && (
                      <a href={user.codechef.startsWith('http') ? user.codechef : `https://www.codechef.com/users/${user.codechef}`} target="_blank" rel="noreferrer" title="CodeChef" className="social-icon-btn codechef">
                        <FaCode />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: 4 Top Stats + Heatmap */}
              <div className="profile-right-column">
                <div className="profile-three-stats-row profile-four-stats-row">
                  <div className="util-stat-card card-purple">
                    <div className="util-stat-header">
                      <FaBolt className="util-stat-icon icon-purple" />
                      <span className="util-stat-label">Mastery Level</span>
                    </div>
                    <span className="util-stat-val val-purple">
                      Level {userLevelInfo.level}
                    </span>
                    <span className="util-stat-sub">{userLevelInfo.totalXP.toLocaleString()} XP · {userLevelInfo.levelTitle}</span>
                  </div>

                  <div className="util-stat-card card-green">
                    <div className="util-stat-header">
                      <FaCode className="util-stat-icon icon-green" />
                      <span className="util-stat-label">Problems Solved</span>
                    </div>
                    <span className="util-stat-val val-green">
                      {totalProblemsSolved}
                      <span className="val-sub-fraction">/ 9,000+</span>
                    </span>
                    <span className="util-stat-sub">Practice Questions Cleared</span>
                  </div>

                  <div className="util-stat-card card-blue">
                    <div className="util-stat-header">
                      <FaClock className="util-stat-icon icon-blue" />
                      <span className="util-stat-label">Learning Time</span>
                    </div>
                    <span className="util-stat-val val-blue">{formatUsageTime(totalHours)}</span>
                    <span className="util-stat-sub">Time Spent Active</span>
                  </div>

                  <div className="util-stat-card card-orange">
                    <div className="util-stat-header">
                      <FaFire className="util-stat-icon icon-orange" />
                      <span className="util-stat-label">Active Streak</span>
                    </div>
                    <span className="util-stat-val val-orange">{activeStreak} Day{activeStreak === 1 ? '' : 's'}</span>
                    <span className="util-stat-sub">Continuous Practice</span>
                  </div>
                </div>

                {/* Heatmap Card */}
                <div className="heatmap-card">
                  <div className="analytics-card-header">
                    <div>
                      <h4 className="widget-section-title">
                        Practice Portal Activity Tracker (Last 6 Months)
                      </h4>
                      <span className="heatmap-section-subtitle">
                        Solved {totalProblemsSolved} of 9,328 questions in Question Bank
                      </span>
                    </div>
                    <button
                      className="btn-sync-cloud"
                      onClick={handleSyncProfileProgress}
                      disabled={loadingProfileProgress}
                    >
                      <FaSyncAlt className={loadingProfileProgress ? 'spin' : ''} /> {loadingProfileProgress ? 'Syncing...' : 'Sync with Cloud'}
                    </button>
                  </div>

                  <div className="heatmap-grid-container">
                    {/* Y-axis days */}
                    <div className="heatmap-day-labels">
                      <span>Sun</span>
                      <span style={{ visibility: 'hidden' }}>Mon</span>
                      <span>Tue</span>
                      <span style={{ visibility: 'hidden' }}>Wed</span>
                      <span>Thu</span>
                      <span style={{ visibility: 'hidden' }}>Fri</span>
                      <span>Sat</span>
                    </div>

                    {/* X-axis weeks */}
                    <div className="heatmap-scroll-area">
                      {/* Months Row */}
                      <div className="heatmap-month-labels">
                        {monthHeaders.map(hdr => (
                          <span key={hdr.index} style={{
                            position: 'absolute',
                            left: `${hdr.index * 15}px`,
                            whiteSpace: 'nowrap'
                          }}>{hdr.label}</span>
                        ))}
                      </div>

                      {/* Grid of Weeks */}
                      <div className="heatmap-weeks-row">
                        {weeks.map((wk, wkIdx) => (
                          <div key={wkIdx} className="heatmap-week-col">
                            {wk.map((day, dIdx) => {
                              const dateStr = day.toISOString().split('T')[0];
                              const dayInfo = progressData?.activity?.[dateStr] || { hours: 0, problemsSolved: 0 };
                              const solved = getSolvedCountForDate(dateStr);

                              let colorClass = 'lvl-0';
                              if (solved === 1) colorClass = 'lvl-1';
                              if (solved === 2) colorClass = 'lvl-2';
                              if (solved === 3) colorClass = 'lvl-3';
                              if (solved >= 4) colorClass = 'lvl-4';

                              return (
                                <div
                                  key={dIdx}
                                  className={`heatmap-cell ${colorClass}`}
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
                  <div className="heatmap-footer-legend">
                    <span>Less</span>
                    <div className="legend-cell lvl-0"></div>
                    <div className="legend-cell lvl-1"></div>
                    <div className="legend-cell lvl-2"></div>
                    <div className="legend-cell lvl-3"></div>
                    <div className="legend-cell lvl-4"></div>
                    <span>More</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Overview (4 Cards Row) */}
            <div className="performance-overview-section">
              <h3 className="home-section-heading">Performance Overview</h3>
              <div className="activity-snapshot-grid">
                <div className="activity-snapshot-card">
                  <div className="snapshot-icon-box icon-purple"><FaBullseye /></div>
                  <div className="snapshot-stat-val">72%</div>
                  <div className="snapshot-stat-lbl">Accuracy</div>
                </div>
                <div className="activity-snapshot-card">
                  <div className="snapshot-icon-box icon-blue"><FaClipboardList /></div>
                  <div className="snapshot-stat-val">0</div>
                  <div className="snapshot-stat-lbl">Assessments Taken</div>
                </div>
                <div className="activity-snapshot-card">
                  <div className="snapshot-icon-box icon-green"><FaLaptopCode /></div>
                  <div className="snapshot-stat-val">
                    {totalProblemsSolved}
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, marginLeft: '3px' }}>/ 9k+</span>
                  </div>
                  <div className="snapshot-stat-lbl">Questions Solved</div>
                </div>
                <div className="activity-snapshot-card">
                  <div className="snapshot-icon-box icon-orange"><FaCalendarAlt /></div>
                  <div className="snapshot-stat-val">0</div>
                  <div className="snapshot-stat-lbl">Days on Platform</div>
                </div>
              </div>
            </div>
          </div>
        ) : profileSubTab === 'widget' ? (
          /* ─── REDESIGNED: Android Widget in User Profile ─── */
          <div className="profile-info-cards-stack">
            <div className="profile-info-card">
              <div className="widget-header-row">
                <div className="widget-header-icon-box">
                  <FaMobileAlt />
                </div>
                <div>
                  <h3 className="profile-card-section-title">
                    Android Native Home Screen Widget
                  </h3>
                  <p className="profile-card-section-subtitle">
                    Add a live SEED-IT activity and streak tracker directly onto your mobile phone launcher.
                  </p>
                </div>
              </div>

              {/* Grid with Phone Mockup & Download CTA */}
              <div className="widget-showcase-grid">
                {/* Left: Native Widget Simulation Preview */}
                <div className="widget-mockup-frame">
                  <div>
                    <div className="widget-mockup-top-bar">
                      <div className="widget-mockup-user">
                        <div className="widget-mockup-avatar">S</div>
                        <div>
                          <div className="widget-mockup-name">{user?.name || name || 'Student'}</div>
                          <div className="widget-mockup-handle">@{studentUsername || user?.username || 'username'}</div>
                        </div>
                      </div>
                      <div className="widget-streak-pill">
                        <FaFire size={11} style={{ marginRight: '4px' }} /> {activeStreak || userStreak || 1} Days
                      </div>
                    </div>

                    <div className="widget-chips-row">
                      <span className="widget-pill blue">
                        <FaCode size={10} style={{ marginRight: '4px' }} /> {totalProblemsSolved || 0} / 9,000+ Solved
                      </span>
                      <span className="widget-pill green">
                        <FaCoins size={10} style={{ marginRight: '4px' }} /> {seedCredits || 0} Credits
                      </span>
                      <span className="widget-pill gray">
                        <FaCalendarAlt size={10} style={{ marginRight: '4px' }} /> Active
                      </span>
                    </div>

                    {/* Simulation Grid (past 18 weeks x 7 rows) */}
                    <div className="widget-mini-heatmap">
                      {weeks.slice(-18).map((week, wIdx) => (
                        <div key={wIdx} className="widget-heatmap-col">
                          {week.map((d, dIdx) => {
                            const dateStr = d.toISOString().split('T')[0];
                            const cnt = getSolvedCountForDate(dateStr);
                            const level = cnt >= 10 ? 4 : cnt >= 6 ? 3 : cnt >= 3 ? 2 : cnt >= 1 ? 1 : 0;
                            return (
                              <div
                                key={dIdx}
                                className={`widget-dot lvl-${level}`}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="widget-mockup-footer">
                    <span>seedit.site/user • Tap to view profile</span>
                    <span>Synced Just now</span>
                  </div>
                </div>

                {/* Right: Download Button & Instructions */}
                <div className="widget-guide-col">
                  <div>
                    <h4 className="widget-guide-title">
                      Setup Instructions (1 Minute):
                    </h4>
                    <ol className="widget-steps-list">
                      <li>Tap the download button below to get <strong>seedit-widget.apk</strong>.</li>
                      <li>Install the APK on your Android mobile device.</li>
                      <li>Long-press empty space on your Android Home Screen &rarr; tap <strong>Widgets</strong>.</li>
                      <li>Select <strong>SEED-IT Tracker</strong> &rarr; drag <strong>SEED-IT Activity Widget</strong> to your screen.</li>
                      <li>Enter your handle <strong style={{ color: '#10b981' }}>@{studentUsername || user?.username || 'your_username'}</strong> and tap <strong>Save &amp; Place Widget</strong>!</li>
                    </ol>

                    <div className="widget-specs-row">
                      <span className="widget-spec-badge">
                        <FaMobileAlt size={11} style={{ marginRight: '4px' }} /> Android 8.0+
                      </span>
                      <span className="widget-spec-badge">
                        <FaBoxOpen size={11} style={{ marginRight: '4px' }} /> 33.2 KB Native APK
                      </span>
                      <span className="widget-spec-badge">
                        <FaBatteryFull size={11} style={{ marginRight: '4px' }} /> Zero Battery Drain
                      </span>
                    </div>
                  </div>

                  <div className="widget-actions-box">
                    <a
                      href="/downloads/seedit-widget.apk"
                      download="seedit-widget.apk"
                      className="widget-download-cta-btn"
                    >
                      <FaDownload /> Download SEED-IT Widget (seedit-widget.apk)
                    </a>

                    {studentUsername && (
                      <div className="widget-quick-links-group">
                        <a
                          href={`/user/${studentUsername}`}
                          target="_blank"
                          rel="noreferrer"
                          className="widget-secondary-btn"
                        >
                          <FaExternalLinkAlt size={11} /> View Public Track
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/user/${studentUsername}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Public track link copied to clipboard!');
                          }}
                          className="widget-secondary-btn"
                        >
                          <FaCopy size={11} /> Copy Link
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        ) : (
          /* ─── REDESIGNED: Change Password ─── */
          <div className="profile-info-cards-stack" style={{ maxWidth: '580px' }}>
            <div className="profile-info-card">
              <div className="password-card-header">
                <div className="password-icon-box">
                  <FaShieldAlt />
                </div>
                <div>
                  <h3 className="profile-card-section-title">Change Password</h3>
                  <p className="profile-card-section-subtitle">Ensure your account is protected with a secure password.</p>
                </div>
              </div>

              <div className="password-form-stack">
                <div className="form-field-group">
                  <label className="form-field-label">Current Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      placeholder="Enter your current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="form-text-input"
                    />
                    <button
                      type="button"
                      className="btn-toggle-eye"
                      onClick={() => setShowCurrentPassword(p => !p)}
                      title={showCurrentPassword ? "Hide password" : "Show password"}
                    >
                      {showCurrentPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">New Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Enter new password (minimum 6 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="form-text-input"
                    />
                    <button
                      type="button"
                      className="btn-toggle-eye"
                      onClick={() => setShowNewPassword(p => !p)}
                      title={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">Confirm New Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter new password to confirm"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="form-text-input"
                    />
                    <button
                      type="button"
                      className="btn-toggle-eye"
                      onClick={() => setShowConfirmPassword(p => !p)}
                      title={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="password-requirements-box">
                  <div className={`req-item ${newPassword.length >= 6 ? 'met' : ''}`}>
                    <FaCheck size={11} /> Minimum 6 characters in length
                  </div>
                  <div className={`req-item ${newPassword && newPassword === confirmPassword ? 'met' : ''}`}>
                    <FaCheck size={11} /> New password and confirmation match
                  </div>
                </div>

                <button
                  type="button"
                  className="feature-cta-btn btn-green-solid"
                  onClick={handleUpdatePassword}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
                >
                  <FaLock size={12} style={{ marginRight: '6px' }} /> Update Account Password
                </button>
              </div>
            </div>
          </div>
        )}

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
    const userEmail = user?.email;
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

    const userEmail = user?.email;
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

    const userEmail = user?.email;
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
    const allThemes = [
      {
        id: 'seed-seb',
        name: 'SEED-SEB Academic (Default)',
        desc: 'Clean, distraction-free examination theme with institutional SEED green accents.',
        colors: ['#f8fafc', '#ffffff', '#15803d']
      },
      {
        id: 'dark',
        name: 'Midnight Space (Dark)',
        desc: 'Futuristic slate theme with indigo highlights.',
        colors: ['#090d16', '#111827', '#6366f1']
      },
      {
        id: 'light',
        name: 'Classic Ice (Light)',
        desc: 'Sleek, high-contrast light mode for daytime coding.',
        colors: ['#f3f4f6', '#ffffff', '#4f46e5']
      },
      {
        id: 'crimson',
        name: 'Crimson Cyber (Red/Black)',
        desc: 'Pitch-black cyberpunk dashboard with blood-red accents.',
        colors: ['#0c0808', '#180f0f', '#ef4444']
      },
      {
        id: 'emerald',
        name: 'Emerald Matrix (Green/Black)',
        desc: 'Retro-terminal dark design with vibrant emerald highlights.',
        colors: ['#022c22', '#064e3b', '#10b981']
      },
      {
        id: 'red-light',
        name: 'Crimson Frost (Red/White)',
        desc: 'Clean, high-contrast light theme with rich red accents.',
        colors: ['#fdfafb', '#ffffff', '#dc2626']
      },
      {
        id: 'bw',
        name: 'Monochrome Minimalist (B&W)',
        desc: 'High-contrast, clean black & white theme.',
        colors: ['#ffffff', '#000000', '#000000']
      }
    ];

    const primaryColorOptions = [
      { id: 'green', color: '#10b981', name: 'Emerald Green' },
      { id: 'blue', color: '#3b82f6', name: 'Royal Blue' },
      { id: 'purple', color: '#8b5cf6', name: 'Amethyst Purple' },
      { id: 'orange', color: '#f97316', name: 'Sunset Orange' },
      { id: 'red', color: '#ef4444', name: 'Crimson Red' }
    ];

    const handleThemeChange = (themeId) => {
      localStorage.setItem('portal_theme', themeId);
      document.documentElement.setAttribute('data-theme', themeId);
      setCurrentTheme(themeId);
    };

    const handleColorChange = (colorId) => {
      localStorage.setItem('portal_primary_color', colorId);
      document.documentElement.setAttribute('data-color', colorId);
      setPrimaryColor(colorId);
    };

    const handleFontSizeChange = (size) => {
      localStorage.setItem('portal_font_size', size);
      document.documentElement.setAttribute('data-font-size', size);
      setFontSize(size);
    };

    const toggleSection = (sectionId) => {
      setExpandedSettingsSections(prev => ({
        ...prev,
        [sectionId]: !prev[sectionId]
      }));
    };

    return (
      <div className="settings-tab-content">
        <div className="home-welcome-header" style={{ marginBottom: '24px' }}>
          <h1 className="home-welcome-title">Portal Settings</h1>
          <p className="home-welcome-subtitle">Personalise your student workspace theme and interface appearance.</p>
        </div>

        <div className="settings-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '960px' }}>
          {/* Card 1: Workspace Appearance */}
          <div className="settings-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px' }}>
            <div className="settings-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <FaSun />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Workspace Appearance</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>Customise how the platform looks and feels for you.</p>
                </div>
              </div>
            </div>

            {/* Theme Mode row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Theme Mode</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Choose light or dark theme</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-primary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => handleThemeChange('seed-seb')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none',
                    background: (currentTheme === 'seed-seb' || currentTheme === 'light') ? 'var(--bg-secondary)' : 'transparent',
                    color: (currentTheme === 'seed-seb' || currentTheme === 'light') ? 'var(--text-main)' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: '12.5px', cursor: 'pointer',
                    boxShadow: (currentTheme === 'seed-seb' || currentTheme === 'light') ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <FaSun style={{ color: '#f59e0b' }} /> Light
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none',
                    background: (currentTheme === 'dark' || currentTheme === 'dim' || currentTheme === 'emerald') ? 'var(--bg-secondary)' : 'transparent',
                    color: (currentTheme === 'dark' || currentTheme === 'dim' || currentTheme === 'emerald') ? 'var(--text-main)' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: '12.5px', cursor: 'pointer',
                    boxShadow: (currentTheme === 'dark' || currentTheme === 'dim' || currentTheme === 'emerald') ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <FaMoon style={{ color: '#6366f1' }} /> Dark
                </button>
              </div>
            </div>

            {/* Themes Dropdown */}
            <div style={{ marginTop: '18px' }} ref={themeDropdownRef}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Platform Theme</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>Select an optimized theme palette designed for your workspace.</div>
              
              <div style={{ position: 'relative', maxWidth: '440px' }}>
                <button
                  type="button"
                  onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 16px',
                    background: 'var(--bg-primary)',
                    border: '1.5px solid var(--border-color)',
                    borderRadius: '10px',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(allThemes.find(t => t.id === currentTheme)?.colors || ['#f8fafc', '#ffffff', '#15803d']).map((c, idx) => (
                        <div key={idx} style={{ width: '12px', height: '12px', borderRadius: '50%', background: c, border: '1px solid rgba(0,0,0,0.15)' }} />
                      ))}
                    </div>
                    <span>{allThemes.find(t => t.id === currentTheme)?.name || 'SEED-SEB Academic (Default)'}</span>
                  </div>
                  <FaChevronDown style={{ fontSize: '12px', color: 'var(--text-muted)', transform: themeDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                </button>

                {themeDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      right: 0,
                      background: 'var(--bg-secondary)',
                      border: '1.5px solid var(--border-color)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.25), 0 4px 10px rgba(0,0,0,0.1)',
                      zIndex: 100,
                      maxHeight: '320px',
                      overflowY: 'auto',
                      padding: '6px'
                    }}
                  >
                    {allThemes.map(t => {
                      const active = currentTheme === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            handleThemeChange(t.id);
                            setThemeDropdownOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            background: active ? 'rgba(22, 163, 74, 0.12)' : 'transparent',
                            transition: 'background 0.15s ease',
                            marginBottom: '2px'
                          }}
                          onMouseEnter={e => {
                            if (!active) e.currentTarget.style.background = 'var(--bg-primary)';
                          }}
                          onMouseLeave={e => {
                            if (!active) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ display: 'flex', gap: '3px' }}>
                                {t.colors.map((c, cIdx) => (
                                  <div key={cIdx} style={{ width: '10px', height: '10px', borderRadius: '50%', background: c, border: '1px solid rgba(0,0,0,0.15)' }} />
                                ))}
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: active ? 700 : 600, color: active ? 'var(--accent-primary, #15803d)' : 'var(--text-main)' }}>
                                {t.name}
                              </span>
                            </div>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginLeft: '21px' }}>
                              {t.desc}
                            </span>
                          </div>
                          {active && <FaCheckCircle style={{ color: 'var(--accent-primary, #15803d)', fontSize: '15px', flexShrink: 0 }} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Primary Color Picker */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Primary Color</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Choose your preferred accent color</div>
              <div className="color-picker-row">
                {primaryColorOptions.map(p => (
                  <button
                    key={p.id}
                    className={`color-dot-btn ${primaryColor === p.id ? 'active' : ''}`}
                    style={{ background: p.color }}
                    onClick={() => handleColorChange(p.id)}
                    title={p.name}
                  >
                    {primaryColor === p.id && <FaCheck style={{ color: '#ffffff', fontSize: '12px' }} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size Selector */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Font Size</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Adjust the platform font size</div>
              <div className="font-size-group">
                <button
                  className={`font-size-btn ${fontSize === 'small' ? 'active' : ''}`}
                  onClick={() => handleFontSizeChange('small')}
                >
                  A- Small
                </button>
                <button
                  className={`font-size-btn ${fontSize === 'medium' ? 'active' : ''}`}
                  onClick={() => handleFontSizeChange('medium')}
                >
                  Medium
                </button>
                <button
                  className={`font-size-btn ${fontSize === 'large' ? 'active' : ''}`}
                  onClick={() => handleFontSizeChange('large')}
                >
                  A+ Large
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Notifications */}
          <div className="settings-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px' }}>
            <div className="settings-card-header" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                <FaBell />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Notifications</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>Manage how you receive important updates.</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Email Notifications</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Receive updates on assessments and results</div>
                </div>
                <label className="toggle-switch-wrapper">
                  <input
                    type="checkbox"
                    checked={emailNotifs}
                    onChange={e => setEmailNotifs(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Practice Reminders</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Get reminded about your daily practice goals</div>
                </div>
                <label className="toggle-switch-wrapper">
                  <input
                    type="checkbox"
                    checked={practiceReminders}
                    onChange={e => setPracticeReminders(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Assessment Alerts</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Receive alerts for assessment deadlines</div>
                </div>
                <label className="toggle-switch-wrapper">
                  <input
                    type="checkbox"
                    checked={assessmentAlerts}
                    onChange={e => setAssessmentAlerts(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          {/* Card 3: AI - API Connection */}
          <div className="settings-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px' }}>
            <div className="settings-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#faf5ff', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <FaKey />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>AI - API Connection</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>Configure Google Gemini and NVIDIA NIM API keys for tutor acceleration.</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  background: apiKeysList.length > 0 ? '#ecfdf5' : '#f1f5f9',
                  color: apiKeysList.length > 0 ? '#10b981' : '#94a3b8',
                  border: `1px solid ${apiKeysList.length > 0 ? '#a7f3d0' : '#cbd5e1'}`,
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: '700'
                }}>
                  {apiKeysList.length > 0 ? `Configured (${apiKeysList.length})` : 'Not Configured'}
                </span>
                <button
                  className="feature-cta-btn btn-green-outline"
                  style={{ width: 'auto', padding: '6px 14px', fontSize: '12.5px' }}
                  onClick={() => toggleSection('aiApi')}
                >
                  Configure +
                </button>
              </div>
            </div>

            {/* Collapsible API Key Management Form */}
            {expandedSettingsSections.aiApi && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <button
                    onClick={() => setShowInstructionsModal(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <FaGraduationCap /> How to Get Keys?
                  </button>
                </div>

                {apiKeysList.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    {apiKeysList.map(k => (
                      <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ background: k.type === 'gemini' ? '#10b981' : '#6366f1', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700, textTransform: 'uppercase' }}>{k.type}</span>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>{k.label}</span>
                        </div>
                        <button onClick={() => handleDeleteApiKey(k.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><FaTimes /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <select value={newKeyProvider} onChange={e => setNewKeyProvider(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)', fontSize: '13px' }}>
                    <option value="gemini">Google Gemini</option>
                    <option value="nvidia">NVIDIA NIM</option>
                  </select>
                  <input type="text" placeholder="Key Label" value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)', fontSize: '13px' }} />
                  <input type="password" placeholder="API Key Value" value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} style={{ flex: 2, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)', fontSize: '13px' }} />
                  <button onClick={handleAddApiKey} className="feature-cta-btn btn-green-solid" style={{ width: 'auto', padding: '8px 16px' }}>Add</button>
                </div>
                {saveSuccessMessage && <p style={{ color: '#10b981', fontSize: '12px', marginTop: '6px' }}>{saveSuccessMessage}</p>}
              </div>
            )}
          </div>

          {/* Card 4: Privacy & Data */}
          <div className="settings-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px' }}>
            <div className="settings-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <FaShieldAlt />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Privacy & Data</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>Manage your data and account privacy.</p>
                </div>
              </div>

              <button className="feature-cta-btn btn-slate-outline" style={{ width: 'auto', padding: '8px 18px', fontSize: '13px' }}>
                Manage <FaChevronRight style={{ fontSize: '10px' }} />
              </button>
            </div>
          </div>
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

  const renderHelpAndSupport = () => {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 8px 48px' }}>
        {/* Header Section */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '20px',
          padding: '28px 32px',
          marginBottom: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                boxShadow: '0 8px 20px rgba(37, 99, 235, 0.25)',
              }}>
                <FaHeadset />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#2563eb',
                    background: 'rgba(37, 99, 235, 0.12)',
                    padding: '3px 9px',
                    borderRadius: '6px',
                  }}>
                    SEED SUPPORT DESK
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>Real-Time Help &amp; Troubleshooting</span>
                </div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
                  Help &amp; Technical Support Center
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: 'var(--text-secondary, #475569)' }}>
                  Submit technical issues, browse troubleshooting guides, or track real-time resolution from our engineering team.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setSupportInitialCategory('download_seb');
                  setShowSupportModal(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                }}
              >
                <FaCommentDots /> Submit Support Request
              </button>
              <button
                type="button"
                onClick={() => setShowDocModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--bg-card, #ffffff)',
                  color: 'var(--text-main, #0f172a)',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '13px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  cursor: 'pointer',
                }}
              >
                <FaQuestionCircle /> FAQs &amp; Docs
              </button>
            </div>
          </div>
        </div>

        {/* 4 Category Action Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[
            {
              id: 'download_seb',
              icon: <FaDesktop style={{ color: '#2563eb' }} />,
              title: 'SEED-SEB Lockdown',
              desc: 'Troubleshoot code 0x80070005, Windows Defender blocks, secondary displays, or kiosk freeze.',
              bg: 'rgba(37, 99, 235, 0.08)',
              color: '#2563eb',
            },
            {
              id: 'widget_android',
              icon: <FaMobileAlt style={{ color: '#10b981' }} />,
              title: 'Mobile Widget Setup',
              desc: 'Resolve Android APK install, streak sync delays, battery saver restrictions, or widget placement.',
              bg: 'rgba(16, 185, 129, 0.08)',
              color: '#10b981',
            },
            {
              id: 'assessment',
              icon: <FaShieldAlt style={{ color: '#f59e0b' }} />,
              title: 'Exam Proctoring',
              desc: 'Assistance with webcam permissions, AI eye/face detection flags, audio checks, or session recovery.',
              bg: 'rgba(245, 158, 11, 0.08)',
              color: '#f59e0b',
            },
            {
              id: 'account',
              icon: <FaUser style={{ color: '#8b5cf6' }} />,
              title: 'Account & Tenant',
              desc: 'Student handle issues, college affiliation, exam schedule access, or profile verification.',
              bg: 'rgba(139, 92, 246, 0.08)',
              color: '#8b5cf6',
            },
          ].map((cat) => (
            <div
              key={cat.id}
              style={{
                background: 'var(--bg-card, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: cat.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  marginBottom: '12px',
                }}>
                  {cat.icon}
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                  {cat.title}
                </h3>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted, #64748b)', lineHeight: '1.45' }}>
                  {cat.desc}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSupportInitialCategory(cat.id);
                  setShowSupportModal(true);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: cat.color,
                  fontWeight: 700,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '4px',
                }}
              >
                Report an Issue <FaArrowRight size={10} />
              </button>
            </div>
          ))}
        </div>

        {/* Live Support Requests Tracker */}
        <div style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '20px',
          padding: '24px 28px',
          marginBottom: '32px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(37, 99, 235, 0.1)',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
              }}>
                <FaLifeRing />
              </div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
                My Support Requests
              </h2>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'var(--bg-secondary, #f1f5f9)',
                color: 'var(--text-secondary, #475569)',
              }}>
                {supportTicketsList.length} total
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setSupportInitialCategory('download_seb');
                setShowSupportModal(true);
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color, #cbd5e1)',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 600,
                color: 'var(--text-main, #0f172a)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FaCommentDots /> New Request
            </button>
          </div>

          {supportTicketsList.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              background: 'var(--bg-secondary, #f8fafc)',
              borderRadius: '14px',
              border: '1px dashed var(--border-color, #cbd5e1)',
            }}>
              <FaHeadset style={{ fontSize: '36px', color: '#94a3b8', marginBottom: '12px' }} />
              <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: 'var(--text-main, #1e293b)' }}>
                No support tickets submitted yet
              </p>
              <p style={{ margin: '4px 0 16px', fontSize: '12.5px', color: 'var(--text-muted, #64748b)' }}>
                Have questions about SEED-SEB, Android Widget, or exams? We are here to help.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSupportInitialCategory('download_seb');
                  setShowSupportModal(true);
                }}
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Create Support Request
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {supportTicketsList.map((ticket) => {
                const st = TICKET_STATUSES[ticket.status] || TICKET_STATUSES.OPEN;
                const dateStr = ticket.createdAt instanceof Date ? ticket.createdAt.toLocaleString() : 'Recently';

                return (
                  <div
                    key={ticket.id}
                    style={{
                      background: 'var(--bg-primary, #ffffff)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '14px',
                      padding: '18px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'var(--bg-secondary, #f1f5f9)',
                          color: 'var(--text-secondary, #334155)',
                          letterSpacing: '0.5px',
                        }}>
                          {ticket.ticketNumber || ticket.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', fontWeight: 500 }}>
                          {ticket.categoryLabel || ticket.category}
                        </span>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: ticket.priority === 'CRITICAL' ? '#fee2e2' : ticket.priority === 'HIGH' ? '#fef3c7' : '#f1f5f9',
                          color: ticket.priority === 'CRITICAL' ? '#b91c1c' : ticket.priority === 'HIGH' ? '#b45309' : '#475569',
                        }}>
                          {ticket.priority} Priority
                        </span>
                      </div>

                      <span style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '12px',
                        background: st.bg,
                        color: st.color,
                      }}>
                        {st.label}
                      </span>
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                        {ticket.subject}
                      </h4>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #475569)', lineHeight: '1.5' }}>
                        {ticket.description}
                      </p>
                    </div>

                    {/* Admin resolution note callout */}
                    {ticket.resolutionNotes && (
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: '10px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        color: '#166534',
                        fontSize: '13px',
                        lineHeight: '1.5',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '3px' }}>
                          <FaCheckCircle style={{ color: '#10b981' }} /> Admin Resolution Response:
                        </div>
                        <div>{ticket.resolutionNotes}</div>
                      </div>
                    )}

                    {/* Live Chat Action / Status Bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: ticket.chatEnabled ? 'rgba(59, 130, 246, 0.07)' : 'var(--bg-secondary, #f8fafc)',
                      border: ticket.chatEnabled ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid var(--border-color, #e2e8f0)',
                      fontSize: '12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaCommentDots style={{ color: ticket.chatEnabled ? '#2563eb' : 'var(--text-muted, #94a3b8)', fontSize: '14px' }} />
                        {ticket.chatEnabled ? (
                          <span style={{ color: '#1e40af', fontWeight: 600 }}>
                            {ticket.status === 'CLOSED' || ticket.status === 'closed'
                              ? 'Live chat concluded (Archived)'
                              : 'Support Staff initiated Live Chat'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #64748b)' }}>
                            Live chat not initiated yet. (Activated by staff when needed)
                          </span>
                        )}
                      </div>

                      {ticket.chatEnabled && (
                        <button
                          onClick={() => setChatTicket(ticket)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            background: ticket.status === 'CLOSED' || ticket.status === 'closed' ? '#64748b' : '#2563eb',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '11.5px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <FaCommentDots size={11} />
                          {ticket.status === 'CLOSED' || ticket.status === 'closed' ? 'View Chat History' : 'Open Live Chat'}
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-muted, #94a3b8)', borderTop: '1px solid var(--border-color, #f1f5f9)', paddingTop: '10px' }}>
                      <span>Platform: {ticket.platform || 'seed-seb'} • Version: {ticket.appVersion || '1.0.4'}</span>
                      <span>Submitted on {dateStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FAQ Troubleshooting Accordion */}
        <div style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '20px',
          padding: '24px 28px',
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: 'var(--text-main, #0f172a)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaQuestionCircle style={{ color: '#2563eb' }} /> Frequently Asked Questions
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
            {[
              {
                q: 'How do I run SEED-SEB if Windows SmartScreen flags it?',
                a: 'Click "More info" on the blue Windows dialog, then click "Run anyway". SEED-SEB requires elevated privileges to create the secure lockdown kiosk.',
              },
              {
                q: 'Why does SEED-SEB notify me about multiple monitors?',
                a: 'For exam integrity, secondary external displays must be unplugged or detached before the proctored browser can lock the screen.',
              },
              {
                q: 'How do I add the SEED-IT Widget on Android?',
                a: 'After installing the APK, long-press any empty space on your home screen, select "Widgets", locate "SEED-IT Tracker", and drag it to your screen.',
              },
              {
                q: 'What happens if my connection drops during an exam?',
                a: 'SEED-SEB features offline auto-recovery. Your answers are cached securely locally and automatically re-synced as soon as connectivity resumes.',
              },
            ].map((faq, idx) => (
              <div key={idx} style={{
                background: 'var(--bg-secondary, #f8fafc)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid var(--border-color, #e2e8f0)',
              }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-main, #0f172a)', marginBottom: '6px' }}>
                  {faq.q}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary, #475569)', lineHeight: '1.45' }}>
                  {faq.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`dashboard-container ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Welcome Quote Verification Popup (Commented out) */}
      {/*
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
        <div className="header-left">
          <button className="sidebar-toggle-btn" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle Sidebar">
            <FaBars />
          </button>
          <div className="header-brand" onClick={() => setActiveTab('dashboard')} style={{ cursor: 'pointer' }}>
            <img
              src="/SEED_Logo_Transparent.png"
              alt="SEED Logo"
              className="brand-logo-img"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/SEED_Logo.png';
              }}
            />
            <div>
              <div className="brand-title">SEED <span>SEB</span></div>
            </div>
          </div>
        </div>

        <div className="header-center-search">
          <FaSearch className="header-search-icon" />
          <input
            type="text"
            placeholder="Search assessments, topics, courses..."
            className="header-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <kbd className="header-search-shortcut-badge">Ctrl+K</kbd>
        </div>

        <div className="header-right-actions">
          <div className="notif-center-wrapper">
            <button
              className="header-action-icon-btn"
              title="Notifications"
              onClick={() => setNotifPopoverOpen((prev) => !prev)}
              aria-expanded={notifPopoverOpen}
            >
              <FaBell />
              {unreadNotifCount > 0 && (
                <span className="header-notif-count-badge">
                  {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                </span>
              )}
            </button>

            <NotificationCenterPopover
              isOpen={notifPopoverOpen}
              onClose={() => setNotifPopoverOpen(false)}
              notifications={notifications}
              readIds={readNotifIds}
              onMarkAsRead={handleMarkNotifAsRead}
              onMarkAllAsRead={handleMarkAllNotifsAsRead}
              onNavigate={(url) => {
                setNotifPopoverOpen(false);
                if (url.startsWith("/student/dashboard")) {
                  const params = new URLSearchParams(url.split("?")[1] || "");
                  const tab = params.get("tab");
                  if (tab) setActiveTab(tab);
                } else {
                  navigate(url);
                }
              }}
            />
          </div>

          <button className="header-action-icon-btn" title="Settings" onClick={() => setActiveTab('settings')}>
            <FaCog />
          </button>
          <div
            className="header-gamification-pill"
            onClick={() => {
              setActiveTab('profile');
              setProfileSubTab('info');
            }}
            title={`Level ${userLevelInfo.level}: ${userLevelInfo.levelTitle} · ${(totalXP || userLevelInfo?.totalXP || 0).toLocaleString()} XP · ${seedCredits.toLocaleString()} SC`}
          >
            <span className="hgp-level-badge">
              LVL {userLevelInfo.level}
            </span>
            <span className="hgp-divider" />
            <span className="hgp-stat">
              <span className="hgp-val">{(totalXP || userLevelInfo?.totalXP || 0).toLocaleString()}</span>
              <span className="hgp-unit xp">XP</span>
            </span>
            <span className="hgp-divider" />
            <span className="hgp-stat">
              <span className="hgp-val">{(seedCredits || 0).toLocaleString()}</span>
              <span className="hgp-unit credits">SC</span>
            </span>
          </div>
          <div className="header-user-avatar-pill" onClick={() => setActiveTab('profile')}>
            <div className="header-user-avatar-circle">
              {name.charAt(0).toUpperCase()}
            </div>
            <span className="header-user-name-text">{name.toUpperCase()}</span>
            <FaChevronDown style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '2px' }} />
          </div>
        </div>
      </header>

      {/* Workspace Body */}
      <div className="dashboard-body">
        {/* Sidebar Navigation */}
        <aside className={`dashboard-sidebar ${collapsed ? "collapsed" : ""}`}>
          <div className="sidebar-top-scrollable">
            <nav className="sidebar-nav-group">
              <button
                className={`sidebar-nav-pill ${activeTab === "dashboard" ? "active" : ""}`}
                onClick={() => setActiveTab("dashboard")}
              >
                <FaThLarge />
                {!collapsed && <span>Dashboard</span>}
              </button>
              <button
                className={`sidebar-nav-pill ${activeTab === "my-learning" ? "active" : ""}`}
                onClick={() => {
                  setCollapsed(false);
                  setActiveTab("my-learning");
                }}
              >
                <FaGraduationCap />
                {!collapsed && <span>My Learning</span>}
              </button>
              <button
                className={`sidebar-nav-pill ${activeTab === "courses" ? "active" : ""}`}
                onClick={() => {
                  setCollapsed(false);
                  setActiveTab("courses");
                }}
              >
                <FaBookOpen />
                {!collapsed && <span>Courses</span>}
              </button>
              <button
                className={`sidebar-nav-pill ${activeTab === "assessments" ? "active" : ""}`}
                onClick={() => setActiveTab("assessments")}
              >
                <FaClipboardList />
                {!collapsed && <span>Assessments</span>}
              </button>
              <button
                className={`sidebar-nav-pill ${activeTab === "practice" ? "active" : ""}`}
                onClick={() => {
                  setPracticeInitialTab('bank');
                  setPracticeInitialCourse(null);
                  setActiveTab("practice");
                }}
              >
                <FaLaptopCode />
                {!collapsed && <span>Practice</span>}
              </button>
              <button
                className={`sidebar-nav-pill ${activeTab === "profile" ? "active" : ""}`}
                onClick={() => setActiveTab("profile")}
              >
                <FaUser />
                {!collapsed && <span>Profile</span>}
              </button>
              <button
                className={`sidebar-nav-pill ${activeTab === "support" ? "active" : ""}`}
                onClick={() => setActiveTab("support")}
              >
                <FaHeadset />
                {!collapsed && <span>Help &amp; Support</span>}
              </button>
              {isAiInterviewAllowed && (
                <button
                  className="sidebar-nav-pill"
                  onClick={() => navigate('/student/ai-interview')}
                >
                  <FaUserTie />
                  {!collapsed && <span>AI Interview</span>}
                </button>
              )}
              <button
                className={`sidebar-nav-pill ${activeTab === "settings" ? "active" : ""}`}
                onClick={() => setActiveTab("settings")}
              >
                <FaCog />
                {!collapsed && <span>Settings</span>}
              </button>
            </nav>

            {!collapsed && (
              <div className="sidebar-widgets-section">
                {/* ── Today's Goal Card (Automated 3 Regular Tasks) ── */}
                <div className="sidebar-goals-card">
                  <div className="goals-card-header">
                    <span className="goals-title">Today's Goal</span>
                    <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>Automated</span>
                  </div>

                  <div className="goals-progress-summary">
                    <div className="goals-mini-ring">
                      <svg viewBox="0 0 36 36" className="goals-ring-svg">
                        <path
                          className="goals-ring-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="goals-ring-fill"
                          strokeDasharray={`${Math.round(((dailyGoals.filter(g => g.completed).length) / (dailyGoals.length || 3)) * 100)}, 100`}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <span className="goals-ring-text">
                        {dailyGoals.filter(g => g.completed).length}/{dailyGoals.length || 3}
                      </span>
                    </div>
                    <div className="goals-progress-text">
                      <span className="goals-completed-label">
                        {dailyGoals.filter(g => g.completed).length}/{dailyGoals.length || 3}
                      </span>
                      <span className="goals-sub-label">Goals Completed</span>
                    </div>
                  </div>

                  <div className="goals-items-list">
                    {dailyGoals.map((goal, idx) => (
                      <div
                        key={goal.id || idx}
                        className={`goal-checkbox-row ${goal.completed ? 'completed' : ''}`}
                        onClick={() => {
                          if (goal.completed) {
                            toast.success(`"${goal.title}" completed for today! (+${goal.xp || 30} XP · +${goal.credits || 10} Credits)`);
                          } else {
                            toast.info(`"${goal.title}" progress: ${goal.current || 0}/${goal.target || 1}. Complete it in Practice Bank! Reward: +${goal.xp || 30} XP · +${goal.credits || 10} Credits`);
                            setPracticeInitialTab('bank');
                            setPracticeInitialCourse(null);
                            setActiveTab('practice');
                          }
                        }}
                        title={goal.completed ? `Goal completed today (+${goal.xp || 30} XP · +${goal.credits || 10} Credits)` : `Automated goal (${goal.current || 0}/${goal.target || 1}) — click to practice (+${goal.xp || 30} XP · +${goal.credits || 10} Credits)`}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={`goal-check-circle ${goal.completed ? 'checked' : ''}`}>
                          {goal.completed ? <FaCheck /> : null}
                        </div>
                        <div className="goal-item-content">
                          <span className="goal-item-label">{goal.title} {goal.displayProgress ?? ''}</span>
                          <span className="goal-reward-tag">+{goal.xp || 30} XP · +{goal.credits || 10} Credits</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {(user?.lastStreakDate === new Date().toISOString().split('T')[0] || (dailyGoals.length > 0 && dailyGoals.some(g => (g.type === 'difficulty' || g.type === 'solve') && g.completed)) || (dailyGoals.length > 0 && dailyGoals.every(g => g.completed))) && (
                    <div className="streak-approved-badge">
                      <FaFire style={{ color: '#f59e0b' }} /> {userStreak} Day Streak Active!
                    </div>
                  )}

                  {dailyGoals.length > 0 && dailyGoals.every(g => g.completed) && (
                    <div className="all-goals-bonus-badge">
                      <FaTrophy style={{ marginRight: '6px' }} /> All 3 Done: +100 XP Bonus!
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="sidebar-bottom-group">
            <button className="sidebar-logout-pill" onClick={handleLogout}>
              <FaSignOutAlt />
              {!collapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        <main className="dashboard-main">
          {activeTab === "dashboard" ? renderDashboardHome() :
            activeTab === "my-learning" ? (
              <MyLearningDashboard 
                onOpenCourse={(c, view = 'CLASS') => {
                  const cid = c.courseId || c.id || c.slug;
                  try { sessionStorage.setItem(`seed_learning_course_${cid}`, JSON.stringify(c)); } catch (_) {}
                  navigate(`/student/learning/${cid}?view=${view}`, { state: { view } });
                }} 
                onExploreCourses={() => setActiveTab("courses")} 
                user={user}
                totalXP={totalXP || userLevelInfo?.totalXP || 0}
                seedCredits={seedCredits}
                userLevelInfo={userLevelInfo}
              />
            ) :
            activeTab === "courses" ? (
              <CourseCatalog 
                onStartCourse={(c, view = 'OVERVIEW') => { 
                  const cid = c.courseId || c.id || c.slug;
                  try { sessionStorage.setItem(`seed_learning_course_${cid}`, JSON.stringify(c)); } catch (_) {}
                  navigate(`/student/learning/${cid}?view=${view}`, { state: { view } });
                }} 
                user={user}
                totalXP={totalXP || userLevelInfo?.totalXP || 0}
                seedCredits={seedCredits}
                userLevelInfo={userLevelInfo}
              />
            ) :
            activeTab === "assessments" ? renderAssessments() :
              activeTab === "practice" ? (
                <PracticeHome 
                  initialTab={practiceInitialTab} 
                  initialCourse={practiceInitialCourse} 
                  user={user}
                  totalXP={totalXP || userLevelInfo?.totalXP || 0}
                  seedCredits={seedCredits}
                  userLevelInfo={userLevelInfo}
                />
              ) :
                activeTab === "support" ? renderHelpAndSupport() :
                  activeTab === "settings" ? renderSettings() :
                    renderProfile()}
        </main>
      </div>

      {/* Support & Documentation Modals */}
      <SupportTicketModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        user={user}
        initialCategory={supportInitialCategory}
      />
      <SupportTicketChatModal
        isOpen={Boolean(chatTicket)}
        onClose={() => setChatTicket(null)}
        ticket={chatTicket}
        currentUser={user}
      />
      <DocumentationModal
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
      />
      <AuthenticityModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* GitHub Sync & PAT Modal */}
      {showGitHubModal && (
        <GitHubSyncModal
          user={user}
          onClose={() => {
            setShowGitHubModal(false);
            const cfg = getGitHubConfig();
            setGithubConfig(cfg);
            setGithubPatInput(cfg.token || '');
            setGithubRepoName(cfg.repo || DEFAULT_REPO_NAME);
            setGithubAutoSync(cfg.autoSync);
            setGithubIsPrivate(cfg.isPrivate);
          }}
        />
      )}

      {/* Premium Upgrade Modal */}
      <PremiumUpgradeModal
        isOpen={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        user={user}
        onUpgradeSuccess={() => {
          const updated = { ...(user || {}), isPremium: true, premium: true };
          setUser(updated);
          loadAssessments(updated);
        }}
      />

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
    </div>
  );
};

export default StudentDashboard;
