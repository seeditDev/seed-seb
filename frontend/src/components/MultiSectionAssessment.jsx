/**
 * MultiSectionAssessment.jsx
 *
 * MONOLITHIC self-contained component for multi-section exams.
 * Contains its own MCQ section renderer and Coding section renderer.
 * NO dependency on MCQPage.jsx or CodingAssessmentSandbox.jsx.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import {
  FaClock, FaCheckCircle, FaLock, FaBookOpen, FaCode, FaChevronRight,
  FaArrowLeft, FaArrowRight, FaBookmark, FaPlay, FaCheck, FaTimes,
  FaUndo, FaList, FaSearch, FaChevronLeft, FaLightbulb, FaExclamationTriangle
} from 'react-icons/fa';
import '../styles/MultiSectionAssessment.css';
import '../styles/MCQPage.css';
import '../styles/CodingAssessmentSandbox.css';
import { db } from '../firebase-config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { supabase } from '../supabaseClient';
import desktopBridge from '../utils/desktopBridge';

// ─── Helpers ────────────────────────────────────────────────────────────────

const slugify = (val = '') =>
  val.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';

const isRunningInPyQt = () =>
  navigator.userAgent.includes('QtWebEngine') || navigator.userAgent.includes('QtWebKit');

const formatTime = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatSecs = (val) => {
  const m = Math.floor(val / 60);
  const s = val % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

/**
 * Normalises a raw coding question from JSON into the internal schema.
 */
const normalizeQuestion = (q) => {
  if (!q) return q;
  const id = q.questionId || q.id || '';
  const title = q.title || '';
  const description = q.content?.problemStatement || q.description || '';
  const instructions = q.content?.inputFormat || q.instructions || '';
  const constraints = Array.isArray(q.content?.constraints)
    ? q.content.constraints.join('\n')
    : (q.constraints || '');

  const boilerplates = { ...(q.boilerplates || {}) };
  if (q.solution?.code) {
    const c = q.solution.code;
    if (c.C) boilerplates.c = c.C;
    if (c['C++']) boilerplates.cpp = c['C++'];
    if (c.Java) boilerplates.java = c.Java;
    if (c.Python3) { boilerplates.python = c.Python3; }
    if (c.JavaScript) boilerplates.javascript = c.JavaScript;
  }

  const testCases = (q.content?.sampleTestCases || []).map(tc => ({
    input: tc.input,
    expected: tc.expected || tc.expectedOutput
  }));

  let hidden = [];
  if (q.testCases?.hidden) {
    hidden = q.testCases.hidden.map(tc => ({ id: tc.id || tc.label, input: tc.input, expected: tc.expectedOutput || tc.expected }));
  } else if (Array.isArray(q.testCases)) {
    hidden = q.testCases.map(tc => ({ id: tc.id || '', input: tc.input, expected: tc.expected }));
  }

  return { ...q, id, title, description, instructions, constraints, boilerplates, testCases, hiddenTests: hidden };
};

const FREE_BOILERPLATES = {
  c: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`,
  python: `print("Hello, World!")`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`
};

// ─── MCQ Section Renderer ────────────────────────────────────────────────────

const MCQSectionView = ({ sectionData, secTimer, settings = {}, onSectionSubmit }) => {
  const questions = sectionData?.questions || [];
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [bookmarked, setBookmarked] = useState([]);
  const [lockedQuestions, setLockedQuestions] = useState([]);
  const [qTimerRemaining, setQTimerRemaining] = useState(settings.questionTimer || 0);
  const [timeSpentPerQ, setTimeSpentPerQ] = useState({});
  const [showReview, setShowReview] = useState(false);

  const onSubmitRef = useRef(onSectionSubmit);
  useEffect(() => { onSubmitRef.current = onSectionSubmit; }, [onSectionSubmit]);

  // Auto-submit when section timer expires
  useEffect(() => {
    if (secTimer <= 0) {
      handleSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer]);

  // Per-question time tracker
  useEffect(() => {
    const t = setInterval(() => {
      setTimeSpentPerQ(prev => ({ ...prev, [questionIndex]: (prev[questionIndex] || 0) + 1 }));
    }, 1000);
    return () => clearInterval(t);
  }, [questionIndex]);

  // Per-question lock timer
  useEffect(() => {
    if (settings.questionTimer > 0) {
      setQTimerRemaining(settings.questionTimer);
    }
  }, [questionIndex, settings.questionTimer]);

  useEffect(() => {
    if (settings.questionTimer <= 0) return;
    const t = setInterval(() => {
      setQTimerRemaining(prev => {
        if (prev <= 1) {
          setLockedQuestions(l => [...l, questionIndex]);
          if (questionIndex + 1 < questions.length) {
            setQuestionIndex(q => q + 1);
          } else {
            handleSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex, settings.questionTimer, questions.length]);

  const handleSubmit = useCallback(() => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] !== undefined && q.options[answers[i]] === q.correctAnswer) correct++;
    });
    const total = questions.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    if (onSubmitRef.current) {
      onSubmitRef.current({
        answers,
        timeSpentPerQ,
        score: correct,
        totalQuestions: total,
        percentage: pct,
        violationCount: 0,
        violations: []
      });
    }
  }, [answers, timeSpentPerQ, questions]);

  const handleSelectOption = (optIdx) => {
    if (lockedQuestions.includes(questionIndex)) return;
    setAnswers(prev => ({ ...prev, [questionIndex]: optIdx }));
  };

  const navigate = (dir) => {
    if (dir === 'prev' && questionIndex > 0 && !settings.forwardOnly) setQuestionIndex(q => q - 1);
    if (dir === 'next' && questionIndex < questions.length - 1) setQuestionIndex(q => q + 1);
  };

  const renderTextWithCode = (text) => {
    if (!text) return null;
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        return <pre key={i} className="mcq-code-snippet"><code>{part.slice(3, -3).trim()}</code></pre>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  if (questions.length === 0) {
    return (
      <div className="msa-loading">
        <div className="msa-spinner" />
        <p>Loading MCQ questions...</p>
      </div>
    );
  }

  const q = questions[questionIndex];
  const total = questions.length;
  const attempted = Object.keys(answers).length;
  const pct = total > 0 ? Math.round((attempted / total) * 100) : 0;
  const isLocked = lockedQuestions.includes(questionIndex);

  return (
    <div className="mcq-test-content" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
      {/* Header */}
      <div className="mcq-test-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
        <div className="mcq-test-info">
          <h1 style={{ fontSize: '1.1rem', color: '#f8fafc', margin: 0 }}>{sectionData?.name || 'MCQ Section'}</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{attempted} / {total} Answered</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '5px 12px', borderRadius: '20px', fontSize: '0.85rem', color: '#10b981', fontWeight: '600'
          }}>
            <FaClock />
            <span>{formatTime(secTimer)}</span>
          </div>
          {!settings.timerRestrictedSubmit && (
            <button
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}
              onClick={() => { if (window.confirm('Submit this section now? You cannot go back.')) handleSubmit(); }}
            >
              Submit Section
            </button>
          )}
        </div>
      </div>

      <div className="mcq-workspace-layout" style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>
        {/* Main question area */}
        <div className="mcq-workspace-main" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {showReview ? (
            <div className="mcq-review-container">
              <h3 style={{ color: '#f8fafc', marginBottom: '20px' }}>Review Your Answers</h3>
              <div className="mcq-review-list">
                {questions.map((rq, idx) => (
                  <div key={idx} className="mcq-review-item">
                    <div className="mcq-review-header">
                      <span>Question {idx + 1}</span>
                      <span>{formatSecs(timeSpentPerQ[idx] || 0)}</span>
                    </div>
                    <div className="mcq-review-question">{renderTextWithCode(rq.question)}</div>
                    <div className="mcq-review-answer">
                      Your answer: {answers[idx] !== undefined ? rq.options[answers[idx]] : 'Not answered'}
                    </div>
                    <div className="mcq-review-actions">
                      <button onClick={() => { setQuestionIndex(idx); setShowReview(false); }}>Go to Question</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mcq-review-bottom-nav">
                <button className="mcq-nav-button" onClick={() => setShowReview(false)}>Back to Test</button>
                <button className="mcq-submit-button" onClick={handleSubmit}>Submit Section</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mcq-question-container">
                <div className="mcq-question-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <span className="mcq-question-number">Question {questionIndex + 1} of {total}</span>
                  {settings.questionTimer > 0 && (
                    <span style={{
                      fontSize: '0.8rem',
                      background: qTimerRemaining <= 10 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: qTimerRemaining <= 10 ? '#ef4444' : '#6366f1',
                      border: qTimerRemaining <= 10 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)',
                      padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold'
                    }}>
                      ⏳ Locks in: {qTimerRemaining}s
                    </span>
                  )}
                  <button
                    className={`mcq-bookmark-button ${bookmarked.includes(questionIndex) ? 'bookmarked' : ''}`}
                    onClick={() => setBookmarked(prev => prev.includes(questionIndex) ? prev.filter(x => x !== questionIndex) : [...prev, questionIndex])}
                    style={{ marginLeft: 'auto' }}
                  >
                    <FaBookmark />
                  </button>
                </div>

                {isLocked && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px 16px', color: '#ef4444', marginBottom: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaLock />
                    <span>This question's timer expired. Your answer is locked.</span>
                  </div>
                )}

                <div className="mcq-question-text">{renderTextWithCode(q.question)}</div>

                <div className="mcq-options">
                  {q.options.map((opt, oIdx) => (
                    <button
                      key={oIdx}
                      className={`mcq-option ${answers[questionIndex] === oIdx ? 'selected' : ''}`}
                      onClick={() => handleSelectOption(oIdx)}
                      disabled={isLocked}
                      style={isLocked ? { cursor: 'not-allowed', opacity: 0.8 } : {}}
                    >
                      <span className="mcq-option-letter">{String.fromCharCode(65 + oIdx)}</span>
                      <span className="mcq-option-text">{opt}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mcq-navigation" style={{ marginTop: '20px' }}>
                <button
                  className="mcq-nav-button"
                  onClick={() => navigate('prev')}
                  disabled={questionIndex === 0 || settings.forwardOnly || settings.questionTimer > 0}
                >
                  <FaArrowLeft /> Previous
                </button>
                <button
                  className="mcq-nav-button"
                  onClick={() => navigate('next')}
                  disabled={questionIndex === total - 1}
                >
                  Next <FaArrowRight />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="mcq-workspace-sidebar" style={{ width: '240px', background: '#1e293b', borderLeft: '1px solid #334155', overflowY: 'auto', padding: '16px' }}>
          {/* Progress */}
          <div className="mcq-sidebar-card">
            <h3 className="mcq-sidebar-title">Progress</h3>
            <div className="mcq-progress-container">
              <div className="mcq-progress-meta">
                <span>Answered</span><span>{pct}%</span>
              </div>
              <div className="mcq-progress-bar-outer">
                <div className="mcq-progress-bar-inner" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="mcq-stats-grid" style={{ marginTop: '10px' }}>
              <div className="mcq-stat-card-mini"><span>Done</span><span>{attempted}</span></div>
              <div className="mcq-stat-card-mini"><span>Left</span><span>{total - attempted}</span></div>
            </div>
          </div>

          {/* Question map */}
          <div className="mcq-sidebar-card" style={{ marginTop: '12px' }}>
            <h3 className="mcq-sidebar-title">Question Map</h3>
            <div className="mcq-question-nav-grid">
              {questions.map((_, idx) => {
                let cls = 'mcq-question-nav-item';
                if (answers[idx] !== undefined) cls += ' attempted';
                if (questionIndex === idx) cls += ' current';
                if (bookmarked.includes(idx)) cls += ' bookmarked';
                return (
                  <button
                    key={idx}
                    className={cls}
                    onClick={() => {
                      if (settings.forwardOnly || settings.questionTimer > 0) return;
                      setQuestionIndex(idx);
                      setShowReview(false);
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {!settings.timerRestrictedSubmit && (
            <button
              className="mcq-sidebar-submit-btn"
              style={{ marginTop: '16px', width: '100%' }}
              onClick={() => setShowReview(true)}
            >
              Review & Submit
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Coding Section Renderer ──────────────────────────────────────────────────

const CodingSectionView = ({ sectionData, secTimer, settings = {}, onSectionSubmit }) => {
  const challenges = sectionData?.questions || [];
  const [selectedChallenge, setSelectedChallenge] = useState(challenges[0] || null);
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [activeTab, setActiveTab] = useState('input');
  const [activeLeftTab, setActiveLeftTab] = useState('description');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [exitCode, setExitCode] = useState(null);
  const [testResults, setTestResults] = useState([]);
  const [completedChallenges, setCompletedChallenges] = useState({});
  const [lockedChallenges, setLockedChallenges] = useState([]);
  const [qTimerRemaining, setQTimerRemaining] = useState(0);
  const [timeSpentPerQ, setTimeSpentPerQ] = useState({});
  const [customNotice, setCustomNotice] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const onSubmitRef = useRef(onSectionSubmit);
  useEffect(() => { onSubmitRef.current = onSectionSubmit; }, [onSectionSubmit]);

  const currentChallengeIndex = challenges.findIndex(ch => ch.id === selectedChallenge?.id);

  // Sync boilerplate when challenge or language changes
  useEffect(() => {
    if (!selectedChallenge) return;
    const savedKey = `code_${selectedChallenge.id}_${language}`;
    const saved = localStorage.getItem(savedKey);
    if (saved) {
      setCode(saved);
    } else {
      setCode(selectedChallenge.boilerplates?.[language] || FREE_BOILERPLATES[language] || '');
    }
    setStdout('');
    setStderr('');
    setExitCode(null);
    setTestResults([]);
    setActiveTab('input');
  }, [selectedChallenge, language]);

  // Auto-submit when section timer expires
  useEffect(() => {
    if (secTimer <= 0) {
      doSectionSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer]);

  // Per-question lock timer
  useEffect(() => {
    if (!settings.questionTimers || settings.questionTimers.length === 0 || !selectedChallenge) return;
    const activeTimer = settings.questionTimers[currentChallengeIndex] || 0;
    setQTimerRemaining(activeTimer);
  }, [selectedChallenge, currentChallengeIndex, settings.questionTimers]);

  useEffect(() => {
    if (!settings.questionTimers || settings.questionTimers.length === 0 || !selectedChallenge) return;
    const activeTimer = settings.questionTimers[currentChallengeIndex] || 0;
    if (activeTimer <= 0) return;
    const t = setInterval(() => {
      setQTimerRemaining(prev => {
        if (prev <= 1) {
          setLockedChallenges(l => [...l, selectedChallenge.id]);
          if (currentChallengeIndex + 1 < challenges.length) {
            setSelectedChallenge(challenges[currentChallengeIndex + 1]);
          } else {
            doSectionSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChallenge, currentChallengeIndex, settings.questionTimers, challenges]);

  // Per-question time tracking
  useEffect(() => {
    if (!selectedChallenge) return;
    const t = setInterval(() => {
      setTimeSpentPerQ(prev => ({ ...prev, [selectedChallenge.id]: (prev[selectedChallenge.id] || 0) + 1 }));
    }, 1000);
    return () => clearInterval(t);
  }, [selectedChallenge]);

  // Autosave code every 30s
  useEffect(() => {
    if (!selectedChallenge || !code) return;
    const t = setInterval(() => {
      localStorage.setItem(`code_${selectedChallenge.id}_${language}`, code);
    }, 30000);
    return () => clearInterval(t);
  }, [selectedChallenge, code, language]);

  const doSectionSubmit = useCallback(() => {
    const allAnswers = {};
    challenges.forEach(ch => {
      const savedKey = `code_${ch.id}_${language}`;
      const saved = localStorage.getItem(savedKey);
      if (saved) allAnswers[ch.id] = saved;
      else if (ch.id === selectedChallenge?.id) allAnswers[ch.id] = code;
    });
    if (onSubmitRef.current) {
      onSubmitRef.current({
        answers: allAnswers,
        timeSpentPerQ,
        completed: completedChallenges
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges, language, code, selectedChallenge, timeSpentPerQ, completedChallenges]);

  const handleRunCode = async () => {
    if (!selectedChallenge) return;
    setIsRunning(true);
    setActiveTab('results');
    setTestResults([]);
    setStdout('Running tests against sample cases...');
    setStderr('');
    setExitCode(null);
    if (selectedChallenge) localStorage.setItem(`code_${selectedChallenge.id}_${language}`, code);

    if (!isRunningInPyQt()) {
      setIsRunning(false);
      setActiveTab('output');
      setStdout('');
      setStderr('⚠️ Code execution requires the SEED-IT Desktop App. Your code is saved and can be submitted from within the desktop app.');
      setExitCode(1);
      return;
    }
    try {
      const stdinPayload = JSON.stringify({ questionId: selectedChallenge.id, stdin: customInput });
      const results = await desktopBridge.runCode(language, code, stdinPayload);
      setTestResults(results.map(r => ({
        index: r.caseNumber, input: r.input, expected: r.expected,
        actual: r.actual, passed: r.passed, stderr: r.stderr || r.error || ''
      })));
    } catch (err) {
      setStderr(`Execution Failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleTestCode = async () => {
    if (!selectedChallenge) return;
    setIsTesting(true);
    setActiveTab('results');
    setTestResults([]);
    const savedKey = `code_${selectedChallenge.id}_${language}`;
    localStorage.setItem(savedKey, code);

    if (!isRunningInPyQt()) {
      setIsTesting(false);
      setCustomNotice({ title: 'Desktop App Required', message: 'Code submission requires the SEED-IT Desktop App. Your code has been saved locally.', type: 'warning' });
      return;
    }
    try {
      await desktopBridge.saveAnswer(selectedChallenge.id, code);
      const result = await desktopBridge.submitCode(language, code, selectedChallenge.id);
      if (result.error) { setStderr(result.error); return; }
      setTestResults(result.testCases.map(tc => ({
        index: tc.caseNumber, input: 'Hidden Test Case', expected: 'Hidden Expected Output',
        actual: tc.passed ? 'Match' : 'Mismatch/Error', passed: tc.passed, stderr: tc.error || ''
      })));
      if (result.score === 100) {
        localStorage.setItem(`q_completed_${selectedChallenge.id}`, 'true');
        setCompletedChallenges(prev => ({ ...prev, [selectedChallenge.id]: true }));
      }
      setCustomNotice({
        title: 'Evaluation Score',
        message: `Score: ${result.score}% (${result.passed}/${result.total} passed). Answer saved.`,
        type: result.score === 100 ? 'success' : 'warning'
      });
    } catch (err) {
      setCustomNotice({ title: 'Evaluation Failed', message: `Execution failed: ${err.message}`, type: 'error' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetCode = () => {
    if (window.confirm('Reset code to default template?')) {
      setCode(selectedChallenge?.boilerplates?.[language] || FREE_BOILERPLATES[language] || '');
    }
  };

  const monacoLanguage = language === 'cpp' ? 'cpp' : language === 'c' ? 'c' : language === 'java' ? 'java' : 'python';
  const isChLocked = selectedChallenge ? lockedChallenges.includes(selectedChallenge.id) : false;

  const handlePrev = () => {
    if (settings.forwardOnly || (settings.questionTimers && settings.questionTimers.length > 0)) return;
    if (currentChallengeIndex > 0) setSelectedChallenge(challenges[currentChallengeIndex - 1]);
  };
  const handleNext = () => {
    if (currentChallengeIndex < challenges.length - 1 && currentChallengeIndex !== -1) {
      setSelectedChallenge(challenges[currentChallengeIndex + 1]);
    }
  };

  return (
    <div
      className="sandbox-fullscreen-container"
      onCopy={e => { e.preventDefault(); setCustomNotice({ title: 'Action Blocked', message: 'Copying is disabled.', type: 'error' }); }}
      onPaste={e => { e.preventDefault(); setCustomNotice({ title: 'Action Blocked', message: 'Pasting is disabled.', type: 'error' }); }}
      onCut={e => { e.preventDefault(); setCustomNotice({ title: 'Action Blocked', message: 'Cutting is disabled.', type: 'error' }); }}
    >
      {/* Submit confirm overlay */}
      {showSubmitConfirm && (
        <div className="proctor-start-overlay" style={{ zIndex: 10005 }}>
          <div className="proctor-start-card" style={{ border: '1.5px solid #ef4444' }}>
            <h2>Submit Section?</h2>
            <p style={{ color: '#d1d5db', lineHeight: '1.6', margin: '15px 0' }}>
              Are you sure you want to submit this coding section? You cannot go back.
            </p>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '25px' }}>
              <button className="action-btn" style={{ background: '#333', color: '#ccc', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setShowSubmitConfirm(false)}>Cancel</button>
              <button className="action-btn run-btn" style={{ background: '#ef4444', color: '#fff', padding: '10px 25px', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => { setShowSubmitConfirm(false); doSectionSubmit(); }}>Confirm &amp; Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sandbox-workspace-header">
        <div className="header-left">
          <img src="https://raw.githubusercontent.com/seeditDev/SEED-Website/f3cee9002410a00df4da7bea636ac9fbc4c312ca/Plugins/SEED_Logo.webp" alt="SEED Logo" className="header-logo" />
          <button className="problem-list-toggle-btn" onClick={() => setIsDrawerOpen(true)}>
            <FaList /> Problem List
          </button>
          <div className="challenge-nav-buttons">
            <button onClick={handlePrev} disabled={currentChallengeIndex <= 0 || (settings.questionTimers && settings.questionTimers.length > 0)} className="nav-arrow-btn" title="Previous Challenge"><FaChevronLeft /></button>
            <button onClick={handleNext} disabled={currentChallengeIndex >= challenges.length - 1 || currentChallengeIndex === -1} className="nav-arrow-btn" title="Next Challenge"><FaChevronRight /></button>
          </div>
          <div className="msa-timer-box" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600', marginLeft: '15px', color: '#10b981' }}>
            <FaClock />
            <span>Time: {formatTime(secTimer)}</span>
          </div>
        </div>

        <div className="header-center-actions">
          <button className="header-run-btn" onClick={handleRunCode} disabled={isRunning || isTesting || isChLocked}>
            <FaPlay /> Run
          </button>
          <button className="header-submit-btn" onClick={handleTestCode} disabled={isRunning || isTesting || isChLocked}>
            <FaCheck /> Submit
          </button>
          {!settings.timerRestrictedSubmit && (
            <button
              className="header-submit-btn"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', marginLeft: '12px', border: 'none' }}
              onClick={() => setShowSubmitConfirm(true)}
              disabled={isRunning || isTesting}
            >
              Submit Section
            </button>
          )}
        </div>

        <div className="header-right">
          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
            {currentChallengeIndex + 1} / {challenges.length}
          </span>
        </div>
      </header>

      {/* Problem list drawer */}
      <div className={`sandbox-drawer-overlay ${isDrawerOpen ? 'open' : ''}`} onClick={() => setIsDrawerOpen(false)}>
        <div className="sandbox-drawer-content" onClick={e => e.stopPropagation()}>
          <div className="drawer-header">
            <h3>Problem List</h3>
            <button className="close-drawer-btn" onClick={() => setIsDrawerOpen(false)}><FaTimes /></button>
          </div>
          <div className="drawer-search-wrapper">
            <FaSearch className="search-icon" />
            <input type="text" placeholder="Search questions..." value={drawerSearch} onChange={e => setDrawerSearch(e.target.value)} className="drawer-search-input" />
          </div>
          <div className="drawer-challenges-list">
            {challenges.filter(ch => ch.title.toLowerCase().includes(drawerSearch.toLowerCase())).map(ch => (
              <button
                key={ch.id}
                className={`drawer-challenge-item ${selectedChallenge?.id === ch.id ? 'active' : ''}`}
                onClick={() => {
                  if (settings.forwardOnly || (settings.questionTimers && settings.questionTimers.length > 0)) return;
                  setIsDrawerOpen(false);
                  setSelectedChallenge(ch);
                }}
              >
                <div className="ch-title-row">
                  <span>{ch.title}</span>
                  {completedChallenges[ch.id] && <FaCheck className="drawer-completed-icon" />}
                </div>
                <span className={`drawer-diff ${ch.difficulty?.toLowerCase() || ''}`}>{ch.difficulty}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="sandbox-wrapper">
        <div className="sandbox-layout">
          {/* Left — problem panel */}
          {selectedChallenge && (
            <div className="problem-panel">
              <div className="problem-tabs-header">
                {['description', 'editorial', 'solutions', 'submissions'].map(tab => (
                  <button key={tab} className={`tab-link ${activeLeftTab === tab ? 'active' : ''}`} onClick={() => setActiveLeftTab(tab)}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div className="problem-tab-content">
                {activeLeftTab === 'description' && (
                  <div className="problem-content">
                    <h2 className="prob-title">{selectedChallenge.title}</h2>
                    <div className="prob-meta">
                      <span className={`diff-badge ${selectedChallenge.difficulty?.toLowerCase() || ''}`}>{selectedChallenge.difficulty}</span>
                      {selectedChallenge.constraints && <span className="constraint-badge">{selectedChallenge.constraints}</span>}
                      {settings.questionTimers && settings.questionTimers.length > 0 && (
                        <span className="constraint-badge" style={{ background: qTimerRemaining <= 60 ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)', color: qTimerRemaining <= 60 ? '#ef4444' : '#6366f1', border: qTimerRemaining <= 60 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(99,102,241,0.3)', fontWeight: 'bold' }}>
                          ⏳ Locks in: {Math.floor(qTimerRemaining / 60)}:{(qTimerRemaining % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>
                    {isChLocked && (
                      <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', color: '#ef4444', marginBottom: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaLock /><span>This question's timer has expired. The sandbox is locked.</span>
                      </div>
                    )}
                    <div className="prob-section"><p>{selectedChallenge.description}</p></div>
                    {selectedChallenge.instructions && <div className="prob-section"><h4>Instructions</h4><p className="instructions-txt">{selectedChallenge.instructions}</p></div>}
                    {selectedChallenge.testCases && selectedChallenge.testCases.length > 0 && (
                      <div className="prob-section">
                        <h4>Example Test Case</h4>
                        <div className="example-block">
                          <strong>Input:</strong><pre>{selectedChallenge.testCases[0].input || '(None)'}</pre>
                          <strong>Expected Output:</strong><pre>{selectedChallenge.testCases[0].expected}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {activeLeftTab === 'editorial' && (
                  <div className="editorial-content">
                    <h3>Editorial / Solution Analysis</h3>
                    <div className="editorial-lock-card"><p>Complete the challenge to unlock editorial solutions.</p><div className="lock-icon-box">🔒</div></div>
                  </div>
                )}
                {activeLeftTab === 'solutions' && (
                  <div className="solutions-content">
                    <h3>Community Solutions</h3>
                    <p>Solve the problem to access community patterns.</p>
                  </div>
                )}
                {activeLeftTab === 'submissions' && (
                  <div className="submissions-content">
                    <h3>My Submissions</h3>
                    {completedChallenges[selectedChallenge.id] ? (
                      <div className="submission-history-item success">
                        <div className="sh-header"><span className="status">Accepted</span><span className="lang">Language: {language.toUpperCase()}</span></div>
                        <p>You have successfully solved this challenge!</p>
                      </div>
                    ) : (
                      <p className="no-submissions-txt">No accepted submissions found.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right — editor + console */}
          <div className="editor-console-panel">
            <div className="sandbox-network-tip">
              <FaLightbulb className="tip-icon" />
              <span><strong>Tip:</strong> If compiling inside campus Wi-Fi, connect to a <strong>mobile hotspot</strong> to bypass shared IP limits.</span>
            </div>
            <div className="editor-toolbar">
              <div className="toolbar-left">
                <select value={language} onChange={e => setLanguage(e.target.value)} className="toolbar-select">
                  <option value="cpp">C++ (GCC 10.2)</option>
                  <option value="c">C (GCC 10.2)</option>
                  <option value="python">Python 3.10</option>
                  <option value="java">Java 15</option>
                </select>
              </div>
              <div className="toolbar-right">
                <button className="toolbar-btn reset" onClick={handleResetCode}><FaUndo /> Reset</button>
              </div>
            </div>

            <div className="monaco-editor-container">
              <Editor
                height="100%"
                language={monacoLanguage}
                theme="vs-dark"
                value={code}
                onChange={v => setCode(v || '')}
                options={{
                  readOnly: isChLocked,
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono','Consolas',monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4
                }}
              />
            </div>

            <div className="console-panel">
              <div className="console-tabs-row">
                <div className="console-tabs">
                  <button className={`tab-btn ${activeTab === 'input' ? 'active' : ''}`} onClick={() => setActiveTab('input')}>Custom Input</button>
                  <button className={`tab-btn ${activeTab === 'output' ? 'active' : ''}`} onClick={() => setActiveTab('output')}>Console Output</button>
                  {selectedChallenge && (
                    <button className={`tab-btn ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
                      Test Cases ({selectedChallenge.testCases?.length || 0})
                    </button>
                  )}
                </div>
                <div className="console-actions">
                  <button className="action-btn run-btn" onClick={handleRunCode} disabled={isRunning || isTesting || isChLocked}>
                    <FaPlay /> {isRunning ? 'Running...' : 'Run'}
                  </button>
                  <button className="action-btn test-btn" onClick={handleTestCode} disabled={isRunning || isTesting || isChLocked}>
                    <FaCheck /> {isTesting ? 'Testing...' : 'Submit Tests'}
                  </button>
                </div>
              </div>

              <div className="console-tab-content">
                {activeTab === 'input' && (
                  <textarea className="console-textarea stdin" placeholder="Enter custom stdin..." value={customInput} onChange={e => setCustomInput(e.target.value)} />
                )}
                {activeTab === 'output' && (
                  <div className="console-output-box">
                    {isRunning ? (
                      <div className="console-loader"><div className="mini-spinner" /><span>Executing...</span></div>
                    ) : stderr ? (
                      <div className="execution-error"><h4>Runtime/Compilation Error:</h4><pre>{stderr}</pre></div>
                    ) : stdout ? (
                      <div className="execution-success"><h4>Exit Code: {exitCode}</h4><pre>{stdout}</pre></div>
                    ) : (
                      <p className="no-output-text">Click "Run" to view output.</p>
                    )}
                  </div>
                )}
                {activeTab === 'results' && (
                  <div className="test-results-container">
                    {isTesting ? (
                      <div className="console-loader"><div className="mini-spinner" /><span>Running test cases...</span></div>
                    ) : testResults.length === 0 ? (
                      <p className="no-output-text">Click "Submit Tests" to check validity.</p>
                    ) : (
                      <div className="test-cases-list">
                        <div className="test-overall-status">
                          {testResults.every(r => r.passed)
                            ? <span className="status-label all-passed"><FaCheck /> All Test Cases Passed!</span>
                            : <span className="status-label failed"><FaTimes /> Some Test Cases Failed</span>
                          }
                        </div>
                        {testResults.map(tr => (
                          <div key={tr.index} className={`test-case-card ${tr.passed ? 'passed' : 'failed'}`}>
                            <div className="test-case-header">
                              <h4>Test Case {tr.index}</h4>
                              <span className={`status-badge ${tr.passed ? 'passed' : 'failed'}`}>{tr.passed ? 'Passed' : 'Failed'}</span>
                            </div>
                            <div className="test-case-details">
                              <div className="tc-detail-col"><strong>Input:</strong><pre>{tr.input || '(None)'}</pre></div>
                              <div className="tc-detail-col"><strong>Expected:</strong><pre>{tr.expected}</pre></div>
                              <div className="tc-detail-col"><strong>Actual:</strong><pre>{tr.actual || '(No output)'}</pre></div>
                            </div>
                            {tr.stderr && <div className="tc-error-box"><strong>Stderr:</strong><pre>{tr.stderr}</pre></div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom notice overlay */}
      {customNotice && (
        <div className="proctor-start-overlay" style={{ zIndex: 10010 }}>
          <div className="proctor-start-card" style={{
            border: customNotice.type === 'error' ? '1.5px solid #ef4444' : customNotice.type === 'success' ? '1.5px solid #10b981' : '1.5px solid #f59e0b',
            boxShadow: customNotice.type === 'error' ? '0 0 15px rgba(239,68,68,0.3)' : customNotice.type === 'success' ? '0 0 15px rgba(16,185,129,0.3)' : '0 0 15px rgba(245,158,11,0.3)'
          }}>
            <h2 style={{ color: customNotice.type === 'error' ? '#ef4444' : customNotice.type === 'success' ? '#10b981' : '#f59e0b' }}>{customNotice.title}</h2>
            <p style={{ margin: '15px 0', color: '#d1d5db', lineHeight: '1.6' }}>{customNotice.message}</p>
            <button
              className="action-btn"
              style={{ background: customNotice.type === 'error' ? '#ef4444' : customNotice.type === 'success' ? '#10b981' : '#f59e0b', color: '#fff', padding: '10px 25px', marginTop: '15px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              onClick={() => { const fn = customNotice.onConfirm; setCustomNotice(null); if (fn) fn(); }}
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Orchestrator ────────────────────────────────────────────────────────

const MultiSectionAssessment = () => {
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Section coordinator state
  const [currentSecIdx, setCurrentSecIdx] = useState(-1);
  const [secStarted, setSecStarted] = useState(false);
  const [secTimer, setSecTimer] = useState(0);
  const [secCompleted, setSecCompleted] = useState({});
  const [sectionCountdown, setSectionCountdown] = useState(null);
  const [countdownSecIdx, setCountdownSecIdx] = useState(-1);

  // Data stores
  const [sectionData, setSectionData] = useState({});
  const [examResults, setExamResults] = useState({});
  const [examFinished, setExamFinished] = useState(false);

  // Crash recovery
  const [restoredProgress, setRestoredProgress] = useState(null);

  const timerRef = useRef(null);
  const examFinishedRef = useRef(examFinished);
  useEffect(() => { examFinishedRef.current = examFinished; }, [examFinished]);

  // ── Block back/forward navigation during exam
  useEffect(() => {
    window.history.pushState({ msaActive: true }, '');
    const handler = () => window.history.pushState({ msaActive: true }, '');
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // ── Initial load
  useEffect(() => {
    let authData = {};
    let assessmentData = null;
    try {
      authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
      assessmentData = JSON.parse(localStorage.getItem('multisectionAssessmentData') || 'null');
    } catch (e) {
      console.error('[MSA] Failed to parse localStorage:', e);
    }

    if (!authData?.Email || !assessmentData) {
      navigate('/student/dashboard');
      return;
    }

    setUser(authData);
    setAssessment(assessmentData);

    // Crash recovery
    const progressKey = `msaProgress_${assessmentData.id}`;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(progressKey) || 'null'); } catch (_) {}
    if (saved && saved.email === authData.Email) {
      console.log('[MSA] Restoring partial progress');
      setExamResults(saved.examResults || {});
      setSecCompleted(saved.completedSections || {});
      setRestoredProgress(saved);
    }

    loadAllSections(assessmentData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resume after crash
  useEffect(() => {
    if (!assessment || !restoredProgress) return;
    const nextIdx = (restoredProgress.lastSectionIdx ?? -1) + 1;
    const sectionsCount = (assessment.sections || []).length;
    if (nextIdx < sectionsCount) {
      handleStartSection(nextIdx);
    } else {
      setExamFinished(true);
    }
    setRestoredProgress(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment, restoredProgress]);

  // ── Fetch all section JSON files
  const loadAllSections = async (exam) => {
    setLoading(true);
    const loaded = {};
    try {
      await Promise.all(
        (exam.sections || []).map(async (sec) => {
          let fetchUrl = sec.url || '';
          if (!fetchUrl || !fetchUrl.endsWith('.json')) {
            fetchUrl = sec.type === 'mcq'
              ? `/seed-contents/mcq/${slugify(sec.name)}.json`
              : `/seed-contents/coding/${slugify(sec.name)}.json`;
          }
          let cleanPath = fetchUrl;
          if (cleanPath.startsWith('/seed-contents/')) cleanPath = cleanPath.substring('/seed-contents/'.length);
          else if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);

          const githubUrl = `https://raw.githubusercontent.com/seeditDev/seed-contents/main/${cleanPath}`;
          const localUrl = `/seed-contents/${cleanPath}`;

          try {
            let res = await fetch(githubUrl, { cache: 'no-store' });
            if (!res.ok) {
              res = await fetch(localUrl);
              if (!res.ok) throw new Error('Local fetch also failed');
            }
            const data = await res.json();
            if (data.questions && sec.type === 'coding') {
              data.questions = data.questions.map(normalizeQuestion);
            }
            loaded[sec.sectionId] = data;
          } catch (e) {
            console.error(`[MSA] Failed to load section "${sec.name}":`, e);
          }
        })
      );
      setSectionData(loaded);
    } catch (err) {
      console.error('[MSA] Error loading sections:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Section timer countdown loop
  useEffect(() => {
    if (secStarted && secTimer > 0) {
      timerRef.current = setInterval(() => {
        setSecTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [secStarted, currentSecIdx]);

  // ── Handle timer expiry (outside the state updater)
  useEffect(() => {
    if (secStarted && secTimer === 0) {
      autoSubmitSection();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer, secStarted]);

  // ── Pre-section countdown
  useEffect(() => {
    if (sectionCountdown === null) return;
    if (sectionCountdown <= 0) {
      setSecStarted(true);
      setSectionCountdown(null);
      return;
    }
    const t = setTimeout(() => setSectionCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [sectionCountdown]);

  const handleStartSection = useCallback((idx) => {
    setCountdownSecIdx(idx);
    setSectionCountdown(10);
    setCurrentSecIdx(idx);
    if (assessment && assessment.sections) {
      const section = assessment.sections[idx];
      if (section) setSecTimer((section.duration_minutes || 30) * 60);
    }
  }, [assessment]);

  const autoSubmitSection = useCallback((sectionResults) => {
    if (examFinishedRef.current) return;
    if (!assessment?.sections || currentSecIdx < 0 || currentSecIdx >= assessment.sections.length) return;

    const activeSection = assessment.sections[currentSecIdx];
    if (!activeSection) return;

    const updatedResults = {
      ...examResults,
      [activeSection.sectionId]: {
        sectionName: activeSection.name,
        type: activeSection.type,
        data: sectionResults || {}
      }
    };

    setExamResults(updatedResults);
    setSecCompleted(prev => ({ ...prev, [activeSection.sectionId]: true }));
    setSecStarted(false);
    clearInterval(timerRef.current);

    const nextIdx = currentSecIdx + 1;
    const totalSections = (assessment.sections || []).length;

    if (nextIdx < totalSections) {
      // Save partial progress
      const progressKey = `msaProgress_${assessment.id}`;
      const snapshot = {
        assessmentId: assessment.id,
        email: user?.Email || '',
        completedSections: Object.fromEntries(Object.keys(updatedResults).map(id => [id, true])),
        examResults: updatedResults,
        lastSectionIdx: currentSecIdx,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(progressKey, JSON.stringify(snapshot));

      if (user?.Email) {
        const college = user.College || 'KGKITE';
        const year = user.Year || '2026';
        setDoc(doc(db, `AssessmentResults/${assessment.id}/colleges/${college}/years/${year}/students/${user.Email}`), {
          email: user.Email, rollNumber: user['Roll Number'] || '', name: user.Name || '',
          college, year, department: user.Department || '',
          testID: assessment.id, testName: assessment.name,
          assessmentId: assessment.id, assessmentName: assessment.name,
          type: 'multisection', status: 'partial',
          sectionsCompleted: currentSecIdx + 1, totalSections,
          sections: updatedResults, lastUpdatedAt: serverTimestamp(),
          lastUpdatedAtISO: new Date().toISOString()
        }, { merge: true }).catch(e => console.error('[MSA] Partial Firestore save failed:', e));
      }

      handleStartSection(nextIdx);
    } else {
      // All sections done — final submission
      if (user?.Email) {
        const college = user.College || 'KGKITE';
        const year = user.Year || '2026';
        const attemptData = {
          email: user.Email, rollNumber: user['Roll Number'] || '', name: user.Name || '',
          college, year, department: user.Department || '',
          testID: assessment.id, testName: assessment.name,
          assessmentId: assessment.id, assessmentName: assessment.name,
          submittedAt: serverTimestamp(), submittedAtISO: new Date().toISOString(),
          type: 'multisection', sections: updatedResults
        };

        const docPath = `AssessmentResults/${assessment.id}/colleges/${college}/years/${year}/students/${user.Email}`;
        setDoc(doc(db, docPath), attemptData, { merge: true })
          .then(() => console.log('[MSA] Final result saved to Firestore'))
          .catch(e => console.error('[MSA] Firestore final save failed:', e));

        setDoc(doc(db, 'users', user.Email, 'multiSectionAttempts', assessment.id), attemptData, { merge: true })
          .catch(e => console.error('[MSA] Student-centric save failed:', e));

        const totalScore = Object.values(updatedResults).reduce((a, s) => a + (s.data?.score || 0), 0);
        const totalQ = Object.values(updatedResults).reduce((a, s) => a + (s.data?.totalQuestions || 0), 0);
        const pct = totalQ > 0 ? (totalScore / totalQ) : 0;
        const totalViolations = Object.values(updatedResults).reduce((a, s) => a + (s.data?.violationCount || 0), 0);

        supabase.from('mcq_results').upsert({
          roll_number: user['Roll Number'] || '', name: user.Name || '',
          email: user.Email, college, year, department: user.Department || '',
          test_id: assessment.id, test_name: assessment.name,
          score: totalScore, total_questions: totalQ,
          correct_answers: totalScore, incorrect_answers: totalQ - totalScore,
          percentage: pct, submitted_at: new Date().toISOString(),
          violation_count: totalViolations, updated_at: new Date().toISOString()
        }, { onConflict: 'email,test_id' }).catch(e => console.warn('[MSA] Supabase save failed:', e));
      }

      setExamFinished(true);
      localStorage.removeItem('multisectionAssessmentData');
      localStorage.removeItem(`msaProgress_${assessment.id}`);
    }
  }, [assessment, currentSecIdx, examResults, handleStartSection, user]);

  // ────────────────────────── RENDER ─────────────────────────────────────────

  if (loading || !assessment) {
    return (
      <div className="msa-loading">
        <div className="msa-spinner" />
        <p>Loading multi-section exam environment...</p>
      </div>
    );
  }

  // Exam finished screen
  if (examFinished) {
    return (
      <div className="msa-finished-container" style={{ maxWidth: '850px', margin: '60px auto', padding: '30px', background: '#1e293b', borderRadius: '12px', color: '#f8fafc', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', fontFamily: "'Inter',sans-serif" }}>
        <div style={{ textAlign: 'center', marginBottom: '35px' }}>
          <FaCheckCircle style={{ color: '#10b981', fontSize: '4.5rem', marginBottom: '15px' }} />
          <h1 style={{ fontSize: '2.2rem', fontWeight: '800', color: 'white', marginBottom: '10px' }}>Assessment Completed!</h1>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem' }}>
            Congratulations <strong>{user?.Name}</strong>, your answers have been successfully recorded and submitted.
          </p>
        </div>

        <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '30px' }}>
          <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '10px', marginBottom: '15px', color: '#38bdf8' }}>Summary of Time Spent per Question</h3>
          {(assessment.sections || []).map((sec, sIdx) => {
            const secRes = examResults[sec.sectionId] || {};
            const qList = sectionData[sec.sectionId]?.questions || [];
            return (
              <div key={sec.sectionId} style={{ marginBottom: '25px' }}>
                <h4 style={{ color: '#e2e8f0', marginBottom: '8px', fontSize: '1.05rem' }}>
                  {sIdx + 1}. {sec.name} ({sec.type.toUpperCase()})
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b' }}>
                      <th style={{ padding: '8px 12px' }}>Q No.</th>
                      <th style={{ padding: '8px 12px' }}>Question</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Time Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qList.map((q, qIdx) => {
                      const qId = q.questionId || q.id || qIdx.toString();
                      const spent = sec.type === 'mcq'
                        ? (secRes.data?.timeSpentPerQ?.[qIdx] || 0)
                        : (secRes.data?.timeSpentPerQ?.[qId] || 0);
                      return (
                        <tr key={qIdx} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '10px 12px', color: '#94a3b8' }}>Q{qIdx + 1}</td>
                          <td style={{ padding: '10px 12px', color: '#cbd5e1', maxWidth: '400px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {q.title || q.question || 'Coding Challenge'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#10b981' }}>{formatSecs(spent)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => navigate('/student/dashboard')}
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', padding: '12px 30px', fontSize: '1rem', fontWeight: '700', borderRadius: '6px', cursor: 'pointer' }}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const activeSection = currentSecIdx >= 0 ? assessment.sections?.[currentSecIdx] : null;
  const activeSecData = activeSection ? sectionData[activeSection.sectionId] : null;

  // ── Active section view (MCQ or Coding)
  if (activeSection) {
    const codingQTimers = (() => {
      const qCount = (activeSecData?.questions || []).length;
      if (activeSection.questionTimerList) {
        const parts = String(activeSection.questionTimerList).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
        if (parts.length > 0) return Array.from({ length: qCount }, (_, idx) => parts[idx] !== undefined ? parts[idx] : parts[parts.length - 1]);
      }
      if (activeSection.questionTimer) return Array(qCount).fill(activeSection.questionTimer);
      return [];
    })();

    const sectionSettings = activeSection.type === 'mcq'
      ? {
          timerRestrictedSubmit: !!activeSection.timerRestrictedSubmit,
          questionTimer: activeSection.questionTimer || 0,
          forwardOnly: !!activeSection.forwardOnly || (activeSection.questionTimer > 0),
          proctored: !!assessment.proctored || !!activeSection.proctored,
          audioProctored: !!assessment.audioProctored || !!activeSection.audioProctored
        }
      : {
          timerRestrictedSubmit: !!activeSection.timerRestrictedSubmit,
          questionTimers: codingQTimers,
          forwardOnly: !!activeSection.forwardOnly || (codingQTimers.length > 0)
        };

    const sectionView = activeSection.type === 'mcq'
      ? (
        <MCQSectionView
          key={`mcq-${activeSection.sectionId}`}
          sectionData={activeSecData}
          secTimer={secTimer}
          settings={sectionSettings}
          onSectionSubmit={autoSubmitSection}
        />
      )
      : (
        <CodingSectionView
          key={`coding-${activeSection.sectionId}`}
          sectionData={activeSecData}
          secTimer={secTimer}
          settings={sectionSettings}
          onSectionSubmit={autoSubmitSection}
        />
      );

    return (
      <>
        {sectionView}
        {/* Pre-section countdown overlay */}
        {sectionCountdown !== null && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'radial-gradient(circle at center, #0f172a, #020617)',
            color: 'white', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', zIndex: 99999, fontFamily: "'Inter',sans-serif"
          }}>
            <div style={{ textAlign: 'center', maxWidth: '500px', padding: '20px' }}>
              <div className="msa-spinner" style={{ width: '60px', height: '60px', borderTopColor: '#10b981', margin: '0 auto 24px' }} />
              <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '8px', color: '#10b981', letterSpacing: '-0.02em' }}>
                Preparing Section Workspace...
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '32px', lineHeight: '1.6' }}>
                Entering Section: <strong style={{ color: 'white' }}>{assessment?.sections?.[countdownSecIdx]?.name}</strong>.
                <br />Loading questions and preparing environment.
              </p>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px 32px', display: 'inline-block' }}>
                <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', fontWeight: '700' }}>
                  Section Starts In
                </div>
                <div style={{ fontSize: '3.5rem', fontWeight: '900', color: 'white', fontFamily: 'monospace', lineHeight: '1' }}>
                  {sectionCountdown}s
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Welcome / Navigation screen (currentSecIdx === -1 or between sections)
  return (
    <div className="msa-root">
      <header className="msa-header">
        <div className="msa-header-title">
          <span>🏆</span> {assessment.name}
        </div>
        <div className="msa-candidate-info">
          <span>{user?.Name || 'Candidate'}</span>
          <span className="msa-email">{user?.Email}</span>
        </div>
      </header>

      <div className="msa-workspace">
        <aside className="msa-sidebar">
          <h3 className="msa-sidebar-title">Exam Sections</h3>
          <div className="msa-section-list">
            {(assessment.sections || []).map((sec, idx) => {
              const isCompleted = !!secCompleted[sec.sectionId];
              const isActive = idx === currentSecIdx;
              const isLocked = idx > currentSecIdx && !isCompleted;
              return (
                <div key={sec.sectionId} className={`msa-sec-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}>
                  <div className="msa-sec-card-header">
                    <span className="msa-sec-icon">{sec.type === 'mcq' ? <FaBookOpen /> : <FaCode />}</span>
                    <span className="msa-sec-name">{sec.name}</span>
                  </div>
                  <div className="msa-sec-card-meta">
                    <span>{sec.duration_minutes} Mins</span>
                    <span>•</span>
                    <span>{sec.type.toUpperCase()}</span>
                  </div>
                  {isCompleted
                    ? <span className="msa-badge completed">Submitted</span>
                    : isActive
                      ? <span className="msa-badge active">Active Now</span>
                      : isLocked
                        ? <span className="msa-badge locked"><FaLock /> Locked</span>
                        : <button className="msa-start-btn" onClick={() => handleStartSection(idx)}>Start Section</button>
                  }
                </div>
              );
            })}
          </div>
        </aside>

        <main className="msa-content">
          {currentSecIdx === -1 ? (
            <div className="msa-intro-card">
              <h2>Welcome to the Assessment</h2>
              <p>This exam consists of multiple sections. Each section has a separate countdown timer and questions.</p>
              <div className="msa-rules-box">
                <h4>Guidelines:</h4>
                <ul>
                  <li>Once you start a section, its timer starts counting down and cannot be paused.</li>
                  <li>When a section's timer expires, your progress is automatically saved and you proceed to the next section.</li>
                  <li>You cannot navigate back to a completed or submitted section.</li>
                  <li>Fullscreen mode is monitored and proctored. Tab switches will log violations.</li>
                </ul>
              </div>
              <button className="msa-action-btn primary" onClick={() => handleStartSection(0)}>
                Proceed to First Section <FaChevronRight />
              </button>
            </div>
          ) : (
            <div className="msa-intro-card">
              <h2>Section Submitted Successfully</h2>
              <p>You have finished the current section. The next section will start shortly.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MultiSectionAssessment;
