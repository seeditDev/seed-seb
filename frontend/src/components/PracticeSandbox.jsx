import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { FaPlay, FaCheck, FaTimes, FaUndo, FaArrowLeft, FaHourglassHalf, FaCode, FaListUl, FaSearch } from 'react-icons/fa';
import desktopBridge from '../utils/desktopBridge';
import { fetchQuestion, fetchQuestionsIndex } from '../services/codingQuestionBankService';
import { markQuestionSolved, markQuestionAttempted, getQuestionProgress, getFullProgress, syncProgressWithFirebase } from '../services/codingProgressService';
import '../styles/PracticeSandbox.css';

const FREE_BOILERPLATES = {
  c: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`,
  python3: `print("Hello, World!")`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`,
  javascript: `console.log("Hello, World!");`
};

const MONACO_LANG_MAP = {
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  python3: 'python',
  javascript: 'javascript'
};

const normalizeQuestion = (q) => {
  if (!q) return q;
  const id = q.questionId || q.id || '';
  const title = q.title || '';
  const description = q.content?.problemStatement || q.description || '';
  const constraints = Array.isArray(q.content?.constraints) 
    ? q.content.constraints.join('\n') 
    : (q.constraints || '');

  // Normalize boilerplates
  const boilerplates = q.boilerplates || {};
  if (q.solution?.code) {
    const code = q.solution.code;
    if (code.C) boilerplates.c = code.C;
    if (code['C++']) boilerplates.cpp = code['C++'];
    if (code.Java) boilerplates.java = code.Java;
    if (code.Python3) boilerplates.python3 = code.Python3;
    if (code.JavaScript) boilerplates.javascript = code.JavaScript;
  }

  // Normalize sample test cases
  const sampleTestCases = (q.content?.sampleTestCases || q.sampleTestCases || q.sampleTests || []).map(tc => ({
    ...tc,
    input: tc.input || '',
    expected: tc.expected || tc.output || tc.expectedOutput || tc.expected_output || ''
  }));

  // Normalize hidden test cases
  let hidden = [];
  if (q.testCases?.hidden) {
    hidden = q.testCases.hidden.map(tc => ({
      ...tc,
      id: tc.id || tc.label || '',
      input: tc.input || '',
      expected: tc.expectedOutput || tc.expected || tc.output || tc.expected_output || ''
    }));
  } else if (Array.isArray(q.testCases)) {
    hidden = q.testCases.map(tc => ({
      ...tc,
      id: tc.id || '',
      input: tc.input || '',
      expected: tc.expected || tc.output || tc.expectedOutput || tc.expected_output || ''
    }));
  }

  return {
    ...q,
    id,
    title,
    description,
    constraints,
    boilerplates,
    sampleTestCases,
    sampleTests: sampleTestCases,
    hiddenTests: hidden,
    testCases: {
      ...q.testCases,
      hidden: hidden
    }
  };
};

const PracticeSandbox = () => {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  // Editor states
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [activeLeftTab, setActiveLeftTab] = useState('description'); // 'description', 'solution'
  const [activeConsoleTab, setActiveConsoleTab] = useState('input'); // 'input', 'output', 'results'

  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [exitCode, setExitCode] = useState(null);
  const [submitResults, setSubmitResults] = useState([]);
  const [submitScore, setSubmitScore] = useState(null);
  const [sampleResults, setSampleResults] = useState([]);
  const [scoringType, setScoringType] = useState('PARTIAL_SCORE');

  // Collapsible list sidebar states
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarQuestions, setSidebarQuestions] = useState([]);
  const [solvedIds, setSolvedIds] = useState([]);
  const [problemDetails, setProblemDetails] = useState({});
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarDifficulty, setSidebarDifficulty] = useState('All');
  const [sidebarCategory, setSidebarCategory] = useState('All');
  const [sidebarStatus, setSidebarStatus] = useState('All');

  // Resizable layout states
  const [leftWidth, setLeftWidth] = useState(42); // percentage
  const [editorHeight, setEditorHeight] = useState(60); // percentage
  const workspaceRef = useRef(null);
  const rightPanelRef = useRef(null);

  const startHorizontalDrag = (e) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent) => {
      if (!workspaceRef.current) return;
      const workspaceRect = workspaceRef.current.getBoundingClientRect();
      const newWidth = ((moveEvent.clientX - workspaceRect.left) / workspaceRect.width) * 100;
      if (newWidth > 15 && newWidth < 85) {
        setLeftWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const startVerticalDrag = (e) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent) => {
      if (!rightPanelRef.current) return;
      const panelRect = rightPanelRef.current.getBoundingClientRect();
      const newHeight = ((moveEvent.clientY - panelRect.top) / panelRect.height) * 100;
      if (newHeight > 20 && newHeight < 80) {
        setEditorHeight(newHeight);
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
    setUser(authData);

    // Scoring override from location state if coming from module/contest
    if (location.state?.scoringType) {
      setScoringType(location.state.scoringType);
    }

    // Load sidebar questions list and user progress
    const loadSidebarData = async () => {
      try {
        const email = authData?.Email || authData?.email || '';
        if (email && navigator.onLine) {
          try {
            await syncProgressWithFirebase(email);
          } catch (e) {
            console.warn('Sandbox sidebar sync failed:', e);
          }
        }
        const [indexQs, progress] = await Promise.all([
          fetchQuestionsIndex().catch(() => []),
          getFullProgress(email).catch(() => ({ solvedProblems: [], problemDetails: {} })),
        ]);
        setSidebarQuestions(indexQs);
        setSolvedIds(progress.solvedProblems || []);
        setProblemDetails(progress.problemDetails || {});
      } catch (err) {
        console.warn('Failed to load sidebar data:', err);
      }
    };
    loadSidebarData();

    loadQuestionData(authData);
  }, [questionId]);

  const loadQuestionData = async (authData) => {
    setLoading(true);
    setError(null);
    try {
      const qRaw = await fetchQuestion(questionId);
      const qData = normalizeQuestion(qRaw);
      setQuestion(qData);

      if (qData.scoring?.defaultScoringType) {
        setScoringType(qData.scoring.defaultScoringType);
      }

      // Detect default language
      const allowedLangs = qData.judging?.supportedLanguages || ['C', 'C++', 'Java', 'Python3'];
      const firstAllowed = allowedLangs[0] || 'Python3';
      const defaultLang = firstAllowed === 'Python3' ? 'python3' : firstAllowed === 'C++' ? 'cpp' : firstAllowed.toLowerCase();
      setLanguage(defaultLang);

      // Check if code is saved in local progress
      const progress = await getQuestionProgress(authData?.Email || authData?.email || '', questionId);
      if (progress && progress.submittedCode) {
        setCode(progress.submittedCode);
      } else {
        // Fallback to question boilerplate or free boilerplate
        const qBoilerplate = qData.boilerplates?.[defaultLang];
        setCode(qBoilerplate || FREE_BOILERPLATES[defaultLang] || '');
      }
    } catch (err) {
      setError('Could not load question: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Switch template
  useEffect(() => {
    if (!question) return;
    const template = question.boilerplates?.[language];
    setCode(template || FREE_BOILERPLATES[language] || '');
    setStdout('');
    setStderr('');
    setExitCode(null);
    setSubmitResults([]);
    setSubmitScore(null);
  }, [language, question]);

  const handleResetCode = () => {
    if (window.confirm('Reset code to default template?')) {
      const template = question.boilerplates?.[language];
      setCode(template || FREE_BOILERPLATES[language] || '');
    }
  };

  // Compile and run custom input or sample cases
  const handleRunCode = async () => {
    setIsRunning(true);
    setActiveConsoleTab('output');
    setStdout('Running execution...');
    setStderr('');
    setExitCode(null);
    setSampleResults([]);

    try {
      const bridgeLang = language === 'python3' ? 'python' : language;

      // If user selected useCustomInput, run only customInput
      if (useCustomInput || !question.sampleTestCases || question.sampleTestCases.length === 0) {
        const result = await desktopBridge.runDirectSandbox(bridgeLang, code, customInput);
        setStdout(result.stdout || (result.exit_code === 0 && !result.stderr ? 'Execution completed with no output.' : ''));
        setStderr(result.stderr || result.error || '');
        setExitCode(result.exit_code === undefined ? null : result.exit_code);
      } else {
        // Run against all sample test cases
        const results = [];
        const samples = question.sampleTestCases || [];
        for (let i = 0; i < samples.length; i++) {
          const tc = samples[i];
          const res = await desktopBridge.runDirectSandbox(bridgeLang, code, tc.input);
          
          const actualClean = (res.stdout || '').replace(/\r\n/g, '\n').trim();
          const expectedClean = (tc.expected || tc.expectedOutput || '').toString().replace(/\r\n/g, '\n').trim();
          const isPassed = actualClean === expectedClean && res.exit_code === 0;

          results.push({
            index: i + 1,
            input: tc.input,
            expected: expectedClean,
            actual: res.stdout || '',
            stderr: res.stderr || res.error || '',
            passed: isPassed,
            exitCode: res.exit_code
          });
        }
        setSampleResults(results);
        
        // Populate exitCode, stdout, stderr with last sample case for fallback
        const last = results[results.length - 1];
        if (last) {
          setStdout(last.actual);
          setStderr(last.stderr);
          setExitCode(last.exitCode);
        }
      }
    } catch (err) {
      setStderr(`Execution Failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Submit code against hidden test cases
  const handleSubmitCode = async () => {
    if (!question) return;
    setIsSubmitting(true);
    setActiveConsoleTab('results');
    setSubmitResults([]);
    setSubmitScore(null);

    const testCases = question.testCases?.hidden || [];
    const results = [];
    let passedCount = 0;
    let totalWeight = 0;
    let earnedWeight = 0;

    const email = user?.Email || user?.email || '';

    try {
      const bridgeLang = language === 'python3' ? 'python' : language;
      
      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const tcWeight = tc.weight || 10;
        totalWeight += tcWeight;

        const res = await desktopBridge.runDirectSandbox(bridgeLang, code, tc.input);
        
        const actualClean = (res.stdout || '').replace(/\r\n/g, '\n').trim();
        const expectedClean = (tc.expected || tc.expectedOutput || '').toString().replace(/\r\n/g, '\n').trim();
        const isPassed = actualClean === expectedClean && res.exit_code === 0;

        if (isPassed) {
          passedCount++;
          earnedWeight += tcWeight;
        }

        results.push({
          id: tc.id || `tc_${i + 1}`,
          passed: isPassed,
          input: tc.input,
          expected: expectedClean,
          actual: actualClean,
          stderr: res.stderr || res.error || ''
        });
      }

      setSubmitResults(results);

      // Compute score based on scoring type
      let score = 0;
      if (scoringType === 'FULL_SCORE') {
        score = (passedCount === testCases.length) ? 100 : 0;
      } else {
        score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
      }
      setSubmitScore(score);

      // Save progress
      if (email) {
        if (score === 100) {
          await markQuestionSolved(email, questionId, language, score);
          setSolvedIds(prev => [...new Set([...prev, questionId])]);
        } else {
          await markQuestionAttempted(email, questionId, language, score);
        }
        setProblemDetails(prev => ({
          ...prev,
          [questionId]: {
            ...prev[questionId],
            bestScore: Math.max(score, prev[questionId]?.bestScore || 0)
          }
        }));
      }
    } catch (err) {
      alert('Testing failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="psb-root" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="psb-spinner" style={{ width: '40px', height: '40px' }} />
        <p style={{ marginTop: '16px', color: '#94a3b8' }}>Loading workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="psb-root" style={{ justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
        <p style={{ color: '#f87171' }}>⚠️ {error}</p>
        <button className="psb-back-btn" onClick={() => navigate(-1)}>← Go Back</button>
      </div>
    );
  }

  const supportedLanguages = question.judging?.supportedLanguages || ['C', 'C++', 'Java', 'Python3'];

  // Filter sidebar questions
  const filteredSidebarQuestions = sidebarQuestions.filter(q => {
    const isSolved = solvedIds.includes(q.questionId);
    const isAttempted = Object.keys(problemDetails).includes(q.questionId) && !isSolved;
    const status = isSolved ? 'SOLVED' : isAttempted ? 'ATTEMPTED' : 'UNSOLVED';

    const matchesSearch = !sidebarSearch ||
      q.title?.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      q.questionId?.toLowerCase().includes(sidebarSearch.toLowerCase());
    const matchesDiff = sidebarDifficulty === 'All' || q.difficulty === sidebarDifficulty;
    const matchesCat = sidebarCategory === 'All' || q.category === sidebarCategory;
    const matchesStatus = sidebarStatus === 'All' || status === sidebarStatus;
    return matchesSearch && matchesDiff && matchesCat && matchesStatus;
  });

  const sidebarCategories = [...new Set(sidebarQuestions.map(q => q.category).filter(Boolean))];

  return (
    <div className="psb-root">
      {/* Header */}
      <div className="psb-header">
        <button className="psb-back-btn" onClick={() => navigate('/student/dashboard', { state: { tab: 'practice' } })}>🏠 Home</button>
        <button className="psb-back-btn" onClick={() => navigate(-1)}>← Back</button>
        
        {/* Toggle Sidebar Button */}
        <button 
          className={`psb-back-btn ${showSidebar ? 'active' : ''}`} 
          onClick={() => setShowSidebar(!showSidebar)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          title="Toggle Problem List"
        >
          <FaListUl /> {showSidebar ? 'Hide List' : 'Problem List'}
        </button>

        <div className="psb-title">
          {question.questionId} – {question.title}
        </div>
        <div className="psb-q-nav">
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="psb-lang-select"
          >
            {supportedLanguages.map(lang => {
              const val = lang === 'Python3' ? 'python3' : lang.toLowerCase();
              return <option key={val} value={val}>{lang}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="psb-main" ref={workspaceRef}>
        
        {/* Collapsible Problems List Sidebar */}
        <div className={`psb-sidebar ${!showSidebar ? 'collapsed' : ''}`}>
          <div className="psb-sidebar-header">
            <div className="psb-sidebar-title-row">
              <span className="psb-sidebar-title">Problem List</span>
              <span className="psb-sidebar-solved-count">
                {solvedIds.length}/{sidebarQuestions.length} Solved
              </span>
            </div>
            <div className="psb-sidebar-search-wrap">
              <FaSearch className="psb-sidebar-search-icon" />
              <input 
                type="text" 
                placeholder="Search questions..." 
                value={sidebarSearch}
                onChange={e => setSidebarSearch(e.target.value)}
                className="psb-sidebar-search"
              />
            </div>
            {/* Filter Row */}
            <div className="psb-sidebar-filters">
              <select
                value={sidebarDifficulty}
                onChange={e => setSidebarDifficulty(e.target.value)}
                className="psb-sidebar-filter-select"
              >
                <option value="All">All Difficulty</option>
                <option value="Beginner">Beginner</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
              <select
                value={sidebarStatus}
                onChange={e => setSidebarStatus(e.target.value)}
                className="psb-sidebar-filter-select"
              >
                <option value="All">All Status</option>
                <option value="SOLVED">✅ Solved</option>
                <option value="ATTEMPTED">🟡 Attempted</option>
                <option value="UNSOLVED">○ Unsolved</option>
              </select>
              <select
                value={sidebarCategory}
                onChange={e => setSidebarCategory(e.target.value)}
                className="psb-sidebar-filter-select"
              >
                <option value="All">All Topics</option>
                {sidebarCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>
          <div className="psb-sidebar-list">
            {filteredSidebarQuestions.map((q, idx) => {
              const isActive = q.questionId === questionId;
              const isSolved = solvedIds.includes(q.questionId);
              const isAttempted = Object.keys(problemDetails).includes(q.questionId) && !isSolved;
              const status = isSolved ? 'SOLVED' : isAttempted ? 'ATTEMPTED' : 'UNSOLVED';

              return (
                <div 
                  key={q.questionId}
                  className={`psb-sidebar-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(`/student/practice/solve/${q.questionId}`, { state: { scoringType } })}
                >
                  <span className="psb-sidebar-item-status">
                    {status === 'SOLVED' ? '✅' : status === 'ATTEMPTED' ? '🟡' : '○'}
                  </span>
                  <span className="psb-sidebar-item-title">
                    {idx + 1}. {q.title}
                  </span>
                  <span className={`psb-sidebar-item-diff ${q.difficulty?.toLowerCase() || 'easy'}`}>
                    {q.difficulty || 'Easy'}
                  </span>
                </div>
              );
            })}
            {filteredSidebarQuestions.length === 0 && (
              <div style={{ color: 'var(--ps-text-dim)', textAlign: 'center', padding: '20px', fontSize: '13px' }}>
                No questions match search.
              </div>
            )}
          </div>
        </div>

        {/* Left Side - Description */}
        <div className="psb-problem-panel" style={{ width: `${leftWidth}%` }}>
          <div className="psb-problem-tabs">
            <div className={`psb-problem-tab ${activeLeftTab === 'description' ? 'active' : ''}`} onClick={() => setActiveLeftTab('description')}>
              Problem Description
            </div>
            <div className={`psb-problem-tab ${activeLeftTab === 'solution' ? 'active' : ''}`} onClick={() => setActiveLeftTab('solution')}>
              Editorial Solution
            </div>
          </div>

          <div className="psb-problem-content">
            {activeLeftTab === 'description' ? (
              <>
                <h2 className="psb-problem-title">{question.title}</h2>
                <div className="psb-q-badges">
                  <span className={`psb-badge ${question.metadata?.difficulty?.toLowerCase() || 'easy'}`}>
                    {question.metadata?.difficulty}
                  </span>
                  <span className="psb-badge cat">{question.metadata?.category}</span>
                  {question.metadata?.isPremium && <span className="psb-badge premium">⭐ Premium</span>}
                </div>

                <div className="psb-section-label">Problem Statement</div>
                <div className="psb-problem-text">{question.content?.problemStatement}</div>

                <div className="psb-section-label">Input Format</div>
                <div className="psb-problem-text">{question.content?.inputFormat || 'Read standard input.'}</div>

                <div className="psb-section-label">Output Format</div>
                <div className="psb-problem-text">{question.content?.outputFormat || 'Print standard output.'}</div>

                {question.content?.constraints && question.content.constraints.length > 0 && (
                  <>
                    <div className="psb-section-label">Constraints</div>
                    <ul className="psb-constraints-list">
                      {question.content.constraints.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </>
                )}

                {question.content?.sampleTestCases && question.content.sampleTestCases.map((s, i) => (
                  <div className="psb-sample" key={i}>
                    <div className="psb-sample-label">Sample Case {i + 1}</div>
                    <div className="psb-sample-row">
                      <div className="psb-sample-col">
                        <label>Input</label>
                        <pre>{s.input || '(empty)'}</pre>
                      </div>
                      <div className="psb-sample-col">
                        <label>Expected Output</label>
                        <pre>{s.output}</pre>
                      </div>
                    </div>
                    {s.explanation && (
                      <div className="psb-sample-explanation">
                        <strong>Explanation:</strong> {s.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <>
                <h3 style={{ marginBottom: '12px' }}>Editorial Solutions</h3>
                {question.solution?.approach ? (
                  <>
                    <div className="psb-section-label">Approach</div>
                    <div className="psb-problem-text">{question.solution.approach}</div>
                    <div className="psb-section-label">Complexity</div>
                    <div className="psb-problem-text">
                      Time Complexity: <code>{question.solution.timeComplexity || 'O(N)'}</code>
                      <br />
                      Space Complexity: <code>{question.solution.spaceComplexity || 'O(1)'}</code>
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--ps-text-dim)' }}>Editorial solution details not supplied for this question.</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Drag Divider Horizontal */}
        <div className="psb-resizer-h" onMouseDown={startHorizontalDrag} />

        {/* Right Side - Monaco Editor + Outputs */}
        <div className="psb-editor-panel" ref={rightPanelRef} style={{ width: `${100 - leftWidth}%` }}>
          <div className="psb-editor-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="psb-run-btn" onClick={handleRunCode} disabled={isRunning || isSubmitting}>
              {isRunning ? <div className="psb-spinner" /> : <FaPlay />} Run Code
            </button>
            <button className="psb-submit-btn" onClick={handleSubmitCode} disabled={isRunning || isSubmitting}>
              {isSubmitting ? <div className="psb-spinner" /> : <FaCheck />} Submit Answers
            </button>
            <button className="psb-reset-btn" onClick={handleResetCode}>
              <FaUndo /> Reset
            </button>
          </div>

          <div className="psb-editor-wrap" style={{ height: `${editorHeight}%` }}>
            <Editor
              height="100%"
              language={MONACO_LANG_MAP[language] || 'cpp'}
              theme="vs-dark"
              value={code}
              onChange={val => setCode(val || '')}
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4
              }}
            />
          </div>

          {/* Drag Divider Vertical */}
          <div className="psb-resizer-v" onMouseDown={startVerticalDrag} />

          {/* Console / Outputs */}
          <div className="psb-results" style={{ height: `${100 - editorHeight}%`, maxHeight: 'none' }}>
            <div className="psb-results-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span className={`psb-problem-tab ${activeConsoleTab === 'input' ? 'active' : ''}`} onClick={() => setActiveConsoleTab('input')}>
                  Custom Input
                </span>
                <span className={`psb-problem-tab ${activeConsoleTab === 'output' ? 'active' : ''}`} onClick={() => setActiveConsoleTab('output')}>
                  Run Output
                </span>
                <span className={`psb-problem-tab ${activeConsoleTab === 'results' ? 'active' : ''}`} onClick={() => setActiveConsoleTab('results')}>
                  Submit Results ({submitResults.length})
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ps-text-dim)', cursor: 'pointer', userSelect: 'none', marginRight: '10px' }}>
                <input 
                  type="checkbox" 
                  checked={useCustomInput} 
                  onChange={(e) => {
                    setUseCustomInput(e.target.checked);
                    if (e.target.checked) {
                      setActiveConsoleTab('input');
                    }
                  }}
                />
                <span>Run custom testcase</span>
              </label>
            </div>

            <div style={{ padding: '12px', height: 'calc(100% - 40px)', overflowY: 'auto' }}>
              {activeConsoleTab === 'input' && (
                <textarea
                  style={{
                    width: '100%',
                    height: 'calc(100% - 10px)',
                    minHeight: '80px',
                    background: '#0a0a14',
                    border: '1px solid var(--ps-border)',
                    borderRadius: '8px',
                    color: 'white',
                    padding: '8px',
                    fontFamily: 'var(--ps-mono)',
                    fontSize: '13px',
                    resize: 'none',
                    outline: 'none'
                  }}
                  placeholder="Provide input arguments to inject into standard input (stdin)..."
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                />
              )}

              {activeConsoleTab === 'output' && (
                <div style={{ background: '#0a0a14', padding: '12px', borderRadius: '8px', minHeight: '80px', overflowY: 'auto' }}>
                  {isRunning ? (
                    <div style={{ color: 'var(--ps-text-dim)' }}>Executing sandbox environment...</div>
                  ) : sampleResults && sampleResults.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {sampleResults.map((res) => (
                        <div key={res.index} style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '8px',
                          padding: '12px',
                          background: 'rgba(255,255,255,0.01)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <strong style={{ fontSize: '14px' }}>Sample Case {res.index}</strong>
                            <span style={{
                              color: res.passed ? 'var(--ps-success)' : 'var(--ps-error)',
                              fontWeight: 'bold',
                              fontSize: '13px'
                            }}>
                              {res.passed ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                            <div>
                              <div style={{ color: 'var(--ps-text-dim)', marginBottom: '4px' }}>Input:</div>
                              <pre style={{ background: '#05050a', padding: '6px', borderRadius: '4px', margin: 0, fontFamily: 'var(--ps-mono)' }}>{res.input || '(empty)'}</pre>
                            </div>
                            <div>
                              <div style={{ color: 'var(--ps-text-dim)', marginBottom: '4px' }}>Expected Output:</div>
                              <pre style={{ background: '#05050a', padding: '6px', borderRadius: '4px', margin: 0, fontFamily: 'var(--ps-mono)' }}>{res.expected}</pre>
                            </div>
                          </div>
                          <div style={{ marginTop: '8px', fontSize: '12px' }}>
                            <div style={{ color: 'var(--ps-text-dim)', marginBottom: '4px' }}>Actual Output:</div>
                            <pre style={{
                              background: '#05050a',
                              padding: '6px',
                              borderRadius: '4px',
                              margin: 0,
                              fontFamily: 'var(--ps-mono)',
                              color: res.passed ? '#e2e8f0' : 'var(--ps-error)'
                            }}>{res.actual || '(no output)'}</pre>
                          </div>
                          {res.stderr && (
                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ps-error)' }}>
                              <strong>Error:</strong>
                              <pre style={{ whiteSpace: 'pre-wrap', background: '#05050a', padding: '6px', borderRadius: '4px', marginTop: '4px', fontFamily: 'var(--ps-mono)' }}>{res.stderr}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : stderr ? (
                    <div style={{ color: 'var(--ps-error)' }}>
                      <strong>Compile / Runtime Error:</strong>
                      <pre style={{ whiteSpace: 'pre-wrap', marginTop: '6px', fontFamily: 'var(--ps-mono)' }}>{stderr}</pre>
                    </div>
                  ) : stdout ? (
                    <div>
                      <div style={{ color: 'var(--ps-success)', fontWeight: 'bold' }}>Exit Code: {exitCode}</div>
                      <pre style={{ whiteSpace: 'pre-wrap', marginTop: '6px', fontFamily: 'var(--ps-mono)', color: '#e2e8f0' }}>{stdout}</pre>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--ps-text-dim)' }}>Click "Run Code" to compile standard inputs.</div>
                  )}
                </div>
              )}

              {activeConsoleTab === 'results' && (
                <div>
                  {isSubmitting ? (
                    <div style={{ color: 'var(--ps-text-dim)', textAlign: 'center', padding: '20px' }}>
                      <div className="psb-spinner" style={{ marginRight: '8px' }} /> Checking all hidden test cases...
                    </div>
                  ) : submitResults.length === 0 ? (
                    <div style={{ color: 'var(--ps-text-dim)' }}>Click "Submit Answers" to validate compilation against test suites.</div>
                  ) : (
                    <div>
                      <div className={`psb-score-banner ${submitScore === 100 ? 'pass' : submitScore > 0 ? 'partial' : 'fail'}`}>
                        {submitScore === 100 ? '🎉 All Test Cases Passed!' : `🟡 Partial Score: ${submitScore}/100`}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', maxHeight: '150px', overflowY: 'auto' }}>
                        {submitResults.map((tr, i) => (
                          <div key={tr.id} style={{
                            display: 'flex', justifyContent: 'space-between',
                            padding: '8px 12px', background: '#0a0a14', borderRadius: '6px',
                            borderLeft: `3px solid ${tr.passed ? 'var(--ps-success)' : 'var(--ps-error)'}`
                          }}>
                            <span>Test Case {i + 1} ({tr.id})</span>
                            <span style={{ color: tr.passed ? 'var(--ps-success)' : 'var(--ps-error)', fontWeight: 'bold' }}>
                              {tr.passed ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PracticeSandbox;
