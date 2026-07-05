import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchQuestionsIndex } from '../services/codingQuestionBankService';
import { getSolvedQuestionIds, getFullProgress, syncProgressWithFirebase, getQuestionDisplayStatus, saveSheetProgress } from '../services/codingProgressService';
import DataService from '../services/dataService';
import { 
  FaSearch, FaSync, FaLock, FaCheckCircle, FaExclamationTriangle, 
  FaHourglassHalf, FaFolder, FaFolderOpen, FaFileAlt, FaBookOpen, 
  FaAngleRight, FaAngleDown, FaListUl, FaChevronLeft, FaYoutube
} from 'react-icons/fa';
import '../styles/PracticeHome.css';
import { CATEGORIZED_SHEETS } from '../config/sheetsData';

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

// Structured sheets are configured inside sheetsData.js

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
  const [sheetSolvedDicts, setSheetSolvedDicts] = useState({});
  const [activeArticle, setActiveArticle] = useState(null);
  const [activeArticleMeta, setActiveArticleMeta] = useState(null); // { problemId, sheetId }
  const [articleLoading, setArticleLoading] = useState(false);

  useEffect(() => {
    const initialDicts = {};
    Object.values(CATEGORIZED_SHEETS).flat().forEach(sheet => {
      const key = sheet.id === 'a2z' ? 'seed_it_a2z_solved' : `seed_it_sheet_solved_${sheet.id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          initialDicts[sheet.id] = JSON.parse(saved);
        } catch (e) {}
      } else {
        initialDicts[sheet.id] = {};
      }
    });
    setSheetSolvedDicts(initialDicts);
  }, []);

  const toggleProblemSolved = async (sheetId, problemId) => {
    const isNewSolved = !(sheetSolvedDicts[sheetId] || {})[problemId];

    setSheetSolvedDicts(prev => {
      const sheetDict = prev[sheetId] || {};
      const updatedSheetDict = { ...sheetDict, [problemId]: isNewSolved };
      return { ...prev, [sheetId]: updatedSheetDict };
    });

    const email = user?.Email || user?.email || '';
    if (email) {
      await saveSheetProgress(email, sheetId, problemId, isNewSolved);
    } else {
      const key = sheetId === 'a2z' ? 'seed_it_a2z_solved' : `seed_it_sheet_solved_${sheetId}`;
      const saved = localStorage.getItem(key);
      let dict = {};
      if (saved) {
        try { dict = JSON.parse(saved); } catch (e) {}
      }
      dict[problemId] = isNewSolved;
      localStorage.setItem(key, JSON.stringify(dict));
    }
  };

  const getSheetSolvedCount = (sheet) => {
    const dict = sheetSolvedDicts[sheet.id] || {};
    let count = 0;
    if (sheet.id === 'a2z') {
      sheet.sections.forEach(sec => {
        sec.subcategories.forEach(sub => {
          sub.problems.forEach(p => {
            if (dict[p.id]) count++;
          });
        });
      });
    } else {
      (sheet.sections || []).forEach(sec => {
        (sec.problems || []).forEach(p => {
          if (dict[p.id]) count++;
        });
      });
    }
    return count;
  };

  const getSheetTotalProblems = (sheet) => {
    let count = 0;
    if (sheet.id === 'a2z') {
      sheet.sections.forEach(sec => {
        sec.subcategories.forEach(sub => {
          count += sub.problems.length;
        });
      });
    } else {
      (sheet.sections || []).forEach(sec => {
        count += (sec.problems || []).length;
      });
    }
    return count;
  };

  const openArticle = async (articleUrl, problemName, problemId, sheetId) => {
    if (!articleUrl) return;
    setActiveArticleMeta({ problemId, sheetId });
    setArticleLoading(true);
    let slug = articleUrl.replace(/\/$/, '').split('/').pop();
    try {
      const response = await fetch(`/articles/${slug}.json`);
      if (!response.ok) {
        throw new Error('Not found');
      }
      const data = await response.json();
      setActiveArticle({
        ...data,
        url: articleUrl
      });
    } catch (err) {
      setActiveArticle({
        title: problemName,
        url: articleUrl,
        isExternal: true
      });
    } finally {
      setArticleLoading(false);
    }
  };

  const handleScroll = (e) => {
    const target = e.target;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 10) {
      if (activeArticleMeta) {
        const { problemId, sheetId } = activeArticleMeta;
        const isAlreadySolved = !!(sheetSolvedDicts[sheetId] || {})[problemId] || solvedIds.includes(problemId);
        if (!isAlreadySolved) {
          toggleProblemSolved(sheetId, problemId);
        }
      }
    }
  };

  const handleArticleContainerClick = (e) => {
    const tabBtn = e.target.closest('.code-tab');
    if (tabBtn) {
      const lang = tabBtn.getAttribute('data-lang');
      const parentTabsContainer = tabBtn.closest('.code-tabs');
      if (parentTabsContainer) {
        parentTabsContainer.querySelectorAll('.code-tab').forEach(btn => {
          btn.classList.remove('dsa_article_code_active');
        });
        tabBtn.classList.add('dsa_article_code_active');

        const codeSection = tabBtn.closest('.code-section') || tabBtn.closest('details') || tabBtn.closest('.common-drops');
        if (codeSection) {
          codeSection.querySelectorAll('.code-block').forEach(block => {
            if (block.getAttribute('data-lang') === lang) {
              block.classList.add('dsa_article_code_active');
            } else {
              block.classList.remove('dsa_article_code_active');
            }
          });
        }
      }
      return;
    }

    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
      const codeSection = copyBtn.closest('.code-section') || copyBtn.closest('details');
      if (codeSection) {
        const activeBlock = codeSection.querySelector('.code-block.dsa_article_code_active pre code') || codeSection.querySelector('.code-block.dsa_article_code_active pre');
        if (activeBlock) {
          navigator.clipboard.writeText(activeBlock.innerText || activeBlock.textContent || '');
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = '<span style="font-size: 11px; color: var(--ph-success); font-weight: 700; padding: 2px 4px;">Copied!</span>';
          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
          }, 1500);
        }
      }
    }
  };

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
      if (progress.sheetSolvedDicts) {
        setSheetSolvedDicts(prev => ({ ...prev, ...progress.sheetSolvedDicts }));
      }

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
      const sheet = Object.values(CATEGORIZED_SHEETS).flat().find(s => s.id === selectedSheet);
      if (!sheet) return null;

      const totalSheetQuestions = getSheetTotalProblems(sheet);
      const solvedCount = getSheetSolvedCount(sheet);
      const percentage = totalSheetQuestions > 0 ? Math.round((solvedCount / totalSheetQuestions) * 100) : 0;
      const dashOffset = 251.2 - (251.2 * (solvedCount / totalSheetQuestions || 0));

      return (
        <div className="ph-section ps-sheet-detail" style={{ margin: '20px auto' }}>
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
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', fontSize: '18px', fontWeight: 'bold', color: 'var(--ph-text)' }}>
                  {percentage}%
                </div>
              </div>
              <div style={{ color: 'var(--ph-text-dim)', fontSize: '12px', marginTop: '10px', fontWeight: '600' }}>
                {solvedCount}/{totalSheetQuestions} Solved
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '40px' }}>
            {sheet.id === 'a2z' ? (
              // ─── A2Z SHEET NESTED STRUCTURE (Sections -> Subcategories -> Problems) ───
              sheet.sections.map((section, secIdx) => (
                <div key={section.title} style={{ marginBottom: '10px' }}>
                  <h3 style={{ 
                    fontSize: '18px', 
                    fontWeight: '800', 
                    color: 'var(--ph-text)', 
                    marginBottom: '14px',
                    borderBottom: '2px solid var(--ph-border)',
                    paddingBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ color: sheet.borderColor }}>Step {secIdx + 1}:</span> {section.title}
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {section.subcategories.map((sub, subIdx) => {
                      const accordionKey = `${section.title}-${sub.title}`;
                      const isOpen = !!expandedTopics[accordionKey];
                      
                      return (
                        <div 
                          key={sub.title} 
                          style={{ 
                            background: 'var(--ph-surface)', 
                            border: '1px solid var(--ph-border)', 
                            borderRadius: '12px', 
                            overflow: 'hidden' 
                          }}
                        >
                          <div 
                            onClick={() => setExpandedTopics(prev => ({ ...prev, [accordionKey]: !prev[accordionKey] }))}
                            style={{ 
                              padding: '14px 20px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between', 
                              cursor: 'pointer',
                              background: 'rgba(255,255,255,0.01)',
                              borderBottom: isOpen ? '1px solid var(--ph-border)' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontSize: '16px', color: sheet.borderColor }}>
                                {isOpen ? '📂' : '📁'}
                              </span>
                              <strong style={{ fontSize: '14px', color: 'var(--ph-text)' }}>
                                Lecture {subIdx + 1}: {sub.title}
                              </strong>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--ph-text-dim)', fontWeight: '600' }}>
                                {sub.problems.length} Problems
                              </span>
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
                                    <th className="ph-col-score" style={{ width: '160px', textAlign: 'right', paddingRight: '20px' }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sub.problems.map((p, pIdx) => {
                                    const diffClass = p.difficulty?.toLowerCase() || 'easy';
                                    const isSolved = !!(sheetSolvedDicts['a2z'] || {})[p.id] || solvedIds.includes(p.id);
                                    return (
                                      <tr 
                                        key={p.id || pIdx}
                                        className={`ph-problem-row ${isSolved ? 'solved' : ''}`}
                                        style={{ background: 'rgba(255,255,255,0.005)' }}
                                      >
                                        <td 
                                          className="ph-col-status" 
                                          style={{ paddingLeft: '20px', fontSize: '14px', cursor: 'pointer' }}
                                          onClick={() => toggleProblemSolved('a2z', p.id)}
                                        >
                                          <span className="ph-status-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                            {isSolved ? (
                                              <FaCheckCircle style={{ color: 'var(--ph-success)' }} />
                                            ) : (
                                              <span style={{ 
                                                width: '14px', 
                                                height: '14px', 
                                                borderRadius: '50%', 
                                                border: '2px solid var(--ph-text-dim)', 
                                                display: 'inline-block',
                                                opacity: 0.6
                                              }} />
                                            )}
                                          </span>
                                        </td>
                                        <td className="ph-col-num" style={{ color: 'var(--ph-text-dim)' }}>{pIdx + 1}</td>
                                        <td className="ph-col-title">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span 
                                              className="ph-problem-title-text" 
                                              style={{ fontWeight: '500', cursor: p.article ? 'pointer' : 'default', color: 'var(--ph-text)' }}
                                              onClick={() => p.article && openArticle(p.article, p.name, p.id, 'a2z')}
                                            >
                                              {p.name}
                                            </span>
                                            {p.article && (
                                              <button
                                                onClick={() => openArticle(p.article, p.name, p.id, 'a2z')}
                                                style={{
                                                  background: 'none',
                                                  border: 'none',
                                                  color: 'var(--ph-primary)',
                                                  cursor: 'pointer',
                                                  padding: '2px',
                                                  fontSize: '13px',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  opacity: 0.8,
                                                  transition: 'opacity 0.2s'
                                                }}
                                                title="Read Tutorial"
                                                className="ph-article-btn"
                                              >
                                                <FaBookOpen />
                                              </button>
                                            )}
                                            {p.youtube && (
                                              <a
                                                href={p.youtube}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                  color: '#ef4444',
                                                  fontSize: '14px',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  opacity: 0.8,
                                                  transition: 'opacity 0.2s'
                                                }}
                                                title="Watch Video Solution"
                                              >
                                                <FaYoutube />
                                              </a>
                                            )}
                                          </div>
                                        </td>
                                        <td className="ph-col-diff">
                                          <span className={`ph-diff-tag ${diffClass}`}>{p.difficulty || 'Easy'}</span>
                                        </td>
                                        <td className="ph-col-score" style={{ textAlign: 'right', paddingRight: '20px' }}>
                                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            {p.id && (
                                              <button
                                                onClick={() => navigate(`/student/practice/solve/${p.id}`, { state: { scoringType: 'PARTIAL_SCORE' } })}
                                                style={{
                                                  background: 'var(--ph-primary)',
                                                  border: '1px solid rgba(124,107,255,0.4)',
                                                  borderRadius: '6px',
                                                  color: 'white',
                                                  fontSize: '11px',
                                                  fontWeight: 'bold',
                                                  padding: '4px 12px',
                                                  cursor: 'pointer',
                                                  transition: 'all 0.2s'
                                                }}
                                              >
                                                Code
                                              </button>
                                            )}
                                            <button
                                              onClick={() => toggleProblemSolved('a2z', p.id)}
                                              style={{
                                                background: isSolved ? 'rgba(74,222,128,0.1)' : 'var(--ph-primary-light)',
                                                border: isSolved ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(124,107,255,0.3)',
                                                borderRadius: '6px',
                                                color: isSolved ? 'var(--ph-success)' : 'var(--ph-primary)',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                padding: '4px 12px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                              }}
                                            >
                                              {isSolved ? 'Solved' : 'Solve'}
                                            </button>
                                          </div>
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
              ))
            ) : (
              // ─── NON-A2Z SHEET FLAT STRUCTURE (Sections -> Problems) ───
              sheet.sections.map((section, secIdx) => {
                const accordionKey = `${sheet.id}-${section.title}`;
                const isOpen = !!expandedTopics[accordionKey];
                const solvedSecCount = section.problems.filter(p => (sheetSolvedDicts[sheet.id] || {})[p.id]).length;
                const pct = section.problems.length > 0 ? Math.round((solvedSecCount / section.problems.length) * 100) : 0;

                return (
                  <div 
                    key={section.title} 
                    style={{ 
                      background: 'var(--ph-surface)', 
                      border: '1px solid var(--ph-border)', 
                      borderRadius: '12px', 
                      overflow: 'hidden' 
                    }}
                  >
                    <div 
                      onClick={() => setExpandedTopics(prev => ({ ...prev, [accordionKey]: !prev[accordionKey] }))}
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
                          Step {secIdx + 1}: {section.title}
                        </strong>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '80px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: sheet.borderColor, borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--ph-text-dim)', minWidth: '45px', textAlign: 'right' }}>
                            {solvedSecCount}/{section.problems.length}
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
                              <th className="ph-col-score" style={{ width: '160px', textAlign: 'right', paddingRight: '20px' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.problems.map((p, pIdx) => {
                              const isSolved = !!(sheetSolvedDicts[sheet.id] || {})[p.id] || solvedIds.includes(p.id);
                              const diffClass = p.difficulty?.toLowerCase() || 'easy';

                              return (
                                <tr 
                                  key={p.id || pIdx}
                                  className={`ph-problem-row ${isSolved ? 'solved' : ''}`}
                                  style={{ background: 'rgba(255,255,255,0.005)' }}
                                >
                                  <td 
                                    className="ph-col-status" 
                                    style={{ paddingLeft: '20px', fontSize: '14px', cursor: 'pointer' }}
                                    onClick={() => toggleProblemSolved(sheet.id, p.id)}
                                  >
                                    <span className="ph-status-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                      {isSolved ? (
                                        <FaCheckCircle style={{ color: 'var(--ph-success)' }} />
                                      ) : (
                                        <span style={{ 
                                          width: '14px', 
                                          height: '14px', 
                                          borderRadius: '50%', 
                                          border: '2px solid var(--ph-text-dim)', 
                                          display: 'inline-block',
                                          opacity: 0.6
                                        }} />
                                      )}
                                    </span>
                                  </td>
                                  <td className="ph-col-num" style={{ color: 'var(--ph-text-dim)' }}>{pIdx + 1}</td>
                                  <td className="ph-col-title">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <span 
                                        className="ph-problem-title-text" 
                                        style={{ fontWeight: '500', cursor: p.article ? 'pointer' : 'default', color: 'var(--ph-text)' }}
                                        onClick={() => p.article && openArticle(p.article, p.name, p.id, sheet.id)}
                                      >
                                        {p.name}
                                      </span>
                                      {p.article && (
                                        <button
                                          onClick={() => openArticle(p.article, p.name, p.id, sheet.id)}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--ph-primary)',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            fontSize: '13px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            opacity: 0.8,
                                            transition: 'opacity 0.2s'
                                          }}
                                          title="Read Tutorial"
                                          className="ph-article-btn"
                                        >
                                          <FaBookOpen />
                                        </button>
                                      )}
                                      {p.youtube && (
                                        <a
                                          href={p.youtube}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{
                                            color: '#ef4444',
                                            fontSize: '14px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            opacity: 0.8,
                                            transition: 'opacity 0.2s'
                                          }}
                                          title="Watch Video Solution"
                                        >
                                          <FaYoutube />
                                        </a>
                                      )}
                                    </div>
                                  </td>
                                  <td className="ph-col-diff">
                                    <span className={`ph-diff-tag ${diffClass}`}>{p.difficulty || 'Easy'}</span>
                                  </td>
                                  <td className="ph-col-score" style={{ textAlign: 'right', paddingRight: '20px' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                      {p.id && (
                                        <button
                                          onClick={() => navigate(`/student/practice/solve/${p.id}`, { state: { scoringType: 'PARTIAL_SCORE' } })}
                                          style={{
                                            background: 'var(--ph-primary)',
                                            border: '1px solid rgba(124,107,255,0.4)',
                                            borderRadius: '6px',
                                            color: 'white',
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            padding: '4px 12px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                          }}
                                        >
                                          Code
                                        </button>
                                      )}
                                      <button
                                        onClick={() => toggleProblemSolved(sheet.id, p.id)}
                                        style={{
                                          background: isSolved ? 'rgba(74,222,128,0.1)' : 'var(--ph-primary-light)',
                                          border: isSolved ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(124,107,255,0.3)',
                                          borderRadius: '6px',
                                          color: isSolved ? 'var(--ph-success)' : 'var(--ph-primary)',
                                          fontSize: '11px',
                                          fontWeight: 'bold',
                                          padding: '4px 12px',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s'
                                        }}
                                      >
                                        {isSolved ? 'Solved' : 'Solve'}
                                      </button>
                                    </div>
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
              })
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="ph-section" style={{ margin: '30px auto' }}>
        <div className="ph-hero" style={{ padding: '20px 0' }}>
          <div className="ph-hero-tag"><span>🔥</span> Structured Sheets</div>
          <h1 className="ph-hero-title">Structured <span>Learning Paths</span></h1>
          <p className="ph-hero-sub">Master DSA, system design, and competitive coding with curated worksheets.</p>
        </div>

        <div className="ps-categories-container" style={{ marginTop: '20px' }}>
          {Object.entries(CATEGORIZED_SHEETS).map(([categoryName, sheets]) => (
            <div key={categoryName} className="ps-category-group">
              <h2 className="ps-category-header">
                {categoryName === "DSA Sheets" && <span>🔥</span>}
                {categoryName === "Core Cs Subjects" && <span>💻</span>}
                {categoryName === "System Design" && <span>⚙️</span>}
                {categoryName === "DSA Playlist" && <span>📚</span>}
                {categoryName === "Competitive Programming" && <span>🏆</span>}
                {categoryName}
              </h2>
              
              <div className="ps-cards-grid">
                {sheets.map(sheet => {
                  const totalQs = getSheetTotalProblems(sheet);
                  const solvedQs = getSheetSolvedCount(sheet);
                  const style = { 
                    '--theme-border-color': sheet.borderColor, 
                    '--theme-border-color-15': `${sheet.borderColor}15`, 
                    '--theme-border-color-25': `${sheet.borderColor}25`, 
                    '--theme-border-color-30': `${sheet.borderColor}30`, 
                    '--theme-border-color-50': `${sheet.borderColor}50` 
                  };

                  return (
                    <div 
                      key={sheet.id}
                      className="ps-sheet-card"
                      style={style}
                    >
                      <div>
                        <h3 className="ps-card-title">{sheet.title}</h3>
                        <p className="ps-card-desc">{sheet.desc}</p>
                      </div>

                      <div className="ps-card-footer">
                        <span className="ps-card-stats">
                          📊 {solvedQs}/{totalQs} Solved
                        </span>
                        
                        <div className="ps-card-actions">
                          {sheet.id === 'a2z' || sheet.id === 'blind75' || sheet.id === 'sde' || sheet.id === 'striver79' ? (
                            <>
                              <button
                                onClick={() => handleSheetCardClick(sheet)}
                                className="ps-action-btn"
                                style={{ padding: '6px 10px' }}
                              >
                                Sheet
                              </button>
                              <button
                                onClick={() => handleSheetCardClick(sheet)}
                                className="ps-action-btn primary"
                                style={{ padding: '6px 10px' }}
                              >
                                Track
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleSheetCardClick(sheet)}
                              className="ps-action-btn primary"
                            >
                              Start Learning
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
        <div className="ph-section" style={{ display: 'flex', width: '100%', justifyContent: 'flex-start', padding: '0 32px' }}>
          <div className="ph-topbar-nav" style={{ gap: '8px' }}>
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
        <div className="ph-section" style={{ margin: '30px auto' }}>
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
        <div className="ph-section" style={{ margin: '30px auto' }}>
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
      {/* Article Reader Modal */}
      {activeArticle && (
        <div className="ph-modal-overlay" onClick={() => setActiveArticle(null)}>
          <div className="ph-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ph-article-header">
              <div className="ph-article-title-container">
                <h2 className="ph-article-title">{activeArticle.title}</h2>
                <span className="ph-article-subtitle">SEED-IT Learning Platform • Course Tutorial</span>
              </div>
              <button className="ph-article-close" onClick={() => setActiveArticle(null)} title="Close Tutorial">
                ✕
              </button>
            </div>
            
            <div className="ph-article-scroll" onScroll={handleScroll}>
              {activeArticle.isExternal ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '20px' }}>🌐</div>
                  <h3 style={{ border: 'none', margin: '0 0 16px 0', fontSize: '20px' }}>External Tutorial Link</h3>
                  <p style={{ color: 'var(--ph-text-dim)', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
                    This tutorial is hosted on an external source website ({new URL(activeArticle.url).hostname}). Click the button below to view it.
                  </p>
                  <a 
                    href={activeArticle.url}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ph-topbar-btn active"
                    style={{ 
                      textDecoration: 'none', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      padding: '10px 24px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}
                  >
                    Open Tutorial Website
                  </a>
                </div>
              ) : (
                <>
                  {activeArticle.video && (() => {
                    let videoId = '';
                    const url = activeArticle.video;
                    if (url.includes('youtu.be/')) {
                      videoId = url.split('youtu.be/')[1]?.split('?')[0];
                    } else if (url.includes('watch?v=')) {
                      videoId = url.split('watch?v=')[1]?.split('&')[0];
                    } else if (url.includes('youtube.com/embed/')) {
                      videoId = url.split('youtube.com/embed/')[1]?.split('?')[0];
                    }
                    if (videoId) {
                      return (
                        <div className="ph-article-video-container">
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="YouTube Video Solution"
                            allowFullScreen
                          />
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  <div 
                    className="ph-article-content"
                    onClick={handleArticleContainerClick}
                    dangerouslySetInnerHTML={{ __html: activeArticle.content }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Article Loading Overlay */}
      {articleLoading && (
        <div className="ph-modal-overlay">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div className="ph-spinner" style={{ width: '40px', height: '40px', borderWidth: '4px' }} />
            <p style={{ color: 'white', fontWeight: 600 }}>Loading local tutorial...</p>
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
