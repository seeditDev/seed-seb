import React, { useState, useEffect, useMemo } from 'react';
import { 
  FaSearch, 
  FaBookOpen, 
  FaPlay, 
  FaClock, 
  FaCheckCircle, 
  FaBookmark, 
  FaRegBookmark,
  FaThLarge, 
  FaListUl, 
  FaGraduationCap, 
  FaStar, 
  FaBolt, 
  FaLock, 
  FaPlus, 
  FaArrowRight, 
  FaTrashAlt, 
  FaCode, 
  FaCheck, 
  FaShieldAlt, 
  FaChevronDown,
  FaTimes,
  FaLayerGroup,
  FaGlobe,
  FaTag,
  FaClipboardCheck,
  FaUserTie,
  FaFileAlt
} from 'react-icons/fa';
import { COURSE_CATALOG } from '../data/courseCatalogData';
import { fetchLiveCoursesFromFirestore } from '../services/courseMetadataService';
import { 
  getEnrolledCourseIds, 
  fetchUserCourseProgressMap,
  enrollCourse,
  unenrollCourse
} from '../services/learningEngineService';
import { fetchUserEntitledCourseIds, checkCourseEntitlement } from '../services/courseEntitlementService';
import { toast } from 'sonner';
import SeedCreditCoin from '../../components/SeedCreditCoin';
import { calculateCourseRewards } from '../../utils/gamificationService';
import '../styles/CourseCatalog.css';
import '../styles/CourseLearningPlayer.css';

const POPULAR_SEARCHES = [
  'DSA',
  'Python',
  'Web Development',
  'Database',
  'System Design',
  'AI/ML'
];

const DOMAIN_PILLS = [
  { id: 'ALL', label: 'All Domains' },
  { id: '01-programming', label: 'Programming' },
  { id: '02-dsa', label: 'DSA' },
  { id: '03-web-development', label: 'Web Development' },
  { id: '04-databases', label: 'Databases' },
  { id: '05-computer-science', label: 'Computer Science' },
  { id: '06-system-design', label: 'System Design' },
  { id: '07-ai-ml', label: 'AI / ML' },
  { id: '08-cloud-devops', label: 'Cloud & DevOps' },
  { id: '09-mobile-development', label: 'Mobile Development' },
  { id: '11-projects', label: 'Projects' },
  { id: '12-interview-placement', label: 'Interview & Placement' }
];

/**
 * High-fidelity Vector SVG Illustrations tailored for course thumbnails
 */
const CourseThumbnailIllustration = ({ category = '', slug = '', title = '' }) => {
  const query = `${category} ${slug} ${title}`.toLowerCase();

  if (query.includes('java') && !query.includes('javascript')) {
    // Steaming Coffee Cup (Java)
    return (
      <svg viewBox="0 0 100 100" fill="none" className="thumb-svg-graphic" xmlns="http://www.w3.org/2000/svg">
        {/* Steam waves */}
        <path d="M 40 30 Q 35 20, 42 12 Q 48 4, 42 0" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85" />
        <path d="M 52 32 Q 47 22, 54 14 Q 60 6, 54 2" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
        <path d="M 64 30 Q 59 20, 66 12 Q 72 4, 66 0" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8" />
        {/* Cup body */}
        <path d="M 28 36 L 76 36 L 72 74 C 71 82, 33 82, 32 74 Z" fill="url(#javaGrad)" stroke="#60a5fa" strokeWidth="1.5" />
        {/* Saucer */}
        <ellipse cx="52" cy="85" rx="34" ry="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
        {/* Cup Handle */}
        <path d="M 74 44 C 86 44, 86 64, 73 66" stroke="#60a5fa" strokeWidth="3" fill="none" strokeLinecap="round" />
        <defs>
          <linearGradient id="javaGrad" x1="28" y1="36" x2="76" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1e3a8a" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (query.includes('javascript') || query.includes('js') || query.includes('web-dev-js')) {
    // Yellow JS Box
    return (
      <svg viewBox="0 0 100 100" fill="none" className="thumb-svg-graphic" xmlns="http://www.w3.org/2000/svg">
        <rect x="15" y="15" width="70" height="70" rx="12" fill="#f7df1e" />
        <text x="45" y="68" fill="#000000" fontSize="32" fontWeight="900" fontFamily="sans-serif">J</text>
        <text x="63" y="68" fill="#000000" fontSize="32" fontWeight="900" fontFamily="sans-serif">S</text>
        <circle cx="28" cy="30" r="3" fill="#000000" opacity="0.3" />
      </svg>
    );
  }

  if (query.includes('dsa') || query.includes('algorithm') || query.includes('tree') || query.includes('graph')) {
    // 3D Isometric Glowing Cubes / Graph Nodes
    return (
      <svg viewBox="0 0 100 100" fill="none" className="thumb-svg-graphic" xmlns="http://www.w3.org/2000/svg">
        {/* Connection lines */}
        <line x1="50" y1="38" x2="28" y2="65" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 2" />
        <line x1="50" y1="38" x2="72" y2="65" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 2" />
        <line x1="28" y1="65" x2="72" y2="65" stroke="#38bdf8" strokeWidth="1.5" />
        {/* Top Cube */}
        <g transform="translate(36, 12)">
          <path d="M 14 0 L 28 8 L 14 16 L 0 8 Z" fill="#38bdf8" />
          <path d="M 0 8 L 14 16 L 14 30 L 0 22 Z" fill="#0284c7" />
          <path d="M 28 8 L 14 16 L 14 30 L 28 22 Z" fill="#0369a1" />
        </g>
        {/* Left Bottom Cube */}
        <g transform="translate(14, 48)">
          <path d="M 14 0 L 28 8 L 14 16 L 0 8 Z" fill="#60a5fa" />
          <path d="M 0 8 L 14 16 L 14 30 L 0 22 Z" fill="#2563eb" />
          <path d="M 28 8 L 14 16 L 14 30 L 28 22 Z" fill="#1d4ed8" />
        </g>
        {/* Right Bottom Cube */}
        <g transform="translate(58, 48)">
          <path d="M 14 0 L 28 8 L 14 16 L 0 8 Z" fill="#34d399" />
          <path d="M 0 8 L 14 16 L 14 30 L 0 22 Z" fill="#059669" />
          <path d="M 28 8 L 14 16 L 14 30 L 28 22 Z" fill="#047857" />
        </g>
      </svg>
    );
  }

  if (query.includes('python')) {
    // Python Terminal & Loops
    return (
      <svg viewBox="0 0 100 100" fill="none" className="thumb-svg-graphic" xmlns="http://www.w3.org/2000/svg">
        <rect x="14" y="20" width="72" height="58" rx="8" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
        <circle cx="24" cy="30" r="2.5" fill="#ef4444" />
        <circle cx="32" cy="30" r="2.5" fill="#f59e0b" />
        <circle cx="40" cy="30" r="2.5" fill="#10b981" />
        <path d="M 24 46 L 34 52 L 24 58" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="42" y1="52" x2="68" y2="52" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="24" y1="66" x2="52" y2="66" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </svg>
    );
  }

  if (query.includes('database') || query.includes('sql')) {
    // Database Cylinders
    return (
      <svg viewBox="0 0 100 100" fill="none" className="thumb-svg-graphic" xmlns="http://www.w3.org/2000/svg">
        {/* Cylinder 1 */}
        <ellipse cx="50" cy="30" rx="30" ry="10" fill="#0284c7" />
        <path d="M 20 30 L 20 45 C 20 52, 80 52, 80 45 L 80 30 Z" fill="#0369a1" />
        <ellipse cx="50" cy="45" rx="30" ry="10" fill="#0284c7" stroke="#38bdf8" strokeWidth="1" />
        {/* Cylinder 2 */}
        <path d="M 20 45 L 20 60 C 20 67, 80 67, 80 60 L 80 45 Z" fill="#075985" />
        <ellipse cx="50" cy="60" rx="30" ry="10" fill="#0284c7" stroke="#38bdf8" strokeWidth="1" />
        {/* Cylinder 3 */}
        <path d="M 20 60 L 20 75 C 20 82, 80 82, 80 75 L 80 60 Z" fill="#0c4a6e" />
        <ellipse cx="50" cy="75" rx="30" ry="10" fill="#0284c7" stroke="#38bdf8" strokeWidth="1" />
      </svg>
    );
  }

  if (query.includes('web') || query.includes('react') || query.includes('html') || query.includes('css')) {
    // Browser Mockup
    return (
      <svg viewBox="0 0 100 100" fill="none" className="thumb-svg-graphic" xmlns="http://www.w3.org/2000/svg">
        <rect x="12" y="20" width="76" height="58" rx="8" fill="#18181b" stroke="#6366f1" strokeWidth="1.5" />
        <rect x="12" y="20" width="76" height="14" rx="8" fill="#27272a" />
        <circle cx="20" cy="27" r="2" fill="#ef4444" />
        <circle cx="26" cy="27" r="2" fill="#f59e0b" />
        <circle cx="32" cy="27" r="2" fill="#10b981" />
        <rect x="20" y="42" width="26" height="26" rx="4" fill="#312e81" stroke="#818cf8" strokeWidth="1" />
        <line x1="52" y1="46" x2="80" y2="46" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="52" y1="56" x2="74" y2="56" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
        <line x1="52" y1="64" x2="68" y2="64" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // General CS / Algorithmic Graphic
  return (
    <svg viewBox="0 0 100 100" fill="none" className="thumb-svg-graphic" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="32" stroke="#10b981" strokeWidth="2" strokeDasharray="4 3" opacity="0.6" />
      <circle cx="50" cy="50" r="16" fill="#065f46" stroke="#34d399" strokeWidth="2" />
      <circle cx="26" cy="30" r="7" fill="#047857" />
      <circle cx="74" cy="30" r="7" fill="#047857" />
      <circle cx="50" cy="82" r="7" fill="#047857" />
      <line x1="50" y1="50" x2="26" y2="30" stroke="#34d399" strokeWidth="1.5" />
      <line x1="50" y1="50" x2="74" y2="30" stroke="#34d399" strokeWidth="1.5" />
      <line x1="50" y1="50" x2="50" y2="82" stroke="#34d399" strokeWidth="1.5" />
    </svg>
  );
};

const CourseCatalog = ({ onStartCourse, user, totalXP, seedCredits, userLevelInfo }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedDomain, setSelectedDomain] = useState('All Domains');
  
  // Secondary Dropdown Filters
  const [selectedLevel, setSelectedLevel] = useState('All Levels');
  const [selectedPrice, setSelectedPrice] = useState('All');
  const [selectedDuration, setSelectedDuration] = useState('Any Duration');
  const [selectedLanguage, setSelectedLanguage] = useState('All');
  const [selectedAssessment, setSelectedAssessment] = useState('With Assessments');
  const [sortBy, setSortBy] = useState('RECOMMENDED');
  const [viewMode, setViewMode] = useState('list'); // Default 'list' matching screenshot

  const uid = user?.uid || 'guest';
  const [courses, setCourses] = useState(() => COURSE_CATALOG.filter(c => c.enabled !== false));
  const [enrolledIds, setEnrolledIds] = useState(() => getEnrolledCourseIds(uid));
  const [entitledSet, setEntitledSet] = useState(null);
  const [progressMap, setProgressMap] = useState({});

  // Bookmarked / Saved courses
  const [savedCourseIds, setSavedCourseIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('seed_saved_courses') || '[]');
    } catch (_) {
      return [];
    }
  });

  const toggleBookmark = (courseId, e) => {
    e.stopPropagation();
    setSavedCourseIds(prev => {
      const next = prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId];
      try {
        localStorage.setItem('seed_saved_courses', JSON.stringify(next));
      } catch (_) {}
      toast.success(prev.includes(courseId) ? 'Course removed from bookmarks' : 'Course saved to bookmarks!');
      return next;
    });
  };

  // Sync enrolled course IDs and fetch live real metadata from Firestore
  useEffect(() => {
    let isMounted = true;
    async function initCatalogAndProgress() {
      const live = await fetchLiveCoursesFromFirestore(COURSE_CATALOG);
      const activeCourses = (live && live.length > 0) 
        ? live.filter(c => c.enabled !== false) 
        : COURSE_CATALOG.filter(c => c.enabled !== false);
      
      if (isMounted) setCourses(activeCourses);

      const { enrolledIds: ids, progressMap: map } = await fetchUserCourseProgressMap(uid, activeCourses);
      if (isMounted) {
        setEnrolledIds(ids || []);
        setProgressMap(map || {});
      }

      fetchUserEntitledCourseIds(user).then((entitled) => {
        if (isMounted) setEntitledSet(entitled);
      });
    }

    initCatalogAndProgress();
    return () => { isMounted = false; };
  }, [uid, user]);

  const [unenrollCourseTarget, setUnenrollCourseTarget] = useState(null);
  const [isUnenrolling, setIsUnenrolling] = useState(false);

  const handleEnrollCourse = async (course) => {
    if (!course) return;
    const ent = checkCourseEntitlement(course, user, entitledSet);
    if (ent.isLocked) {
      toast.error(ent.reason, { duration: 6000 });
      return;
    }
    const cid = course.courseId || course.slug || course.id;
    await enrollCourse(uid, cid);
    setEnrolledIds(prev => Array.from(new Set([...prev, cid, course.courseId])));
    toast.success(`Successfully enrolled in "${course.title}"!`);
  };

  const handleConfirmUnenroll = async (course) => {
    if (!course) return;
    setIsUnenrolling(true);
    try {
      const cid = course.courseId || course.slug || course.id;
      await unenrollCourse(uid, cid);
      setEnrolledIds(prev => prev.filter(id => id !== cid && id !== course.courseId));
      setProgressMap(prev => {
        const next = { ...prev };
        delete next[cid];
        delete next[course.courseId];
        return next;
      });
      setUnenrollCourseTarget(null);
      toast.info(`You have unenrolled from "${course.title}".`);
    } catch (err) {
      toast.error('Failed to unenroll: ' + err.message);
    } finally {
      setIsUnenrolling(false);
    }
  };

  // Status Counts for 5 Metric Cards
  const statusCounts = useMemo(() => {
    let enrolled = 0;
    let inProgress = 0;
    let completed = 0;
    let notEnrolled = 0;

    courses.forEach(course => {
      if (!course) return;
      const isE = enrolledIds.includes(course.courseId) || enrolledIds.includes(course.slug);
      const prog = progressMap[course.courseId] || progressMap[course.slug];
      const pct = prog?.percentage || 0;

      if (isE) {
        enrolled++;
        if (pct >= 100) completed++;
        else if (pct > 0) inProgress++;
      } else {
        notEnrolled++;
      }
    });

    return {
      ALL: courses.length,
      ENROLLED: enrolled,
      IN_PROGRESS: inProgress,
      COMPLETED: completed,
      NOT_ENROLLED: notEnrolled
    };
  }, [courses, enrolledIds, progressMap]);

  // Filtered and Sorted Courses
  const filteredCourses = useMemo(() => {
    let list = courses.filter(course => {
      if (!course) return false;
      const q = (searchQuery || '').toLowerCase().trim();
      const title = String(course.title || '').toLowerCase();
      const category = String(course.category || '').toLowerCase();
      const slug = String(course.slug || course.courseId || '').toLowerCase();
      const skills = Array.isArray(course.skills) ? course.skills : [];

      const matchesSearch = !q ||
        title.includes(q) ||
        category.includes(q) ||
        slug.includes(q) ||
        skills.some(s => String(s || '').toLowerCase().includes(q));

      const isEnrolled = enrolledIds.includes(course.courseId) || enrolledIds.includes(course.slug);
      const prog = progressMap[course.courseId] || progressMap[course.slug];
      const pct = prog?.percentage || 0;
      const isCompleted = pct >= 100;
      const isInProgress = isEnrolled && pct > 0 && pct < 100;

      let matchesStatus = true;
      if (selectedStatus === 'ENROLLED') matchesStatus = isEnrolled;
      else if (selectedStatus === 'IN_PROGRESS') matchesStatus = isInProgress;
      else if (selectedStatus === 'COMPLETED') matchesStatus = isCompleted;
      else if (selectedStatus === 'NOT_ENROLLED') matchesStatus = !isEnrolled;

      let matchesDomain = true;
      if (selectedDomain !== 'All Domains') {
        const cleanDomain = selectedDomain.replace(/^\d+\.\s*/, '').toLowerCase();
        const dId = String(course.domainId || '').toLowerCase();
        const dTitle = String(course.domainTitle || '').toLowerCase();
        matchesDomain = dTitle.includes(cleanDomain) ||
          dId.includes(cleanDomain.replace(/[^a-z0-9]/g, '')) ||
          category.includes(cleanDomain) ||
          slug.includes(cleanDomain) ||
          (cleanDomain.includes('dsa') && (slug.includes('dsa') || dId.includes('dsa') || category.includes('dsa')));
      }

      // Secondary filter: Level
      let matchesLevel = true;
      if (selectedLevel !== 'All Levels') {
        const lvl = String(course.level || '').toLowerCase();
        if (selectedLevel === 'Beginner') matchesLevel = lvl.includes('beginner') || lvl.includes('all');
        else if (selectedLevel === 'Intermediate') matchesLevel = lvl.includes('intermediate') || lvl.includes('all');
        else if (selectedLevel === 'Advanced') matchesLevel = lvl.includes('advanced') || lvl.includes('expert');
      }

      // Secondary filter: Duration
      let matchesDuration = true;
      const hours = course.estimatedHours || 20;
      if (selectedDuration === '< 10 Hours') matchesDuration = hours < 10;
      else if (selectedDuration === '10 - 30 Hours') matchesDuration = hours >= 10 && hours <= 30;
      else if (selectedDuration === '30+ Hours') matchesDuration = hours > 30;

      return matchesSearch && matchesStatus && matchesDomain && matchesLevel && matchesDuration;
    });

    // Sorting
    if (sortBy === 'RATING') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'POPULAR') {
      list.sort((a, b) => (b.reviewsCount || b.reviews?.length || 0) - (a.reviewsCount || a.reviews?.length || 0));
    } else if (sortBy === 'MODULES') {
      list.sort((a, b) => (b.modules?.length || 0) - (a.modules?.length || 0));
    }

    return list;
  }, [courses, searchQuery, selectedStatus, selectedDomain, selectedLevel, selectedDuration, sortBy, enrolledIds, progressMap]);

  return (
    <div className="clean-catalog-wrapper">
      {/* 1. HERO SECTION */}
      <section className="clean-catalog-hero">
        {/* Left Column */}
        <div className="hero-left-col">
          <div className="hero-tag-pill">
            <span>🌱</span>
            <span>Learn • Practice • Grow</span>
          </div>

          <h1 className="hero-main-title">
            Explore <span className="highlight-green">Courses &amp; Learning Paths</span>
          </h1>

          <p className="hero-sub-description">
            Structured curriculum with instructor videos, readings, code examples, practice questions, and dual 90%+ gated assessments.
          </p>

          {/* Search Box */}
          <div className="hero-search-container">
            <FaSearch className="hero-search-icon" />
            <input
              type="text"
              className="hero-search-input"
              placeholder="Search courses, skills, or topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', marginRight: '8px' }}
                title="Clear search"
              >
                <FaTimes size={13} />
              </button>
            )}
            <button className="hero-search-btn">Search</button>
          </div>

          {/* Popular Searches */}
          <div className="popular-searches-row">
            <span className="popular-label">Popular searches:</span>
            {POPULAR_SEARCHES.map(item => (
              <button
                key={item}
                className="popular-tag-btn"
                onClick={() => setSearchQuery(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="hero-right-col">
          {/* 5 Status Metrics Row */}
          <div className="status-metrics-card-row">
            <div 
              className={`metric-pill-card ${selectedStatus === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('ALL')}
              title="Show all courses"
            >
              <div className="metric-card-icon-box green-box">
                <FaBookOpen />
              </div>
              <span className="metric-card-value">{statusCounts.ALL}</span>
              <span className="metric-card-title">Total Courses</span>
            </div>

            <div 
              className={`metric-pill-card ${selectedStatus === 'ENROLLED' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('ENROLLED')}
              title="Show enrolled courses"
            >
              <div className="metric-card-icon-box blue-round">
                <FaPlay size={10} />
              </div>
              <span className="metric-card-value">{statusCounts.ENROLLED}</span>
              <span className="metric-card-title">Enrolled</span>
            </div>

            <div 
              className={`metric-pill-card ${selectedStatus === 'IN_PROGRESS' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('IN_PROGRESS')}
              title="Show in-progress courses"
            >
              <div className="metric-card-icon-box orange-round">
                <FaClock size={11} />
              </div>
              <span className="metric-card-value">{statusCounts.IN_PROGRESS}</span>
              <span className="metric-card-title">In Progress</span>
            </div>

            <div 
              className={`metric-pill-card ${selectedStatus === 'COMPLETED' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('COMPLETED')}
              title="Show completed courses"
            >
              <div className="metric-card-icon-box green-round">
                <FaCheck size={10} />
              </div>
              <span className="metric-card-value">{statusCounts.COMPLETED}</span>
              <span className="metric-card-title">Completed</span>
            </div>

            <div 
              className={`metric-pill-card ${selectedStatus === 'NOT_ENROLLED' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('NOT_ENROLLED')}
              title="Show not enrolled courses"
            >
              <div className="metric-card-icon-box purple-box">
                <FaBookmark size={11} />
              </div>
              <span className="metric-card-value">{statusCounts.NOT_ENROLLED}</span>
              <span className="metric-card-title">Not Enrolled</span>
            </div>

            {/* Stack of books with sprout illustration */}
            <div className="metrics-sprout-art">
              <svg viewBox="0 0 70 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                {/* Sprout Leaves */}
                <path d="M 52 24 C 55 10, 48 3, 38 6 C 38 13, 45 22, 52 24 Z" fill="#10b981" />
                <path d="M 52 24 C 61 21, 68 11, 64 3 C 55 3, 52 14, 52 24 Z" fill="#34d399" />
                <line x1="52" y1="24" x2="52" y2="34" stroke="#059669" strokeWidth="2" strokeLinecap="round" />
                {/* Book 1 */}
                <rect x="14" y="32" width="46" height="7" rx="2" fill="#059669" />
                {/* Book 2 */}
                <rect x="10" y="40" width="54" height="7" rx="2" fill="#0d9488" />
                {/* Book 3 */}
                <rect x="6" y="48" width="62" height="8" rx="2" fill="#0f766e" />
              </svg>
            </div>
          </div>

          {/* Skills Promo Card */}
          <div className="skills-promo-card">
            <div className="promo-left-graphic">
              <svg viewBox="0 0 65 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <path d="M 45 18 C 47 7, 41 2, 33 4 C 33 9, 39 16, 45 18 Z" fill="#10b981" />
                <path d="M 45 18 C 53 16, 58 8, 55 2 C 48 2, 45 10, 45 18 Z" fill="#34d399" />
                <line x1="45" y1="18" x2="45" y2="28" stroke="#059669" strokeWidth="2" strokeLinecap="round" />
                <rect x="12" y="27" width="40" height="7" rx="2" fill="#059669" />
                <rect x="8" y="35" width="48" height="7" rx="2" fill="#0d9488" />
                <rect x="4" y="43" width="56" height="8" rx="2" fill="#0f766e" />
              </svg>
            </div>

            <div className="promo-center-text">
              <h3 className="promo-main-heading">Build your skills. Unlock opportunities.</h3>
              <p className="promo-sub-text">Learn today. Grow for tomorrow.</p>
              <button 
                className="promo-start-btn"
                onClick={() => {
                  if (filteredCourses[0]) onStartCourse(filteredCourses[0], 'OVERVIEW');
                }}
              >
                <span>Start Learning</span>
                <FaArrowRight size={10} />
              </button>
            </div>

            <div className="promo-right-bullets">
              <div className="promo-bullet-item">
                <FaCheckCircle className="promo-check-icon" />
                <span>Industry-relevant curriculum</span>
              </div>
              <div className="promo-bullet-item">
                <FaCheckCircle className="promo-check-icon" />
                <span>Hands-on practice</span>
              </div>
              <div className="promo-bullet-item">
                <FaCheckCircle className="promo-check-icon" />
                <span>Assessments &amp; certificates</span>
              </div>
              <div className="promo-bullet-item">
                <FaCheckCircle className="promo-check-icon" />
                <span>Boost your career</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. DOMAIN FILTER PILLS ROW */}
      <div className="domain-pills-container">
        {DOMAIN_PILLS.map(domain => {
          const isSelected = selectedDomain === domain.label;
          return (
            <button
              key={domain.id}
              className={`domain-pill-item ${isSelected ? 'active' : ''}`}
              onClick={() => setSelectedDomain(domain.label)}
            >
              {domain.label}
            </button>
          );
        })}
      </div>

      {/* 3. SECONDARY FILTERS TOOLBAR */}
      <div className="catalog-filters-toolbar">
        <div className="filters-dropdown-group">
          {/* Level Dropdown */}
          <div className="filter-select-box">
            <FaGraduationCap className="filter-icon" />
            <select 
              className="filter-dropdown-select"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
            >
              <option value="All Levels">All Levels</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>

          {/* Price Dropdown */}
          <div className="filter-select-box">
            <FaTag className="filter-icon" />
            <select 
              className="filter-dropdown-select"
              value={selectedPrice}
              onChange={(e) => setSelectedPrice(e.target.value)}
            >
              <option value="All">Price: All</option>
              <option value="Free">Free</option>
              <option value="Premium">Included with Premium</option>
            </select>
          </div>

          {/* Duration Dropdown */}
          <div className="filter-select-box">
            <FaClock className="filter-icon" />
            <select 
              className="filter-dropdown-select"
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(e.target.value)}
            >
              <option value="Any Duration">Any Duration</option>
              <option value="< 10 Hours">&lt; 10 Hours</option>
              <option value="10 - 30 Hours">10 - 30 Hours</option>
              <option value="30+ Hours">30+ Hours</option>
            </select>
          </div>

          {/* Language Dropdown */}
          <div className="filter-select-box">
            <FaGlobe className="filter-icon" />
            <select 
              className="filter-dropdown-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              <option value="All">Language: All</option>
              <option value="English">English</option>
              <option value="Hindi">Multi-Track</option>
            </select>
          </div>

          {/* Assessment Dropdown */}
          <div className="filter-select-box">
            <FaClipboardCheck className="filter-icon" />
            <select 
              className="filter-dropdown-select"
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
            >
              <option value="With Assessments">With Assessments</option>
              <option value="All">All Formats</option>
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="filter-select-box">
            <FaLayerGroup className="filter-icon" />
            <select 
              className="filter-dropdown-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="RECOMMENDED">Sort By: Recommended</option>
              <option value="POPULAR">Most Popular</option>
              <option value="RATING">Highest Rated</option>
              <option value="MODULES">Most Modules</option>
            </select>
          </div>
        </div>

        {/* Right Controls: Count & View Switcher */}
        <div className="toolbar-right-controls">
          <span className="toolbar-courses-count">
            {filteredCourses.length} {filteredCourses.length === 1 ? 'Course' : 'Courses'}
          </span>

          <div className="view-toggle-capsule">
            <button 
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View (Default)"
            >
              <FaListUl size={12} />
              <span>List</span>
            </button>
            <button 
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View (Optional)"
            >
              <FaThLarge size={12} />
              <span>Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. RECOMMENDED TECHNICAL COURSES HEADER */}
      <div className="courses-section-header">
        <h2 className="courses-section-title">
          {selectedStatus === 'ENROLLED' ? 'My Enrolled Courses' :
           selectedStatus === 'IN_PROGRESS' ? 'Courses In Progress' :
           selectedStatus === 'COMPLETED' ? 'Completed Courses' :
           selectedStatus === 'NOT_ENROLLED' ? 'Available to Enroll' :
           'Recommended Technical Courses'}
        </h2>
        <p className="courses-section-subtitle">Courses curated for your learning journey</p>
      </div>

      {/* 5. COURSES LIST / GRID VIEW */}
      {filteredCourses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <FaBookOpen size={36} color="#94a3b8" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>No Courses Found</h3>
          <p style={{ fontSize: '13.5px', color: '#64748b', margin: '0 0 16px 0' }}>
            No courses match the active filters or search query "{searchQuery}".
          </p>
          <button 
            onClick={() => {
              setSearchQuery('');
              setSelectedStatus('ALL');
              setSelectedDomain('All Domains');
              setSelectedLevel('All Levels');
              setSelectedDuration('Any Duration');
            }}
            style={{
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 18px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className={viewMode === 'list' ? 'catalog-cards-list-view' : 'catalog-cards-grid-view'}>
          {filteredCourses.map(course => {
            const isEnrolled = enrolledIds.includes(course.courseId) || enrolledIds.includes(course.slug);
            const courseProg = progressMap[course.courseId] || progressMap[course.slug];
            const coursePct = courseProg?.percentage || 0;
            const isSaved = savedCourseIds.includes(course.courseId || course.slug);
            const entitlement = checkCourseEntitlement(course, user, entitledSet);
            const rewards = calculateCourseRewards(course);

            const totalModules = course.modules?.length || course.modulesCount || 4;
            const totalLessons = course.lessonsCount || course.modules?.reduce((acc, m) => acc + (m.topics?.length || 0), 0) || 16;
            const totalHours = course.estimatedHours || Math.round((course.modules?.reduce((acc, m) => acc + (m.estimatedMinutes || 60), 0) || 180) / 60 * 10) / 10 || 18;

            // Extract primary skills tags
            const skillsList = Array.isArray(course.skills) && course.skills.length > 0
              ? course.skills.slice(0, 6)
              : [course.category || 'Tech', course.level || 'Foundations', 'Problem Solving', 'Best Practices'];

            return (
              <div 
                key={course.courseId} 
                className={viewMode === 'list' ? 'list-course-card' : 'grid-course-card'}
              >
                {/* Column 1: Dark Thumbnail Card */}
                <div className="card-thumbnail-box">
                  <div className="thumb-top-row">
                    {isEnrolled ? (
                      <span className="thumb-badge enrolled">
                        <span className="thumb-dot" />
                        <span>Enrolled</span>
                      </span>
                    ) : (
                      <span className="thumb-badge category-tag">
                        <span>{course.category || 'Engineering'}</span>
                      </span>
                    )}
                  </div>

                  <div className="thumb-center-content">
                    <h4 className="thumb-course-title">{course.title}</h4>
                    <p className="thumb-course-sub">
                      {course.description ? course.description.slice(0, 65) + '...' : 'Build scalable applications with industry best practices.'}
                    </p>
                  </div>

                  <div className="thumb-illustration-mount">
                    <CourseThumbnailIllustration 
                      category={course.category} 
                      slug={course.slug} 
                      title={course.title} 
                    />
                  </div>
                </div>

                {/* Column 2: Middle Details Column */}
                <div className="card-content-col">
                  <div>
                    <div className="course-title-row">
                      <h3 
                        className="main-course-title" 
                        onClick={() => onStartCourse(course, isEnrolled ? 'CLASS' : 'OVERVIEW')}
                        title={`Open ${course.title}`}
                      >
                        {course.title}
                      </h3>
                      {course.domainTitle && (
                        <span className="domain-capsule-tag">{course.domainTitle}</span>
                      )}
                    </div>

                    <p className="course-desc-snippet">
                      {course.description || 'Comprehensive industry curriculum with video lectures, hands-on code examples, and dual 90% gated assessments.'}
                    </p>

                    {/* Metadata Specs Row */}
                    <div className="card-metadata-row">
                      <span className="meta-spec-item">
                        <FaBookOpen className="spec-icon" />
                        <strong>{totalModules}</strong> Modules
                      </span>
                      <span className="meta-spec-item">
                        <FaFileAlt className="spec-icon" />
                        <strong>{totalLessons}</strong> Lessons
                      </span>
                      <span className="meta-spec-item">
                        <FaClock className="spec-icon" />
                        <strong>{totalHours}</strong> Hours
                      </span>
                      <span className="meta-spec-item">
                        <FaUserTie className="spec-icon" />
                        {course.level || 'Intermediate to Advanced'}
                      </span>
                    </div>

                    {/* Skills Tags Row */}
                    <div className="skills-tags-row">
                      {skillsList.map((skill, sIdx) => (
                        <span key={sIdx} className="skill-tag-pill">{skill}</span>
                      ))}
                    </div>
                  </div>

                  {/* Social Proof Row */}
                  <div className="social-proof-row">
                    <span className="rating-badge">
                      <FaStar className="rating-star-icon" />
                      <span>{course.rating || 4.8}</span>
                      <span className="reviews-count-dim">({(course.reviewsCount || 3.2).toLocaleString()}K)</span>
                    </span>
                    <span className="social-divider">•</span>
                    <span className="enrolled-count-badge">
                      <FaGraduationCap />
                      <span>{(course.enrolledCount || 1074).toLocaleString()} enrolled</span>
                    </span>
                  </div>
                </div>

                {/* Column 3: Right Rewards & Action Buttons */}
                <div className="card-actions-col">
                  <div className="actions-top-bar">
                    <div className="rewards-box">
                      <h5 className="rewards-title">Course Rewards</h5>
                      <div className="rewards-list">
                        <div className="reward-item xp">
                          <FaBolt />
                          <span>+{rewards.totalXP || 300} XP</span>
                        </div>
                        <div className="reward-item credits">
                          <SeedCreditCoin size={14} />
                          <span>{rewards.totalCredits || 50} SEED Credits</span>
                        </div>
                        <div className="reward-item certificate">
                          <FaCheckCircle />
                          <span>Certificate on completion</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      className={`bookmark-btn ${isSaved ? 'saved' : ''}`}
                      onClick={(e) => toggleBookmark(course.courseId || course.slug, e)}
                      title={isSaved ? 'Remove Bookmark' : 'Save Bookmark'}
                    >
                      {isSaved ? <FaBookmark /> : <FaRegBookmark />}
                    </button>
                  </div>

                  {/* Buttons Row */}
                  <div className="card-button-row">
                    {isEnrolled ? (
                      <>
                        <button
                          className="btn-continue-learning"
                          onClick={() => onStartCourse(course, 'CLASS')}
                          title="Continue learning"
                        >
                          <FaPlay size={10} />
                          <span>Continue Learning</span>
                        </button>
                        <button
                          className="btn-unenroll-action"
                          onClick={() => setUnenrollCourseTarget(course)}
                          title="Unenroll from this course"
                        >
                          <FaTrashAlt size={11} />
                          <span>Unenroll</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-view-details"
                          onClick={() => onStartCourse(course, 'OVERVIEW')}
                          title="View course syllabus and details"
                        >
                          <FaPlay size={10} style={{ color: '#2563eb' }} />
                          <span>View Details</span>
                        </button>
                        <button
                          className="btn-enroll-action"
                          onClick={() => handleEnrollCourse(course)}
                          title="Enroll in this course"
                        >
                          <FaPlus size={10} />
                          <span>Enroll</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unenroll Confirmation Modal Warning Dialog */}
      {unenrollCourseTarget && (
        <div className="unenroll-confirm-overlay" onClick={() => !isUnenrolling && setUnenrollCourseTarget(null)}>
          <div className="unenroll-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-danger">
              <div className="danger-icon-circle">
                <FaTrashAlt />
              </div>
              <h3>Confirm Course Unenrollment</h3>
            </div>
            
            <p className="modal-body-text">
              Are you sure you want to unenroll from <strong>"{unenrollCourseTarget.title}"</strong>?
              <br /><br />
              <span className="danger-warning-note">
                <FaShieldAlt style={{ marginRight: '6px', color: '#ef4444' }} />
                Your tracked lesson progress, code submissions, and activity checkpoints for this course will be reset.
              </span>
            </p>

            <div className="modal-footer-actions">
              <button 
                type="button" 
                className="btn-cancel-modal" 
                onClick={() => setUnenrollCourseTarget(null)}
                disabled={isUnenrolling}
              >
                Keep Enrolled
              </button>
              <button 
                type="button" 
                className="btn-confirm-unenroll" 
                onClick={() => handleConfirmUnenroll(unenrollCourseTarget)}
                disabled={isUnenrolling}
              >
                {isUnenrolling ? 'Unenrolling...' : 'Yes, Unenroll'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseCatalog;
