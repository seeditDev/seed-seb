import React, { useState, useEffect, useMemo } from 'react';
import {
  FaSearch, FaBookOpen, FaCode, FaClock,
  FaCertificate, FaArrowRight, FaCheckCircle, FaGraduationCap,
  FaPlay, FaDatabase, FaServer, FaCogs, FaUserTie, FaLaptopCode,
  FaPlus, FaThLarge, FaListUl, FaBookmark, FaTimes, FaStar,
  FaLayerGroup, FaFileAlt, FaFire, FaChevronRight, FaLock,
  FaTrashAlt, FaExclamationTriangle, FaBolt
} from 'react-icons/fa';
import { COURSE_CATALOG } from '../data/courseCatalogData';
import { 
  fetchLiveCoursesFromFirestore, 
  syncAllCoursesToFirestore 
} from '../services/courseMetadataService';
import { 
  getEnrolledCourseIds, 
  fetchEnrolledCourseIds, 
  getCourseProgress, 
  enrollCourse,
  unenrollCourse
} from '../services/learningEngineService';
import { fetchUserEntitledCourseIds, checkCourseEntitlement } from '../services/courseEntitlementService';
import { toast } from 'sonner';
import SeedCreditCoin from '../../components/SeedCreditCoin';
import { calculateCourseRewards } from '../../utils/gamificationService';
import '../styles/CourseLearningPlayer.css';

const STATUS_TABS = [
  { id: 'ALL', label: 'All Courses', icon: FaThLarge, color: '#0d9488', bg: 'rgba(13, 148, 136, 0.12)' },
  { id: 'ENROLLED', label: 'Enrolled', icon: FaPlay, color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)' },
  { id: 'IN_PROGRESS', label: 'In Progress', icon: FaClock, color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  { id: 'COMPLETED', label: 'Completed', icon: FaCheckCircle, color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)' },
  { id: 'NOT_ENROLLED', label: 'Not Enrolled', icon: FaBookmark, color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)' }
];

const DOMAIN_CATEGORIES = [
  'All Domains',
  'DSA',
  'Programming',
  'Core CS',
  'Web Development',
  'Database',
  'Cloud & DevOps',
  'AI & ML',
  'Cybersecurity',
  'Data Science'
];

const POPULAR_SEARCHES = [
  'DSA',
  'Python',
  'Web Development',
  'Database',
  'System Design'
];

/**
 * Domain Vector Graphic Banner inside Course Card
 */
const CourseBannerGraphic = ({ category = '', slug = '', title = '', isPopular = false, badgeText = '', isEnrolled = false }) => {
  const c = (category + ' ' + slug + ' ' + title).toLowerCase();

  // Render domain-specific visual SVG vectors
  let visualGraphic = null;

  if (c.includes('dsa') || c.includes('algorithm')) {
    visualGraphic = (
      <svg className="banner-svg-graphic" viewBox="0 0 240 140" fill="none">
        {/* Tree / Graph Nodes */}
        <line x1="120" y1="30" x2="60" y2="80" stroke="#10b981" strokeWidth="2.5" strokeDasharray="4 2" />
        <line x1="120" y1="30" x2="180" y2="80" stroke="#10b981" strokeWidth="2.5" strokeDasharray="4 2" />
        <line x1="60" y1="80" x2="30" y2="120" stroke="#34d399" strokeWidth="2" />
        <line x1="60" y1="80" x2="90" y2="120" stroke="#34d399" strokeWidth="2" />
        <line x1="180" y1="80" x2="150" y2="120" stroke="#34d399" strokeWidth="2" />
        <line x1="180" y1="80" x2="210" y2="120" stroke="#34d399" strokeWidth="2" />

        {/* Nodes */}
        <circle cx="120" cy="30" r="16" fill="#047857" stroke="#34d399" strokeWidth="3" />
        <circle cx="60" cy="80" r="14" fill="#065f46" stroke="#10b981" strokeWidth="2.5" />
        <circle cx="180" cy="80" r="14" fill="#065f46" stroke="#10b981" strokeWidth="2.5" />
        <circle cx="30" cy="120" r="10" fill="#064e3b" stroke="#34d399" strokeWidth="2" />
        <circle cx="90" cy="120" r="10" fill="#064e3b" stroke="#34d399" strokeWidth="2" />
        <circle cx="150" cy="120" r="10" fill="#064e3b" stroke="#34d399" strokeWidth="2" />
        <circle cx="210" cy="120" r="10" fill="#064e3b" stroke="#34d399" strokeWidth="2" />

        {/* Code glyph */}
        <text x="120" y="35" fill="#ffffff" fontSize="13" fontWeight="800" textAnchor="middle">1</text>
        <text x="60" y="85" fill="#ffffff" fontSize="11" fontWeight="700" textAnchor="middle">2</text>
        <text x="180" y="85" fill="#ffffff" fontSize="11" fontWeight="700" textAnchor="middle">3</text>
      </svg>
    );
  } else if (c.includes('python') || c.includes('programming')) {
    visualGraphic = (
      <svg className="banner-svg-graphic" viewBox="0 0 240 140" fill="none">
        {/* Terminal Window */}
        <rect x="25" y="20" width="190" height="100" rx="10" fill="#0f172a" stroke="#3b82f6" strokeWidth="2" />
        <circle cx="45" cy="36" r="4" fill="#ef4444" />
        <circle cx="57" cy="36" r="4" fill="#f59e0b" />
        <circle cx="69" cy="36" r="4" fill="#10b981" />
        {/* Code lines */}
        <path d="M 45 60 L 60 70 L 45 80" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="75" y1="70" x2="160" y2="70" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
        <line x1="45" y1="95" x2="190" y2="95" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="45" y1="107" x2="130" y2="107" stroke="#bfdbfe" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
      </svg>
    );
  } else if (c.includes('web') || c.includes('react') || c.includes('frontend')) {
    visualGraphic = (
      <svg className="banner-svg-graphic" viewBox="0 0 240 140" fill="none">
        {/* Browser Mockup */}
        <rect x="20" y="15" width="200" height="110" rx="8" fill="#18181b" stroke="#6366f1" strokeWidth="2" />
        <rect x="20" y="15" width="200" height="24" rx="8" fill="#27272a" />
        <circle cx="35" cy="27" r="3.5" fill="#f43f5e" />
        <circle cx="47" cy="27" r="3.5" fill="#fbbf24" />
        <circle cx="59" cy="27" r="3.5" fill="#34d399" />
        <rect x="75" y="21" width="130" height="12" rx="4" fill="#3f3f46" />
        {/* React atom */}
        <ellipse cx="120" cy="78" rx="40" ry="16" stroke="#38bdf8" strokeWidth="1.8" />
        <ellipse cx="120" cy="78" rx="40" ry="16" stroke="#38bdf8" strokeWidth="1.8" transform="rotate(60 120 78)" />
        <ellipse cx="120" cy="78" rx="40" ry="16" stroke="#38bdf8" strokeWidth="1.8" transform="rotate(120 120 78)" />
        <circle cx="120" cy="78" r="6" fill="#38bdf8" />
      </svg>
    );
  } else if (c.includes('database') || c.includes('sql')) {
    visualGraphic = (
      <svg className="banner-svg-graphic" viewBox="0 0 240 140" fill="none">
        {/* Database Cylinders */}
        <g transform="translate(40, 15)">
          {/* Top cylinder */}
          <ellipse cx="80" cy="25" rx="55" ry="15" fill="#0369a1" stroke="#38bdf8" strokeWidth="2" />
          <path d="M 25 25 V 55 C 25 65, 135 65, 135 55 V 25" fill="#0284c7" stroke="#38bdf8" strokeWidth="2" />
          {/* Middle cylinder */}
          <path d="M 25 55 V 85 C 25 95, 135 95, 135 85 V 55" fill="#0369a1" stroke="#38bdf8" strokeWidth="2" />
          {/* Bottom cylinder */}
          <path d="M 25 85 V 110 C 25 120, 135 120, 135 110 V 85" fill="#075985" stroke="#38bdf8" strokeWidth="2" />
          {/* Binary rows */}
          <line x1="50" y1="40" x2="110" y2="40" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" />
          <line x1="50" y1="70" x2="110" y2="70" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" />
          <line x1="50" y1="100" x2="110" y2="100" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    );
  } else {
    // System Design / Core CS / Cloud
    visualGraphic = (
      <svg className="banner-svg-graphic" viewBox="0 0 240 140" fill="none">
        {/* Distributed Nodes */}
        <rect x="30" y="30" width="55" height="32" rx="6" fill="#4c1d95" stroke="#a78bfa" strokeWidth="2" />
        <rect x="155" y="30" width="55" height="32" rx="6" fill="#4c1d95" stroke="#a78bfa" strokeWidth="2" />
        <rect x="92" y="85" width="55" height="32" rx="6" fill="#5b21b6" stroke="#c4b5fd" strokeWidth="2" />

        <line x1="85" y1="46" x2="155" y2="46" stroke="#c4b5fd" strokeWidth="2" strokeDasharray="3 3" />
        <line x1="57" y1="62" x2="92" y2="100" stroke="#c4b5fd" strokeWidth="2" strokeDasharray="3 3" />
        <line x1="182" y1="62" x2="147" y2="100" stroke="#c4b5fd" strokeWidth="2" strokeDasharray="3 3" />

        <circle cx="120" cy="46" r="6" fill="#10b981" />
        <text x="57" y="50" fill="#ffffff" fontSize="9" fontWeight="700" textAnchor="middle">Node 1</text>
        <text x="182" y="50" fill="#ffffff" fontSize="9" fontWeight="700" textAnchor="middle">Node 2</text>
        <text x="120" y="105" fill="#ffffff" fontSize="9" fontWeight="700" textAnchor="middle">LB Cluster</text>
      </svg>
    );
  }

  const badge = badgeText || (isPopular ? 'Most Popular' : '');

  return (
    <div className="course-card-top-banner">
      <div className="banner-header-row">
        {isEnrolled ? (
          <span className="banner-enrolled-pill">
            <FaCheckCircle className="badge-enrolled-icon" />
            Enrolled
          </span>
        ) : badge ? (
          <span className="banner-badge-pill">
            <FaFire className="badge-fire-icon" />
            {badge}
          </span>
        ) : (
          <span className="banner-category-tag">{category}</span>
        )}
      </div>

      <div className="banner-main-content">
        <h3 className="banner-course-title">
          {c.includes('dsa') ? 'Data Structures & Algorithms' :
           c.includes('python') ? 'Python 3 Engineering' :
           c.includes('web') ? 'Full-Stack Web Development' :
           c.includes('database') ? 'Relational Databases & SQL' :
           c.includes('system') ? 'Distributed Systems' : title}
        </h3>
        <div className="banner-graphic-container">
          {visualGraphic}
        </div>
      </div>
    </div>
  );
};

const CourseCatalog = ({ onStartCourse, user, totalXP, seedCredits, userLevelInfo }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedDomain, setSelectedDomain] = useState('All Domains');
  const [sortBy, setSortBy] = useState('RECOMMENDED');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  const currentXP = totalXP ?? user?.totalXP ?? 0;
  const currentCredits = seedCredits ?? user?.seedCredits ?? 2450;
  const currentLevel = userLevelInfo?.level ?? user?.level ?? 1;
  const currentTitle = userLevelInfo?.levelTitle ?? 'Novice Coder';

  const uid = user?.uid || 'guest';
  const [courses, setCourses] = useState(() => COURSE_CATALOG.filter(c => c.enabled !== false));
  const [enrolledIds, setEnrolledIds] = useState(() => getEnrolledCourseIds(uid));
  const [entitledSet, setEntitledSet] = useState(null);
  const [progressMap, setProgressMap] = useState({});

  // Sync enrolled course IDs and fetch live real metadata from Firestore
  useEffect(() => {
    let isMounted = true;
    async function initCatalogAndProgress() {
      // 1. Sync all courses to Firestore in background (creates if missing, preserves reviews/enrollments)
      syncAllCoursesToFirestore(COURSE_CATALOG);

      // 2. Read and display real metadata from courses/ collection in Firestore
      const live = await fetchLiveCoursesFromFirestore(COURSE_CATALOG);
      const activeCourses = (live && live.length > 0) 
        ? live.filter(c => c.enabled !== false) 
        : COURSE_CATALOG.filter(c => c.enabled !== false);
      
      if (isMounted) setCourses(activeCourses);

      // 3. Load enrollments & progress
      const ids = await fetchEnrolledCourseIds(uid);
      if (isMounted) setEnrolledIds(ids);

      fetchUserEntitledCourseIds(user).then((entitled) => {
        if (isMounted) setEntitledSet(entitled);
      });

      const map = {};
      for (const course of activeCourses) {
        try {
          const prog = await getCourseProgress(uid, course);
          if (prog) {
            map[course.courseId] = prog;
          }
        } catch (_) {}
      }
      if (isMounted) setProgressMap(map);
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
    await enrollCourse(uid, course.courseId);
    setEnrolledIds(prev => Array.from(new Set([...prev, course.courseId])));
    toast.success(`Successfully enrolled in "${course.title}"!`);
  };

  const handlePromptUnenroll = (course) => {
    setUnenrollCourseTarget(course);
  };

  const handleConfirmUnenroll = async (course) => {
    if (!course) return;
    setIsUnenrolling(true);
    try {
      await unenrollCourse(uid, course.courseId);
      setEnrolledIds(prev => prev.filter(id => id !== course.courseId));
      setProgressMap(prev => {
        const next = { ...prev };
        delete next[course.courseId];
        return next;
      });
      setUnenrollCourseTarget(null);
      toast.info(`You have unenrolled from "${course.title}". Course progress has been reset.`);
    } catch (err) {
      toast.error('Failed to unenroll: ' + err.message);
    } finally {
      setIsUnenrolling(false);
    }
  };

  const handleStartCourse = (course) => {
    onStartCourse(course);
  };

  // Status Counts for 5 Metric Cards
  const statusCounts = useMemo(() => {
    let enrolled = 0;
    let inProgress = 0;
    let completed = 0;
    let notEnrolled = 0;

    courses.forEach(course => {
      if (!course) return;
      const isE = enrolledIds.includes(course.courseId);
      const prog = progressMap[course.courseId];
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

      const isEnrolled = enrolledIds.includes(course.courseId);
      const prog = progressMap[course.courseId];
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
        const d = String(selectedDomain || '').toLowerCase();
        matchesDomain = category.includes(d) ||
          slug.includes(d) ||
          (d === 'dsa' && (category.includes('computer') || slug.includes('dsa')));
      }

      return matchesSearch && matchesStatus && matchesDomain;
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
  }, [courses, searchQuery, selectedStatus, selectedDomain, sortBy, enrolledIds, progressMap]);

  return (
    <div className="course-catalog-container">
      {/* 1. Hero Section matching user mockup */}
      <div className="catalog-hero-card">
        <div className="catalog-hero-split">
          {/* Left Column: Title, Subtitle, Status Metric Cards */}
          <div className="hero-left-column">
            {/* Gamification Strip: Level, XP, Credits */}
            <div className="catalog-gamification-strip" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#10b981',
                fontSize: '12px',
                fontWeight: '700'
              }}>
                <FaGraduationCap size={13} />
                Level {currentLevel} • {currentTitle}
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '999px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                fontSize: '12px',
                fontWeight: '700'
              }}>
                <FaStar size={12} />
                {currentXP.toLocaleString()} XP
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '999px',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                color: '#f59e0b',
                fontSize: '12px',
                fontWeight: '700'
              }}>
                <SeedCreditCoin size={15} />
                {currentCredits.toLocaleString()} SEED Credits
              </span>
            </div>

            <h1 className="catalog-title">Explore Courses &amp; Learning Paths</h1>
            <p className="catalog-subtitle">
              Structured curriculum with instructor videos, structured reading, code examples, practice questions, and dual 90% gated assessments.
            </p>

            {/* 5 Status Metric Filter Cards */}
            <div className="status-metrics-row">
              {STATUS_TABS.map(tab => {
                const IconComponent = tab.icon;
                const count = statusCounts[tab.id] ?? 0;
                const isSelected = selectedStatus === tab.id;

                return (
                  <div
                    key={tab.id}
                    className={`status-metric-card ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedStatus(tab.id)}
                    title={`Filter by ${tab.label}`}
                  >
                    <div className="metric-icon-box" style={{ background: tab.bg, color: tab.color }}>
                      <IconComponent />
                    </div>
                    <div className="metric-data-col">
                      <span className="metric-count-number">{count}</span>
                      <span className="metric-label-text">{tab.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Search Box, Popular Searches, and Sprout Illustration */}
          <div className="hero-right-column">
            <div className="hero-search-wrapper">
              <div className="catalog-search-box">
                <FaSearch className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search courses, modules, topics, skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="search-clear-btn" onClick={() => setSearchQuery('')} title="Clear search">
                    <FaTimes />
                  </button>
                )}
              </div>

              {/* Popular Searches Clickable Chips */}
              <div className="popular-searches-row">
                <span className="popular-label">Popular searches:</span>
                <div className="popular-tags-list">
                  {POPULAR_SEARCHES.map(tag => (
                    <button
                      key={tag}
                      className={`popular-tag-chip ${(searchQuery || '').toLowerCase() === String(tag || '').toLowerCase() ? 'active' : ''}`}
                      onClick={() => setSearchQuery(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* "Learn Practice Grow" Illustration Box */}
            <div className="hero-sprout-art-box">
              <div className="sprout-books-graphic">
                <svg viewBox="0 0 120 100" fill="none" className="books-svg">
                  {/* Sprouting green plant leaf */}
                  <path d="M 85 45 C 90 25, 80 10, 65 15 C 65 25, 75 40, 85 45 Z" fill="#10b981" />
                  <path d="M 85 45 C 98 40, 108 25, 102 12 C 90 12, 85 30, 85 45 Z" fill="#34d399" />
                  <line x1="85" y1="45" x2="85" y2="60" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Top Book (Teal) */}
                  <rect x="25" y="45" width="70" height="12" rx="3" fill="#059669" />
                  <rect x="30" y="47" width="60" height="2" fill="#34d399" opacity="0.6" />

                  {/* Middle Book (Cyan/Green) */}
                  <rect x="20" y="60" width="78" height="13" rx="3" fill="#0d9488" />
                  <rect x="26" y="62" width="68" height="2" fill="#5eead4" opacity="0.6" />

                  {/* Bottom Book (Deep Blue/Teal) */}
                  <rect x="15" y="76" width="86" height="15" rx="3" fill="#0f766e" />
                  <rect x="22" y="78" width="75" height="2" fill="#2dd4bf" opacity="0.6" />
                </svg>
              </div>
              <div className="sprout-words-col">
                <span className="sprout-word learn">Learn</span>
                <span className="sprout-word practice">Practice</span>
                <span className="sprout-word grow">Grow</span>
                <div className="sprout-underline-bar" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Domain Filter Pills & Sort Bar */}
      <div className="domain-filters-toolbar">
        <div className="domain-pills-scroll">
          {DOMAIN_CATEGORIES.map(domain => (
            <button
              key={domain}
              className={`domain-pill-btn ${selectedDomain === domain ? 'active' : ''}`}
              onClick={() => setSelectedDomain(domain)}
            >
              {domain}
            </button>
          ))}
        </div>

        <div className="catalog-sort-group">
          <span className="sort-label">Sort by</span>
          <select 
            className="catalog-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="RECOMMENDED">Recommended</option>
            <option value="POPULAR">Most Popular</option>
            <option value="RATING">Highest Rated</option>
            <option value="MODULES">Most Modules</option>
          </select>
        </div>
      </div>

      {/* 3. Section Main Header & Grid/List View Switcher */}
      <div className="catalog-courses-section">
        <div className="catalog-section-header-row">
          <div className="section-title-col">
            <h2 className="section-main-heading">
              {selectedStatus === 'ENROLLED' ? 'My Enrolled Courses' :
               selectedStatus === 'IN_PROGRESS' ? 'Courses In Progress' :
               selectedStatus === 'COMPLETED' ? 'Completed Courses' :
               selectedStatus === 'NOT_ENROLLED' ? 'Available to Enroll' :
               'Recommended Technical Courses'}
            </h2>
            <p className="section-desc-hint">Courses curated for your learning journey</p>
          </div>

          <div className="section-controls-right">
            <span className="courses-count-pill">{filteredCourses.length} {filteredCourses.length === 1 ? 'Course' : 'Courses'}</span>
            
            <div className="view-mode-toggle-group">
              <button 
                className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <FaThLarge />
                <span>Grid</span>
              </button>
              <button 
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List View"
              >
                <FaListUl />
                <span>List</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4. Course Cards (Grid or List View) */}
        {filteredCourses.length === 0 ? (
          <div className="catalog-empty-state">
            <FaBookOpen className="empty-state-icon" />
            <h3 className="empty-state-title">No Courses Found</h3>
            <p className="empty-state-text">
              {selectedStatus === 'ENROLLED' ? 'You have not enrolled in any courses yet. Switch to "All Courses" and enroll to get started.' :
               selectedStatus === 'IN_PROGRESS' ? 'No active courses currently in progress.' :
               selectedStatus === 'COMPLETED' ? 'No completed courses yet. Finish all modules and 90% gated MSAs to earn your certificate!' :
               `No courses found matching "${searchQuery}". Try selecting a different domain or clearing your search.`}
            </p>
            <button 
              className="empty-state-reset-btn"
              onClick={() => {
                setSearchQuery('');
                setSelectedStatus('ALL');
                setSelectedDomain('All Domains');
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'catalog-cards-grid' : 'catalog-cards-list'}>
            {filteredCourses.map(course => {
              const isEnrolled = enrolledIds.includes(course.courseId);
              const courseProg = progressMap[course.courseId];
              const coursePct = courseProg?.percentage || 0;
              const isCompleted = coursePct >= 100;
              const isInProgress = isEnrolled && coursePct > 0 && !isCompleted;
              const entitlement = checkCourseEntitlement(course, user, entitledSet);
              const ent = entitlement;
              const isLocked = entitlement.isLocked;

              const totalModules = course.modules?.length || course.modulesCount || 3;
              const totalLessons = course.lessonsCount || course.modules?.reduce((acc, m) => acc + (m.topics?.length || 0), 0) || 8;
              const totalHours = course.estimatedHours || Math.round((course.modules?.reduce((acc, m) => acc + (m.estimatedMinutes || 60), 0) || 180) / 60 * 10) / 10 || 3.5;

              let primaryButtonLabel = 'Start Learning';
              let primaryButtonIcon = <FaPlay />;

              if (!isEnrolled) {
                if (ent.isLocked) {
                  primaryButtonLabel = 'Locked';
                  primaryButtonIcon = <FaLock />;
                } else {
                  primaryButtonLabel = 'Enroll in Course';
                  primaryButtonIcon = <FaPlus />;
                }
              } else if (isCompleted) {
                primaryButtonLabel = 'Review Course';
                primaryButtonIcon = <FaCheckCircle />;
              } else if (isInProgress) {
                primaryButtonLabel = `Resume (${coursePct}%)`;
                primaryButtonIcon = <FaArrowRight />;
              } else {
                primaryButtonLabel = 'Start Learning';
                primaryButtonIcon = <FaPlay />;
              }

              return (
                <div key={course.courseId} className={`mockup-course-card ${ent.isLocked && !isEnrolled ? 'course-locked-border' : ''}`}>
                  {/* Top Dark Gradient Vector Banner */}
                  <CourseBannerGraphic 
                    category={course.category} 
                    slug={course.slug} 
                    title={course.title}
                    isPopular={course.isPopular}
                    badgeText={ent.isLocked && !isEnrolled ? ent.badge : course.badgeText}
                    isEnrolled={isEnrolled}
                  />

                  {/* Card Main Body */}
                  <div className="mockup-card-body">
                    <h3 className="mockup-course-title clickable" onClick={() => onStartCourse(course)} title="Click to view course details">
                      {course.title}
                    </h3>

                    <p className="mockup-course-desc">
                      {course.description}
                    </p>

                    {/* Metadata Row matching user mockup */}
                    <div className="mockup-metadata-row">
                      <span className="meta-item">
                        <FaBookOpen className="meta-icon" />
                        <strong>{totalModules}</strong> Modules
                      </span>
                      <span className="meta-divider">•</span>
                      <span className="meta-item">
                        <FaFileAlt className="meta-icon" />
                        <strong>{totalLessons}</strong> Lessons
                      </span>
                      <span className="meta-divider">•</span>
                      <span className="meta-item">
                        <FaClock className="meta-icon" />
                        <strong>{totalHours}</strong> Hours
                      </span>
                      <span className="meta-divider">•</span>
                      <span className="meta-item">
                        <FaUserTie className="meta-icon" />
                        {course.level || 'Intermediate'}
                      </span>
                    </div>

                    {/* Course Reward (300-500 XP and Seed Credits based on hours & modules) */}
                    {(() => {
                      const rewards = calculateCourseRewards(course);
                      return (
                        <div className="course-card-rewards-row">
                          <div className="cc-rewards-left">
                            <span className="cc-rewards-label">Course Reward:</span>
                          </div>
                          <div className="cc-rewards-pills">
                            <span className="cc-reward-badge xp" title="Earn XP towards higher levels">
                              <FaBolt className="badge-icon" /> +{rewards.totalXP} XP
                            </span>
                            <span className="cc-reward-badge sc" title="Earn SEED Credits">
                              <SeedCreditCoin /> +{rewards.totalCredits}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Live Firestore Social Proof (Rating & Enrollments) and Status Pill */}
                    <div className="mockup-live-meta-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', margin: '4px 0 12px 0', fontSize: '13px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: 600 }}>
                          <FaStar style={{ fontSize: '12px' }} />
                          <span>{course.rating || 4.9}</span>
                          <span style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 400, fontSize: '12px' }}>
                            ({course.reviewsCount || course.reviews?.length || 3})
                          </span>
                        </span>
                        <span style={{ color: 'var(--border-color, #cbd5e1)' }}>•</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--primary, #0d9488)', fontWeight: 600 }}>
                          <FaGraduationCap style={{ fontSize: '13px' }} />
                          <span>{(course.enrolledCount || 1000).toLocaleString()} enrolled</span>
                        </span>
                      </div>

                      {isLocked ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: 'rgba(239, 68, 68, 0.12)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.25)'
                        }}>
                          <FaLock style={{ fontSize: '10px' }} />
                          <span>{entitlement.badge || 'Cohort Restricted'}</span>
                        </span>
                      ) : isEnrolled ? (
                        <span className="card-enrolled-status-pill">
                          <FaCheckCircle style={{ fontSize: '11px' }} />
                          <span>Enrolled</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Progress Bar (when enrolled & in progress) */}
                    {isInProgress && (
                      <div className="mockup-progress-wrap">
                        <div className="progress-info-row">
                          <span className="prog-text">Progress</span>
                          <span className="prog-pct">{coursePct}%</span>
                        </div>
                        <div className="prog-track">
                          <div className="prog-fill" style={{ width: `${coursePct}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Details / Continue Learning & Unenroll Action Buttons */}
                    {isEnrolled ? (
                      <div className="mockup-actions-row enrolled-actions">
                        <button 
                          className="mockup-continue-btn"
                          onClick={() => {
                            if (isLocked) {
                              toast.error(entitlement.reason, { duration: 6000 });
                              return;
                            }
                            onStartCourse(course, 'CLASS');
                          }}
                          title={isLocked ? entitlement.reason : `Continue learning ${course.title}`}
                        >
                          {isLocked ? <FaLock style={{ fontSize: '10px' }} /> : <FaPlay style={{ fontSize: '10px' }} />}
                          <span>{isLocked ? 'Restricted' : 'Continue Learning'}</span>
                        </button>
                        <button
                          type="button"
                          className="mockup-unenroll-btn"
                          onClick={() => handlePromptUnenroll(course)}
                          disabled={isUnenrolling}
                          title="Unenroll from this course"
                        >
                          <FaTrashAlt style={{ fontSize: '10px' }} />
                          <span>Unenroll</span>
                        </button>
                      </div>
                    ) : (
                      <div className="mockup-actions-row single-action">
                        <button 
                          className={`mockup-details-btn ${ent.isLocked ? 'locked' : ''}`}
                          onClick={() => onStartCourse(course, 'OVERVIEW')}
                          title={ent.isLocked ? `Course locked: ${ent.reason}` : `View details and curriculum for ${course.title}`}
                          style={ent.isLocked ? { borderColor: 'rgba(239, 68, 68, 0.4)', color: '#94a3b8' } : {}}
                        >
                          {ent.isLocked && <FaLock style={{ fontSize: '11px', color: '#f59e0b' }} />}
                          <span>{ent.isLocked ? 'Locked (Tenant Restricted)' : 'Details'}</span>
                          <FaArrowRight style={{ fontSize: '11px' }} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Centered Motivational Quote Footer matching mockup */}
      <footer className="catalog-inspirational-footer">
        <p className="quote-text">"Better developers build a better tomorrow."</p>
        <span className="quote-author">— SEED SEB</span>
      </footer>

      {/* Unenroll Confirmation Modal Warning Dialog */}
      {unenrollCourseTarget && (
        <div className="unenroll-confirm-overlay" onClick={() => !isUnenrolling && setUnenrollCourseTarget(null)}>
          <div className="unenroll-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="unenroll-modal-header">
              <div className="unenroll-warning-icon-badge">
                <FaExclamationTriangle />
              </div>
              <div>
                <h3 className="unenroll-modal-title">Unenroll from Course?</h3>
                <p className="unenroll-modal-course-name">{unenrollCourseTarget.title}</p>
              </div>
            </div>

            <div className="unenroll-modal-body">
              <div className="unenroll-danger-alert">
                <strong><FaExclamationTriangle style={{ color: '#ef4444', marginRight: '6px' }} /> Warning: Loss of Course Progress!</strong>
                <p>
                  Unenrolling will permanently reset all your completed lesson checkpoints, interactive practice code solutions, and assessment attempt records for this course.
                </p>
              </div>
              <p className="unenroll-reassure-text">
                You can re-enroll at any time, but your progress will restart from the beginning.
              </p>
            </div>

            <div className="unenroll-modal-footer">
              <button 
                type="button"
                className="unenroll-cancel-btn" 
                onClick={() => setUnenrollCourseTarget(null)}
                disabled={isUnenrolling}
              >
                Keep Learning
              </button>
              <button 
                type="button"
                className="unenroll-confirm-btn" 
                onClick={() => handleConfirmUnenroll(unenrollCourseTarget)}
                disabled={isUnenrolling}
              >
                {isUnenrolling ? 'Unenrolling...' : 'Yes, Unenroll & Reset Progress'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseCatalog;
