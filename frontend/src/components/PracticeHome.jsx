import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchQuestionsIndex } from '../services/codingQuestionBankService';
import { getSolvedQuestionIds, getFullProgress, syncProgressWithFirebase, getQuestionDisplayStatus } from '../services/codingProgressService';
import DataService from '../services/dataService';
import { 
  FaSearch, FaSync, FaLock, FaCheckCircle, FaExclamationTriangle, 
  FaHourglassHalf, FaFolder, FaFolderOpen, FaFileAlt, FaBookOpen, 
  FaAngleRight, FaAngleDown, FaListUl, FaChevronLeft 
} from 'react-icons/fa';
import '../styles/PracticeHome.css';

const CATEGORIES = [
  'Arrays', 'Strings', 'Sorting', 'Searching', 'Recursion',
  'Dynamic Programming', 'Graphs', 'Trees', 'Linked List',
  'Stack', 'Queue', 'Greedy', 'Math', 'Bit Manipulation',
];

const DIFFICULTIES = ['Beginner', 'Easy', 'Medium', 'Hard'];

const STATUS_ICONS = {
  SOLVED: '✅',
  ATTEMPTED: '🟡',
  UNSOLVED: '○',
  LOCKED: '🔒',
};

const slugify = (value = '') => {
  if (!value) return 'test';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'test';
};

const PracticeHome = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('paths'); // 'paths' or 'bank'
  const [questions, setQuestions] = useState([]);
  const [solvedIds, setSolvedIds] = useState([]);
  const [problemDetails, setProblemDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState({ text: '', type: '' });
  const [user, setUser] = useState(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  // Filters for Flat Question Bank
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  // Structured Learning Paths State
  const [courses, setCourses] = useState([]);
  const [allowedModuleIds, setAllowedModuleIds] = useState([]);
  const [expandedCourses, setExpandedCourses] = useState({});
  const [expandedSubcourses, setExpandedSubcourses] = useState({});

  // Contest View State (When clicking a Coding Module)
  const [selectedModule, setSelectedModule] = useState(null);
  const [contestQuestions, setContestQuestions] = useState([]);
  const [contestLoading, setContestLoading] = useState(false);

  useEffect(() => {
    const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
    setUser(authData);
    loadData(authData);
  }, []);

  const loadData = async (authData) => {
    setLoading(true);
    try {
      const email = authData?.Email || authData?.email || '';
      
      // Auto sync with cloud at start
      if (email && navigator.onLine) {
        await syncProgressWithFirebase(email);
      }

      // Fetch Question Bank, Progress, and Access Control config
      const [indexQs, progress, accessControl] = await Promise.all([
        fetchQuestionsIndex().catch(() => []),
        getFullProgress(email).catch(() => ({ solvedProblems: [], problemDetails: {} })),
        DataService.getAccessControl().catch(() => null),
      ]);

      setQuestions(indexQs);
      setSolvedIds(progress.solvedProblems || []);
      setProblemDetails(progress.problemDetails || {});

      if (accessControl && authData) {
        const departmentAccess = accessControl?.access_control?.colleges?.[authData.College]?.[authData.Year]?.[authData.Department];
        const allowedIds = departmentAccess?.allowed_modules || [];
        setAllowedModuleIds(allowedIds);

        // Process courses from access_control.json
        const coursesList = [];
        const rawCourses = accessControl.courses || {};

        Object.entries(rawCourses).forEach(([courseId, course]) => {
          // Skip assessments and mcqs folders as they belong in the Exams tab
          if (courseId === 'assessments' || courseId === 'mcqs') return;

          const processedCourse = {
            id: courseId,
            title: course.title,
            display_order: course.display_order || 1,
            hasSubcourses: !!course.subcourses,
            subcourses: [],
            modules: [],
          };

          if (course.subcourses) {
            // Group modules inside subcourses
            Object.entries(course.subcourses).forEach(([subId, sub]) => {
              const subModules = [];
              Object.entries(sub.modules || {}).forEach(([modKey, mod]) => {
                if (allowedIds.includes(mod.id)) {
                  subModules.push({
                    key: modKey,
                    ...mod,
                    slug: mod.slug || slugify(mod.name || modKey),
                  });
                }
              });

              if (subModules.length > 0) {
                subModules.sort((a, b) => (a.display_order || 1) - (b.display_order || 1));
                processedCourse.subcourses.push({
                  id: subId,
                  title: sub.title,
                  display_order: sub.display_order || 1,
                  modules: subModules,
                });
              }
            });

            processedCourse.subcourses.sort((a, b) => a.display_order - b.display_order);
          } else if (course.modules) {
            // Direct modules
            Object.entries(course.modules).forEach(([modKey, mod]) => {
              if (allowedIds.includes(mod.id)) {
                processedCourse.modules.push({
                  key: modKey,
                  ...mod,
                  slug: mod.slug || slugify(mod.name || modKey),
                });
              }
            });

            processedCourse.modules.sort((a, b) => (a.display_order || 1) - (b.display_order || 1));
          }

          // Keep course only if it contains allowed subcourses or direct modules
          if (processedCourse.subcourses.length > 0 || processedCourse.modules.length > 0) {
            coursesList.push(processedCourse);
          }
        });

        coursesList.sort((a, b) => a.display_order - b.display_order);
        setCourses(coursesList);
        
        // Auto-expand first course
        if (coursesList.length > 0) {
          setExpandedCourses({ [coursesList[0].id]: true });
        }
      }
    } catch (err) {
      console.error('[PracticeHome] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    const email = user?.Email || user?.email || '';
    if (!email) return;
    setSyncing(true);
    setSyncMsg({ text: 'Syncing with cloud...', type: 'info' });
    try {
      const res = await syncProgressWithFirebase(email);
      if (res.success) {
        setSolvedIds(res.progress.solvedProblems || []);
        setProblemDetails(res.progress.problemDetails || {});
        setSyncMsg({ text: 'Progress synced successfully!', type: 'success' });
      } else {
        setSyncMsg({ text: res.error || 'Sync failed.', type: 'error' });
      }
    } catch (err) {
      setSyncMsg({ text: err.message || 'Sync failed.', type: 'error' });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg({ text: '', type: '' }), 3000);
    }
  };

  const isPremiumUser = user?.Premium === true || user?.Premium === 'true' || user?.Premium === 1 || user?.Premium === 'Yes' || !!user?.isPremium;

  const handleQuestionClick = (q, status) => {
    if (status === 'LOCKED') {
      setShowPremiumModal(true);
      return;
    }
    navigate(`/student/practice/solve/${q.questionId}`, {
      state: { scoringType: q.scoringType || 'PARTIAL_SCORE' }
    });
  };

  // Launch a course module (mcq, coding, or mixed)
  const handleModuleClick = async (mod) => {
    if (mod.isPremium && !isPremiumUser) {
      setShowPremiumModal(true);
      return;
    }

    if (mod.type === 'mcq') {
      // Redirect to MCQ page in practice mode
      navigate(`/student/mcq/${mod.slug}`, { state: { isPractice: true } });
    } else {
      // It is a coding module: Load contest questions list from mod.url
      setSelectedModule(mod);
      setContestLoading(true);
      try {
        let finalUrl = mod.url || '';
        // If it starts with standard relative, map it to local or fetch from URL
        if (!finalUrl.endsWith('.json')) {
          finalUrl = `/seed-contents/coding/${mod.slug}.json`;
        }
        
        // Fetch contest details
        const response = await fetch(finalUrl);
        if (!response.ok) throw new Error('Contest URL not found');
        const data = await response.json();
        
        // Mapped questions array from the contest file
        setContestQuestions(data.questions || []);
      } catch (err) {
        console.error('Failed to load contest questions:', err);
        alert('Could not fetch questions list for this practice module.');
        setSelectedModule(null);
      } finally {
        setContestLoading(false);
      }
    }
  };

  const toggleCourseExpand = (cId) => {
    setExpandedCourses(prev => ({ ...prev, [cId]: !prev[cId] }));
  };

  const toggleSubcourseExpand = (sId) => {
    setExpandedSubcourses(prev => ({ ...prev, [sId]: !prev[sId] }));
  };

  // Filter flat list of questions
  const filteredQuestions = questions.filter(q => {
    const status = getQuestionDisplayStatus(q.questionId, solvedIds, problemDetails, q.isPremium, isPremiumUser);
    const matchesSearch = !searchQuery || 
      q.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      q.questionId?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || q.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'All' || q.difficulty === selectedDifficulty;
    const matchesStatus = selectedStatus === 'All' || status === selectedStatus;
    return matchesSearch && matchesCategory && matchesDifficulty && matchesStatus;
  });

  return (
    <div className="ph-root">
      {/* Sub navigation bar */}
      <div className="ph-topbar" style={{ background: 'transparent', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', padding: '12px 0px', marginBottom: '20px', position: 'static' }}>
        <div className="ph-topbar-nav" style={{ width: '100%', justifyContent: 'flex-start' }}>
          <button 
            className={`ph-topbar-btn ${activeTab === 'paths' && !selectedModule ? 'active' : ''}`}
            onClick={() => { setSelectedModule(null); setActiveTab('paths'); }}
            style={{ borderRadius: '8px' }}
          >
            📂 Structured Paths
          </button>
          <button 
            className={`ph-topbar-btn ${activeTab === 'bank' && !selectedModule ? 'active' : ''}`}
            onClick={() => { setSelectedModule(null); setActiveTab('bank'); }}
            style={{ borderRadius: '8px' }}
          >
            🎯 Problems
          </button>
        </div>
      </div>

      {/* Sync Message Alert */}
      {syncMsg.text && (
        <div style={{
          padding: '10px',
          textAlign: 'center',
          backgroundColor: syncMsg.type === 'success' ? '#1b5e20' : syncMsg.type === 'error' ? '#b71c1c' : '#0d47a1',
          color: 'white',
          fontSize: '14px',
          fontWeight: 600
        }}>
          {syncMsg.text}
        </div>
      )}

      {/* Main Panel Content */}
      {selectedModule ? (
        // ─── CONTEST QUESTION LIST VIEW ───
        <div className="ph-section" style={{ maxWidth: '1000px', margin: '30px auto' }}>
          <button 
            onClick={() => setSelectedModule(null)}
            style={{
              background: 'none', border: 'none', color: '#7c6bff', fontSize: '15px',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              marginBottom: '20px'
            }}
          >
            <FaChevronLeft /> Back to Learning Paths
          </button>
          <h2 style={{ fontSize: '24px', color: 'white', marginBottom: '8px' }}>
            {selectedModule.name}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '24px' }}>
            Choose a problem below to solve inside the sandboxed code IDE.
          </p>

          {contestLoading ? (
            <div className="ph-loading">
              <div className="ph-spinner" />
              <p>Loading module questions...</p>
            </div>
          ) : contestQuestions.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>No questions configured in this module.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {contestQuestions.map((q, idx) => {
                const isPremiumQ = !!q.isPremium;
                const status = getQuestionDisplayStatus(q.id, solvedIds, problemDetails, isPremiumQ, isPremiumUser);
                const bestScore = problemDetails[q.id]?.bestScore;

                return (
                  <div
                    key={q.id}
                    onClick={() => handleQuestionClick({ questionId: q.id, scoringType: q.scoringType }, status)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px',
                      background: '#1c1e33', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
                      cursor: status === 'LOCKED' ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
                    }}
                    className="q-list-row-hover"
                  >
                    <div style={{ fontSize: '13px', color: '#94a3b8', width: '28px', textAlign: 'center' }}>
                      {idx + 1}
                    </div>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: status === 'SOLVED' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.06)',
                      color: status === 'SOLVED' ? '#4ade80' : '#94a3b8'
                    }}>
                      {STATUS_ICONS[status] || '○'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'white' }}>
                        {q.title}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <span style={{ background: 'rgba(255,255,255,0.05)', color: '#38bdf8', fontSize: '11px', padding: '2px 8px', borderRadius: '100px' }}>
                          {q.difficulty || 'Easy'}
                        </span>
                        {isPremiumQ && (
                          <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: '11px', padding: '2px 8px', borderRadius: '100px', fontWeight: 600 }}>
                            ⭐ Premium
                          </span>
                        )}
                        {bestScore !== undefined && (
                          <span style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', fontSize: '11px', padding: '2px 8px', borderRadius: '100px' }}>
                            Score: {bestScore}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '18px' }}>
                      {status === 'LOCKED' ? '🔒' : '›'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'paths' ? (
        // ─── STRUCTURED LEARNING PATHS VIEW ───
        <div className="ph-section" style={{ maxWidth: '1000px', margin: '30px auto' }}>
          <div className="ph-hero" style={{ padding: '20px 0' }}>
            <div className="ph-hero-tag"><span>📂</span> Learning Paths</div>
            <h1 className="ph-hero-title">Continuous <span>Curriculum</span></h1>
            <p className="ph-hero-sub">Work through structural programming courses assigned by your facilitators.</p>
          </div>

          {loading ? (
            <div className="ph-loading">
              <div className="ph-spinner" />
              <p>Loading course pathways...</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="ph-empty">
              <div className="ph-empty-icon">📂</div>
              <div className="ph-empty-title">No assigned courses found</div>
              <div className="ph-empty-desc">Your department hasn't mapped any learning courses to your current profile yet.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {courses.map(course => (
                <div 
                  key={course.id} 
                  style={{
                    background: '#16172b', border: '1px solid rgba(255,255,255,0.06)', 
                    borderRadius: '12px', overflow: 'hidden'
                  }}
                >
                  {/* Course Header */}
                  <div 
                    onClick={() => toggleCourseExpand(course.id)}
                    style={{
                      padding: '16px 20px', display: 'flex', alignItems: 'center', 
                      justifyContent: 'space-between', cursor: 'pointer', background: 'rgba(255,255,255,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '20px' }}>{expandedCourses[course.id] ? '📂' : '📁'}</span>
                      <span style={{ fontSize: '17px', fontWeight: 700, color: 'white' }}>{course.title}</span>
                    </div>
                    {expandedCourses[course.id] ? <FaAngleDown style={{ color: '#94a3b8' }} /> : <FaAngleRight style={{ color: '#94a3b8' }} />}
                  </div>

                  {/* Course Sub-folders / Modules */}
                  {expandedCourses[course.id] && (
                    <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      {course.hasSubcourses ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {course.subcourses.map(sub => (
                            <div key={sub.id} style={{ borderLeft: '2px solid rgba(124,107,255,0.3)', paddingLeft: '14px' }}>
                              <div 
                                onClick={() => toggleSubcourseExpand(sub.id)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '8px', 
                                  cursor: 'pointer', padding: '6px 0', color: '#e2e8f0', fontWeight: 600
                                }}
                              >
                                {expandedSubcourses[sub.id] ? <FaAngleDown /> : <FaAngleRight />}
                                <span>{sub.title}</span>
                              </div>
                              
                              {expandedSubcourses[sub.id] && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                  {sub.modules.map(mod => (
                                    <div 
                                      key={mod.id} 
                                      onClick={() => handleModuleClick(mod)}
                                      style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '12px 16px', background: '#1c1e33', borderRadius: '8px',
                                        cursor: 'pointer', transition: '0.2s', border: '1px solid rgba(255,255,255,0.04)'
                                      }}
                                      className="q-list-row-hover"
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <FaFileAlt style={{ color: mod.type === 'mcq' ? '#ff6b9d' : '#7c6bff' }} />
                                        <span style={{ fontSize: '14px', color: '#f1f5f9' }}>{mod.name}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Chip label={mod.type.toUpperCase()} size="small" style={{ fontSize: '10px' }} />
                                        {mod.isPremium && <span>⭐</span>}
                                        <span style={{ color: '#94a3b8' }}>›</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {course.modules.map(mod => (
                            <div 
                              key={mod.id} 
                              onClick={() => handleModuleClick(mod)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 16px', background: '#1c1e33', borderRadius: '8px',
                                cursor: 'pointer', transition: '0.2s', border: '1px solid rgba(255,255,255,0.04)'
                              }}
                              className="q-list-row-hover"
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FaFileAlt style={{ color: mod.type === 'mcq' ? '#ff6b9d' : '#7c6bff' }} />
                                <span style={{ fontSize: '14px', color: '#f1f5f9' }}>{mod.name}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Chip label={mod.type.toUpperCase()} size="small" style={{ fontSize: '10px' }} />
                                {mod.isPremium && <span>⭐</span>}
                                <span style={{ color: '#94a3b8' }}>›</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // ─── FLAT PROBLEMS TABLE VIEW (LeetCode-style) ───
        <div className="ph-problems-layout">

          {/* Left Content Area */}
          <div className="ph-problems-main">

            {/* Topic Filter Chips */}
            <div className="ph-topic-chips">
              <button
                className={`ph-topic-chip ${selectedCategory === 'All' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('All')}
              >
                🎯 All Topics
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  className={`ph-topic-chip ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Filter Bar */}
            <div className="ph-problems-filterbar">
              {/* Search Box */}
              <div className="ph-problems-search-wrap">
                <FaSearch className="ph-problems-search-icon" />
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="ph-problems-search"
                />
              </div>

              {/* Difficulty Filter */}
              <select
                value={selectedDifficulty}
                onChange={e => setSelectedDifficulty(e.target.value)}
                className="ph-problems-select"
              >
                <option value="All">Difficulty</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="ph-problems-select"
              >
                <option value="All">Status</option>
                <option value="SOLVED">Solved ✅</option>
                <option value="ATTEMPTED">Attempted 🟡</option>
                <option value="UNSOLVED">Todo ○</option>
              </select>

              {/* Count */}
              <span className="ph-problems-count">
                {filteredQuestions.length} / {questions.length}
              </span>
            </div>

            {/* Problems Table */}
            {loading ? (
              <div className="ph-loading">
                <div className="ph-spinner" />
                <p>Loading problems...</p>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="ph-empty">
                <div className="ph-empty-icon">📭</div>
                <div className="ph-empty-title">No problems match filters</div>
              </div>
            ) : (
              <table className="ph-problems-table">
                <thead>
                  <tr>
                    <th className="ph-col-status"></th>
                    <th className="ph-col-num">#</th>
                    <th className="ph-col-title">Title</th>
                    <th className="ph-col-category">Category</th>
                    <th className="ph-col-diff">Difficulty</th>
                    <th className="ph-col-score">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuestions.map((q, idx) => {
                    const status = getQuestionDisplayStatus(q.questionId, solvedIds, problemDetails, q.isPremium, isPremiumUser);
                    const bestScore = problemDetails[q.questionId]?.bestScore;

                    const diffClass = q.difficulty === 'Hard' ? 'hard'
                      : q.difficulty === 'Medium' ? 'medium'
                      : q.difficulty === 'Beginner' ? 'beginner'
                      : 'easy';

                    const statusIcon = status === 'SOLVED' ? '✅' : status === 'ATTEMPTED' ? '🟡' : status === 'LOCKED' ? '🔒' : '';

                    return (
                      <tr
                        key={q.questionId}
                        className={`ph-problem-row ${status === 'LOCKED' ? 'locked' : ''}`}
                        onClick={() => handleQuestionClick(q, status)}
                      >
                        <td className="ph-col-status">
                          <span className="ph-status-icon">{statusIcon}</span>
                        </td>
                        <td className="ph-col-num">{idx + 1}</td>
                        <td className="ph-col-title">
                          <span className="ph-problem-title-text">
                            {q.questionId} – {q.title}
                          </span>
                          {q.isPremium && <span className="ph-premium-badge">⭐</span>}
                        </td>
                        <td className="ph-col-category">
                          <span className="ph-cat-tag">{q.category || '—'}</span>
                        </td>
                        <td className="ph-col-diff">
                          <span className={`ph-diff-tag ${diffClass}`}>{q.difficulty || 'Easy'}</span>
                        </td>
                        <td className="ph-col-score">
                          {bestScore !== undefined ? (
                            <span className={`ph-score-tag ${bestScore === 100 ? 'perfect' : 'partial'}`}>
                              {bestScore}%
                            </span>
                          ) : (
                            <span style={{ color: '#475569' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Right Sidebar Stats */}
          <div className="ph-problems-sidebar">
            {/* Solved Progress Widget */}
            <div className="ph-stat-card">
              <div className="ph-stat-title">My Progress</div>
              <div className="ph-stat-donut-wrap">
                <div className="ph-stat-donut">
                  <span className="ph-stat-solved">{solvedIds.length}</span>
                  <span className="ph-stat-total">/{questions.length}</span>
                </div>
                <div className="ph-stat-donut-label">Solved</div>
              </div>
              <div className="ph-stat-bars">
                {DIFFICULTIES.map(d => {
                  const total = questions.filter(q => q.difficulty === d).length;
                  const solved = questions.filter(q => q.difficulty === d && solvedIds.includes(q.questionId)).length;
                  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
                  const cls = d === 'Hard' ? 'hard' : d === 'Medium' ? 'medium' : d === 'Beginner' ? 'beginner' : 'easy';
                  return (
                    <div key={d} className="ph-stat-bar-row">
                      <span className={`ph-stat-bar-label ${cls}`}>{d}</span>
                      <div className="ph-stat-bar-track">
                        <div className={`ph-stat-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="ph-stat-bar-count">{solved}/{total}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Category Links */}
            <div className="ph-stat-card" style={{ marginTop: '16px' }}>
              <div className="ph-stat-title">Categories</div>
              <div className="ph-sidebar-cats">
                {CATEGORIES.slice(0, 8).map(cat => {
                  const count = questions.filter(q => q.category === cat).length;
                  return (
                    <div
                      key={cat}
                      className={`ph-sidebar-cat-row ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      <span className="ph-sidebar-cat-name">{cat}</span>
                      <span className="ph-sidebar-cat-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Premium Upgrade Modal */}
      {showPremiumModal && (
        <div className="pcont-modal-overlay" onClick={() => setShowPremiumModal(false)}>
          <div className="pcont-modal" onClick={e => e.stopPropagation()}>
            <div className="pcont-modal-icon">⭐</div>
            <div className="pcont-modal-title">Premium Access Required</div>
            <div className="pcont-modal-desc">
              This question or course is part of the Premium package.
              Upgrade your profile to unlock complete access.
            </div>
            <button className="pcont-modal-btn primary" onClick={() => setShowPremiumModal(false)}>
              Upgrade Profile
            </button>
            <button className="pcont-modal-btn secondary" onClick={() => setShowPremiumModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeHome;
const Chip = ({ label, size, style }) => (
  <span style={{
    background: 'rgba(255,255,255,0.08)',
    color: '#e2e8f0',
    fontSize: size === 'small' ? '11px' : '13px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: 500,
    ...style
  }}>
    {label}
  </span>
);
