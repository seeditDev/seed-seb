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

const STRUCTURED_SHEETS = [
  {
    id: 'a2z',
    title: "Striver's A2Z DSA Sheet",
    tag: "DSA Sheets",
    desc: "Master Data Structures & Algorithms step-by-step from basics to advanced topics.",
    borderColor: "#E76A40",
    buttonType: "track",
    categories: ['Arrays', 'Strings', 'Sorting', 'Searching', 'Recursion', 'Linked List', 'Stack', 'Queue', 'Greedy', 'Trees', 'Graphs', 'Dynamic Programming', 'Bit Manipulation']
  },
  {
    id: 'sde',
    title: "Striver's SDE Sheet",
    tag: "Interview Prep",
    desc: "Curated list of top coding interview questions frequently asked in product-based companies.",
    borderColor: "#E5A48B",
    buttonType: "track",
    categories: ['Arrays', 'Strings', 'Linked List', 'Trees', 'Graphs', 'Dynamic Programming']
  },
  {
    id: 'blind75',
    title: "Blind 75 Sheet",
    tag: "LeetCode Prep",
    desc: "The 75 most essential LeetCode questions to prepare for coding interviews efficiently.",
    borderColor: "#A99CE3",
    buttonType: "track",
    categories: ['Arrays', 'Strings', 'Linked List', 'Trees', 'Graphs', 'Dynamic Programming', 'Stack']
  },
  {
    id: 'sysdesign',
    title: "System Design Roadmap",
    tag: "System Design",
    desc: "Complete roadmap to master High-Level (HLD) and Low-Level Design (LLD) with video tutorials.",
    borderColor: "#8FD0B3",
    buttonType: "link",
    link: "https://takeuforward.org/system-design/complete-system-design-roadmap-with-videos-for-sdes/"
  },
  {
    id: 'cp',
    title: "Competitive Programming Track",
    tag: "Competitive Programming",
    desc: "Level up your Competitive Programming logic with curated sheets and Codeforces contests.",
    borderColor: "#ef4444",
    buttonType: "link",
    link: "https://takeuforward.org/interview-experience/strivers-cp-sheet/"
  },
  {
    id: 'cs-core',
    title: "Core CS Subjects Sheet",
    tag: "Core CS",
    desc: "Prepare for Core CSE interview questions on Operating Systems, DBMS, and Computer Networks.",
    borderColor: "#06b6d4",
    buttonType: "link",
    link: "https://takeuforward.org/operating-system/most-asked-operating-system-interview-questions"
  }
];

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

  // Structured learning sheets states
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [expandedTopics, setExpandedTopics] = useState({});

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

  const handleSheetCardClick = (sheet) => {
    if (sheet.buttonType === 'link') {
      window.open(sheet.link, '_blank');
    } else {
      setSelectedSheet(sheet.id);
      setExpandedTopics({});
    }
  };

  const renderSheetsTab = () => {
    if (selectedSheet) {
      const sheet = STRUCTURED_SHEETS.find(s => s.id === selectedSheet);
      if (!sheet) return null;

      const sheetTopics = sheet.topics || [];
      
      let totalSheetQuestions = 0;
      let solvedSheetQuestions = 0;

      const topicsData = sheetTopics.map(topic => {
        let qs = questions.filter(q => q.category === topic.category);
        if (sheet.id === 'blind75') qs = qs.slice(0, 8);
        else if (sheet.id === 'sde') qs = qs.slice(0, 15);
        else if (sheet.id === 'sysdesign') qs = qs.slice(0, 12);
        else if (sheet.id === 'cs-core') qs = qs.slice(0, 15);
        else if (sheet.id === 'cp') qs = qs.slice(0, 20);
        else qs = qs.slice(0, 35); // a2z

        const solvedCount = qs.filter(q => solvedIds.includes(q.questionId)).length;
        totalSheetQuestions += qs.length;
        solvedSheetQuestions += solvedCount;

        return { topicName: topic.name, category: topic.category, questions: qs, solvedCount };
      });

      const completionPct = totalSheetQuestions > 0 ? Math.round((solvedSheetQuestions / totalSheetQuestions) * 100) : 0;

      return (
        <div className="ps-sheet-detail" style={{ maxWidth: '1000px', margin: '20px auto', padding: '0 20px' }}>
          <button 
            onClick={() => setSelectedSheet(null)}
            className="ph-topbar-btn"
            style={{ 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              marginBottom: '20px', 
              background: 'rgba(255,255,255,0.04)', 
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--ph-text)'
            }}
          >
            <FaChevronLeft /> Back to Sheets
          </button>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '2fr 1fr', 
            gap: '24px', 
            background: 'var(--ph-surface)', 
            border: '1px solid var(--ph-border)', 
            borderRadius: '16px', 
            padding: '24px',
            marginBottom: '30px'
          }}>
            <div>
              <span style={{ 
                background: `${sheet.borderColor}15`, 
                color: sheet.borderColor, 
                fontSize: '11px', 
                fontWeight: 'bold', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                padding: '4px 10px',
                borderRadius: '4px',
                display: 'inline-block',
                marginBottom: '10px'
              }}>{sheet.tag}</span>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--ph-text)', margin: '0 0 10px 0' }}>{sheet.title}</h2>
              <p style={{ color: 'var(--ph-text-dim)', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>{sheet.desc}</p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid var(--ph-border)' }}>
              <div style={{ position: 'relative', width: '90px', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="90" height="90" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="transparent" />
                  <circle 
                    cx="50" 
                    cy="50" 
                    r="40" 
                    stroke={sheet.borderColor} 
                    strokeWidth="8" 
                    fill="transparent" 
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * completionPct) / 100}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', fontSize: '18px', fontWeight: 'bold', color: 'var(--ph-text)' }}>
                  {completionPct}%
                </div>
              </div>
              <div style={{ color: 'var(--ph-text-dim)', fontSize: '12px', marginTop: '10px', fontWeight: '600' }}>
                {solvedSheetQuestions}/{totalSheetQuestions} Solved
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '40px' }}>
            {topicsData.map((topic, index) => {
              const isOpen = !!expandedTopics[topic.topicName];
              const pct = topic.questions.length > 0 ? Math.round((topic.solvedCount / topic.questions.length) * 100) : 0;
              
              return (
                <div 
                  key={topic.topicName} 
                  style={{ 
                    background: 'var(--ph-surface)', 
                    border: '1px solid var(--ph-border)', 
                    borderRadius: '12px', 
                    overflow: 'hidden' 
                  }}
                >
                  <div 
                    onClick={() => setExpandedTopics(prev => ({ ...prev, [topic.topicName]: !prev[topic.topicName] }))}
                    style={{ 
                      padding: '16px 20px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      cursor: 'pointer',
                      background: 'rgba(255,255,255,0.01)',
                      borderBottom: isOpen ? '1px solid var(--ph-border)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '18px', color: sheet.borderColor }}>
                        {isOpen ? '📂' : '📁'}
                      </span>
                      <strong style={{ fontSize: '15px', color: 'var(--ph-text)' }}>
                        {topic.topicName}
                      </strong>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '80px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: sheet.borderColor, borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--ph-text-dim)', minWidth: '45px', textAlign: 'right' }}>
                          {topic.solvedCount}/{topic.questions.length}
                        </span>
                      </div>
                      <span style={{ color: 'var(--ph-text-dim)' }}>
                        {isOpen ? <FaAngleDown /> : <FaAngleRight />}
                      </span>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '0px' }}>
                      <table className="ph-problems-table" style={{ margin: 0, border: 'none', background: 'transparent' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                            <th className="ph-col-status" style={{ width: '40px', paddingLeft: '20px' }}>Status</th>
                            <th className="ph-col-num" style={{ width: '50px' }}>#</th>
                            <th className="ph-col-title">Question</th>
                            <th className="ph-col-diff" style={{ width: '100px' }}>Difficulty</th>
                            <th className="ph-col-score" style={{ width: '100px', textAlign: 'right', paddingRight: '20px' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topic.questions.map((q, idx) => {
                            const status = getQuestionDisplayStatus(q.questionId, solvedIds, problemDetails, !!q.isPremium, user?.Premium === true || user?.Premium === 'true' || user?.Premium === 1 || !!user?.isPremium);
                            
                            let statusIcon = STATUS_ICONS.UNSOLVED;
                            if (status === 'SOLVED') statusIcon = STATUS_ICONS.SOLVED;
                            else if (status === 'ATTEMPTED') statusIcon = STATUS_ICONS.ATTEMPTED;
                            else if (status === 'LOCKED') statusIcon = STATUS_ICONS.LOCKED;

                            const diffClass = q.difficulty?.toLowerCase() || 'easy';

                            return (
                              <tr 
                                key={q.questionId}
                                className={`ph-problem-row ${status === 'LOCKED' ? 'locked' : ''}`}
                                style={{ background: 'rgba(255,255,255,0.005)' }}
                              >
                                <td className="ph-col-status" style={{ paddingLeft: '20px', fontSize: '14px' }}>
                                  <span className="ph-status-icon">{statusIcon}</span>
                                </td>
                                <td className="ph-col-num" style={{ color: 'var(--ph-text-dim)' }}>{idx + 1}</td>
                                <td className="ph-col-title">
                                  <span className="ph-problem-title-text" style={{ fontWeight: '500' }}>{q.title}</span>
                                  {q.isPremium && <span className="ph-premium-badge" style={{ marginLeft: '6px' }}>⭐</span>}
                                </td>
                                <td className="ph-col-diff">
                                  <span className={`ph-diff-tag ${diffClass}`}>{q.difficulty || 'Easy'}</span>
                                </td>
                                <td className="ph-col-score" style={{ textAlign: 'right', paddingRight: '20px' }}>
                                  <button
                                    onClick={() => {
                                      if (status === 'LOCKED') {
                                        setShowPremiumModal(true);
                                      } else {
                                        navigate(`/student/practice/solve/${q.questionId}`);
                                      }
                                    }}
                                    style={{
                                      background: status === 'SOLVED' ? 'rgba(74,222,128,0.1)' : 'var(--ph-primary-light)',
                                      border: '1px solid rgba(124,107,255,0.3)',
                                      borderRadius: '6px',
                                      color: status === 'SOLVED' ? '#4ade80' : 'var(--ph-primary)',
                                      fontSize: '11px',
                                      fontWeight: 'bold',
                                      padding: '4px 12px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {status === 'SOLVED' ? 'Re-Solve' : 'Solve'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="ph-section" style={{ maxWidth: '1000px', margin: '30px auto', padding: '0 20px' }}>
        <div className="ph-hero" style={{ padding: '20px 0' }}>
          <div className="ph-hero-tag"><span>🔥</span> Structured Sheets</div>
          <h1 className="ph-hero-title">Structured <span>Learning Paths</span></h1>
          <p className="ph-hero-sub">Master DSA, system design, and competitive coding with curated worksheets.</p>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
          gap: '20px', 
          marginTop: '10px' 
        }}>
          {STRUCTURED_SHEETS.map(sheet => {
            let totalQs = 0;
            let solvedQs = 0;
            if (sheet.topics) {
              sheet.topics.forEach(topic => {
                let qs = questions.filter(q => q.category === topic.category);
                if (sheet.id === 'blind75') qs = qs.slice(0, 8);
                else if (sheet.id === 'sde') qs = qs.slice(0, 15);
                else if (sheet.id === 'sysdesign') qs = qs.slice(0, 12);
                else if (sheet.id === 'cs-core') qs = qs.slice(0, 15);
                else if (sheet.id === 'cp') qs = qs.slice(0, 20);
                else qs = qs.slice(0, 35); // a2z

                totalQs += qs.length;
                solvedQs += qs.filter(q => solvedIds.includes(q.questionId)).length;
              });
            }

            return (
              <div 
                key={sheet.id}
                onClick={() => handleSheetCardClick(sheet)}
                className="q-list-row-hover"
                style={{
                  background: 'var(--ph-surface)',
                  border: '1px solid var(--ph-border)',
                  borderLeft: `4px solid ${sheet.borderColor}`,
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  position: 'relative'
                }}
              >
                <div>
                  <span style={{ 
                    fontSize: '10px', 
                    fontWeight: 'bold', 
                    color: sheet.borderColor, 
                    background: `${sheet.borderColor}15`, 
                    padding: '3px 8px', 
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>{sheet.tag}</span>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--ph-text)', margin: '10px 0 6px 0' }}>{sheet.title}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--ph-text-dim)', margin: 0, lineHeight: '1.5' }}>{sheet.desc}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--ph-border)', paddingTop: '12px', marginTop: '6px' }}>
                  {sheet.buttonType === 'track' ? (
                    <span style={{ fontSize: '12px', color: 'var(--ph-text-dim)', fontWeight: '600' }}>
                      📈 {solvedQs}/{totalQs} Solved
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--ph-text-dim)', fontWeight: '600' }}>
                      🌐 External Tutorial
                    </span>
                  )}
                  
                  <button
                    style={{
                      background: sheet.buttonType === 'link' ? 'rgba(255,255,255,0.03)' : `${sheet.borderColor}15`,
                      border: `1px solid ${sheet.buttonType === 'link' ? 'var(--ph-border)' : `${sheet.borderColor}30`}`,
                      color: sheet.buttonType === 'link' ? 'var(--ph-text)' : sheet.borderColor,
                      fontSize: '12px',
                      fontWeight: 'bold',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {sheet.buttonType === 'link' ? 'Open Link ↗' : 'Start Sheet ›'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
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
            onClick={() => { setSelectedModule(null); setSelectedSheet(null); setActiveTab('paths'); }}
            style={{ borderRadius: '8px' }}
          >
            📂 College Curriculum
          </button>
          <button 
            className={`ph-topbar-btn ${activeTab === 'sheets' && !selectedModule ? 'active' : ''}`}
            onClick={() => { setSelectedModule(null); setSelectedSheet(null); setActiveTab('sheets'); }}
            style={{ borderRadius: '8px' }}
          >
            🔥 Structured Sheets
          </button>
          <button 
            className={`ph-topbar-btn ${activeTab === 'bank' && !selectedModule ? 'active' : ''}`}
            onClick={() => { setSelectedModule(null); setSelectedSheet(null); setActiveTab('bank'); }}
            style={{ borderRadius: '8px' }}
          >
            🎯 Practice Bank
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
      ) : activeTab === 'sheets' ? (
        renderSheetsTab()
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
