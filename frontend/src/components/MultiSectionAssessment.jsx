/**
 * MultiSectionAssessment.jsx
 *
 * MONOLITHIC self-contained component for multi-section exams.
 * Contains its own MCQ section renderer and Coding section renderer.
 * NO dependency on MCQPage.jsx or CodingAssessmentSandbox.jsx.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import {
  FaClock, FaCheckCircle, FaLock, FaBookOpen, FaCode,
  FaArrowLeft, FaArrowRight, FaBookmark, FaPlay, FaTimes,
  FaUndo, FaChevronLeft, FaChevronRight, FaExclamationTriangle
} from 'react-icons/fa';
import '../styles/MultiSectionAssessment.css';
import '../styles/MCQPage.css';
import '../styles/CodingAssessmentSandbox.css';
import '../styles/CodingAssessmentPage.css';
import { db } from '../firebase-config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { supabase } from '../supabaseClient';
import desktopBridge from '../utils/desktopBridge';
import { fetchQuestionsForContest } from '../services/codingQuestionBankService';
import ProctoringEngine from './ProctoringEngine';
import AudioProctoringEngine from './AudioProctoringEngine';

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

const isTruthy = (val) => {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1';
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

const MCQSectionView = ({ sectionData, secTimer, settings = {}, onSectionSubmit, assessmentName = '', assessmentId = '' }) => {
  const questions = useMemo(() => sectionData?.questions || [], [sectionData?.questions]);
  const stateKey = `msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`;

  const [answers, setAnswers] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).answers || {};
    } catch (_) {}
    return {};
  });

  const [questionIndex, setQuestionIndex] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).questionIndex || 0;
    } catch (_) {}
    return 0;
  });

  const [bookmarked, setBookmarked] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).bookmarked || [];
    } catch (_) {}
    return [];
  });

  const [lockedQuestions, setLockedQuestions] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).lockedQuestions || [];
    } catch (_) {}
    return [];
  });

  const [qTimerRemaining, setQTimerRemaining] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.qTimerRemaining !== undefined) return parsed.qTimerRemaining;
      }
    } catch (_) {}
    return settings.questionTimer || 0;
  });

  const [timeSpentPerQ, setTimeSpentPerQ] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).timeSpentPerQ || {};
    } catch (_) {}
    return {};
  });

  // Save active MCQ section state to localStorage on changes
  useEffect(() => {
    const snapshot = {
      answers,
      questionIndex,
      bookmarked,
      lockedQuestions,
      qTimerRemaining,
      timeSpentPerQ
    };
    localStorage.setItem(stateKey, JSON.stringify(snapshot));
  }, [answers, questionIndex, bookmarked, lockedQuestions, qTimerRemaining, timeSpentPerQ, stateKey]);

  const [showReview, setShowReview] = useState(false);
  const [proctoringData, setProctoringData] = useState({ violationCount: 0, violations: [] });
  const [customNotice, setCustomNotice] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const onSubmitRef = useRef(onSectionSubmit);
  useEffect(() => { onSubmitRef.current = onSectionSubmit; }, [onSectionSubmit]);

  // Get user info for proctoring
  const user = (() => { try { return JSON.parse(localStorage.getItem('auth_data') || '{}'); } catch { return {}; } })();
  const testID = assessmentId || sectionData?.id || sectionData?.name || 'mcq-section';

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

  const isFirstMount = useRef(true);

  // Per-question lock timer
  useEffect(() => {
    if (settings.questionTimer > 0) {
      if (isFirstMount.current) {
        isFirstMount.current = false;
        // Don't reset if we restored a saved timer for this question index!
        const key = `msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`;
        try {
          const saved = localStorage.getItem(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.questionIndex === questionIndex && parsed.qTimerRemaining !== undefined) {
              setQTimerRemaining(parsed.qTimerRemaining);
              return;
            }
          }
        } catch (_) {}
      }
      setQTimerRemaining(settings.questionTimer);
    }
  }, [questionIndex, settings.questionTimer, assessmentId, sectionData]);

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
    const violationStats = (proctoringData.violations || []).reduce((acc, v) => {
      if (v.type === 'no_face') acc.totalNoFace++;
      else if (v.type === 'multiple_faces') acc.totalMultipleFaces++;
      return acc;
    }, { totalNoFace: 0, totalMultipleFaces: 0 });
    
    // Clean up active MCQ state from localStorage
    localStorage.removeItem(stateKey);

    if (onSubmitRef.current) {
      onSubmitRef.current({
        answers,
        timeSpentPerQ,
        score: correct,
        totalQuestions: total,
        percentage: pct,
        violationCount: proctoringData.violationCount || 0,
        totalNoFace: violationStats.totalNoFace,
        totalMultipleFaces: violationStats.totalMultipleFaces,
        violations: proctoringData.violations || []
      });
    }
  }, [answers, timeSpentPerQ, questions, proctoringData, stateKey]);

  const handleSelectOption = (optIdx) => {
    if (lockedQuestions.includes(questionIndex)) return;
    setAnswers(prev => ({ ...prev, [questionIndex]: optIdx }));
  };

  const navQuestion = (dir) => {
    if (dir === 'prev' && questionIndex > 0 && !settings.forwardOnly) setQuestionIndex(q => q - 1);
    if (dir === 'next' && questionIndex < questions.length - 1) {
      if (settings.questionTimer > 0) {
        setLockedQuestions(l => [...l, questionIndex]);
      }
      setQuestionIndex(q => q + 1);
    }
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

      {/* Proctoring Engines */}
      {settings.proctored && user?.Email && (
        <ProctoringEngine
          studentID={user.Email}
          testID={testID}
          isTestActive={true}
          maxViolations={settings.maxViolations || 7}
          onViolationUpdate={(info) => {
            if (!info?.violationType) return;
            setProctoringData(prev => {
              const isReal = ['no_face', 'multiple_faces', 'tab_switch'].includes(info.violationType);
              return {
                violationCount: typeof info.violationCount === 'number' ? info.violationCount : prev.violationCount,
                violations: isReal ? [...prev.violations, { type: info.violationType, timestamp: info.timestamp }] : prev.violations
              };
            });
          }}
          onAutoSubmit={() => handleSubmit()}
        />
      )}
      {settings.audioProctored && user?.Email && (
        <AudioProctoringEngine
          studentID={user.Email}
          testID={testID}
          isTestActive={true}
          maxViolations={settings.maxAudioViolations || 3}
          onViolationUpdate={(info) => {
            if (!info?.type) return;
            setProctoringData(prev => ({
              ...prev,
              violations: [...prev.violations, { type: info.type, timestamp: info.timestamp }]
            }));
          }}
        />
      )}

      {/* Submit Confirmation Overlay */}
      {showSubmitConfirm && (
        <div className="mcq-popup-overlay" style={{ zIndex: 10005 }}>
          <div className="mcq-popup-content" style={{ border: '1.5px solid #ef4444', boxShadow: '0 0 20px rgba(239,68,68,0.3)' }}>
            <h3 style={{ color: '#f8fafc', marginBottom: '12px' }}>Submit Section?</h3>
            <p style={{ color: '#94a3b8', lineHeight: '1.6', marginBottom: '20px' }}>
              Are you sure you want to submit this section? You cannot go back or change your answers.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: '#cbd5e1', fontWeight: '600', cursor: 'pointer' }}
                onClick={() => setShowSubmitConfirm(false)}
              >Cancel</button>
              <button
                style={{ padding: '10px 24px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', fontWeight: '700', cursor: 'pointer' }}
                onClick={() => { setShowSubmitConfirm(false); handleSubmit(); }}
              >Submit Section</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Notice Overlay */}
      {customNotice && (
        <div className="mcq-popup-overlay" style={{ zIndex: 10010 }}>
          <div className="mcq-popup-content" style={{
            border: `1.5px solid ${customNotice.type === 'error' ? '#ef4444' : customNotice.type === 'success' ? '#10b981' : '#f59e0b'}`,
          }}>
            <h3 style={{ color: customNotice.type === 'error' ? '#ef4444' : customNotice.type === 'success' ? '#10b981' : '#f59e0b' }}>{customNotice.title}</h3>
            <p style={{ margin: '12px 0', color: '#94a3b8', lineHeight: '1.6' }}>{customNotice.message}</p>
            <button
              style={{ padding: '10px 24px', border: 'none', borderRadius: '6px', background: customNotice.type === 'error' ? '#ef4444' : customNotice.type === 'success' ? '#10b981' : '#f59e0b', color: '#fff', fontWeight: '700', cursor: 'pointer' }}
              onClick={() => { const fn = customNotice.onConfirm; setCustomNotice(null); if (fn) fn(); }}
            >Understood</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mcq-test-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
        <div className="mcq-test-info">
          {assessmentName && <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600' }}>{assessmentName}</p>}
          <h1 style={{ fontSize: '1.1rem', color: '#f8fafc', margin: 0 }}>{sectionData?.name || 'MCQ Section'}</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {settings.proctored && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: proctoringData.violationCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)',
              color: proctoringData.violationCount > 0 ? '#ef4444' : '#10b981',
              border: proctoringData.violationCount > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)',
              padding: '5px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600'
            }}>
              <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: proctoringData.violationCount > 0 ? '#ef4444' : '#10b981', animation: 'pulseLock 1.5s infinite' }} />
              PROCTOR ACTIVE | Violations: {proctoringData.violationCount} / {settings.maxViolations || 7}
            </div>
          )}
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{attempted} / {total} Answered</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: secTimer <= 60 ? 'rgba(239,68,68,0.15)' : 'rgba(16, 185, 129, 0.12)',
            border: secTimer <= 60 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
            padding: '5px 12px', borderRadius: '20px', fontSize: '0.85rem',
            color: secTimer <= 60 ? '#ef4444' : '#10b981', fontWeight: '600'
          }}>
            <FaClock />
            <span>{formatTime(secTimer)}</span>
          </div>
          {!settings.timerRestrictedSubmit && (
            <button
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}
              onClick={() => setShowSubmitConfirm(true)}
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
                  onClick={() => navQuestion('prev')}
                  disabled={questionIndex === 0 || settings.forwardOnly || settings.questionTimer > 0}
                >
                  <FaArrowLeft /> Previous
                </button>
                <button
                  className="mcq-nav-button"
                  onClick={() => navQuestion('next')}
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
              onClick={() => setShowSubmitConfirm(true)}
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

const CodingSectionView = ({ sectionData, secTimer, settings = {}, onSectionSubmit, assessmentName = '', assessmentId = '' }) => {
  const challenges = useMemo(() => sectionData?.questions || [], [sectionData?.questions]);
  const codingUser = (() => { try { return JSON.parse(localStorage.getItem('auth_data') || '{}'); } catch { return {}; } })();
  
  const codingStateKey = `msa_active_coding_state_${assessmentId}_${sectionData?.id || 'section'}`;

  const [selectedChallenge, setSelectedChallenge] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_coding_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.selectedChallengeId) {
          const found = challenges.find(ch => ch.id === parsed.selectedChallengeId);
          if (found) return found;
        }
      }
    } catch (_) {}
    return challenges[0] || null;
  });

  const [language, setLanguage] = useState('cpp');
  const [customInput, setCustomInput] = useState('');
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState('input'); // 'input', 'output', 'results'
  const [isRunning, setIsRunning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [runResults, setRunResults] = useState(null); // Results for sample test runs
  const [evalResults, setEvalResults] = useState(null); // Results for hidden test runs
  
  const [completedChallenges, setCompletedChallenges] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_coding_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).completedChallenges || {};
    } catch (_) {}
    return {};
  });

  const [lockedChallenges, setLockedChallenges] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_coding_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).lockedChallenges || [];
    } catch (_) {}
    return [];
  });

  const [qTimerRemaining, setQTimerRemaining] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_coding_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.qTimerRemaining !== undefined) return parsed.qTimerRemaining;
      }
    } catch (_) {}
    return 0;
  });

  const [timeSpentPerQ, setTimeSpentPerQ] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_coding_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).timeSpentPerQ || {};
    } catch (_) {}
    return {};
  });

  const [customNotice, setCustomNotice] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  
  const [visitedChallenges, setVisitedChallenges] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_coding_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).visitedChallenges || (challenges[0] ? { [challenges[0].id]: true } : {});
    } catch (_) {}
    return challenges[0] ? { [challenges[0].id]: true } : {};
  });

  const [bookmarkedChallenges, setBookmarkedChallenges] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_coding_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).bookmarkedChallenges || {};
    } catch (_) {}
    return {};
  });

  const [questionScores, setQuestionScores] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_coding_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).questionScores || {};
    } catch (_) {}
    return {};
  });

  // Save active Coding section state to localStorage on changes
  useEffect(() => {
    const snapshot = {
      selectedChallengeId: selectedChallenge?.id || '',
      completedChallenges,
      lockedChallenges,
      qTimerRemaining,
      timeSpentPerQ,
      visitedChallenges,
      bookmarkedChallenges,
      questionScores
    };
    localStorage.setItem(codingStateKey, JSON.stringify(snapshot));
  }, [selectedChallenge, completedChallenges, lockedChallenges, qTimerRemaining, timeSpentPerQ, visitedChallenges, bookmarkedChallenges, questionScores, codingStateKey]);

  // Persistent code map across question switching
  const [codeMap, setCodeMap] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_codemap_${assessmentId}_${sectionData?.id || 'section'}`);
      return saved ? JSON.parse(saved) : {};
    } catch (_) {
      return {};
    }
  });

  const onSubmitRef = useRef(onSectionSubmit);
  useEffect(() => { onSubmitRef.current = onSectionSubmit; }, [onSectionSubmit]);

  const currentChallengeIndex = challenges.findIndex(ch => ch.id === selectedChallenge?.id);

  // Synchronize dynamic code state when language or selected question changes
  useEffect(() => {
    if (!selectedChallenge) return;
    const key = `${selectedChallenge.id}_${language}`;
    if (!codeMap[key]) {
      const boilerplate = selectedChallenge.boilerplates?.[language] || FREE_BOILERPLATES[language] || '';
      setCodeMap(prev => {
        const next = { ...prev, [key]: boilerplate };
        try {
          localStorage.setItem(`msa_codemap_${assessmentId}_${sectionData?.id || 'section'}`, JSON.stringify(next));
        } catch (_) {}
        return next;
      });
    }
  }, [selectedChallenge, language, codeMap, assessmentId, sectionData]);

  // Sync tab data when switching active question
  useEffect(() => {
    if (!selectedChallenge) return;
    setStdout('');
    setStderr('');
    setRunResults(null);
    setEvalResults(null);
    setActiveResultTab('input');
  }, [selectedChallenge]);

  // Auto-submit when section timer expires
  useEffect(() => {
    if (secTimer <= 0) {
      doSectionSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer]);

  const isFirstCodingMount = useRef(true);

  // Per-question lock timer
  useEffect(() => {
    if (!settings.questionTimers || settings.questionTimers.length === 0 || !selectedChallenge) return;
    if (isFirstCodingMount.current) {
      isFirstCodingMount.current = false;
      try {
        const saved = localStorage.getItem(codingStateKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.selectedChallengeId === selectedChallenge.id && parsed.qTimerRemaining !== undefined) {
            setQTimerRemaining(parsed.qTimerRemaining);
            return;
          }
        }
      } catch (_) {}
    }
    const activeTimer = settings.questionTimers[currentChallengeIndex] || 0;
    setQTimerRemaining(activeTimer);
  }, [selectedChallenge, currentChallengeIndex, settings.questionTimers, codingStateKey]);

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
            setVisitedChallenges(v => ({ ...v, [challenges[currentChallengeIndex + 1].id]: true }));
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

  const handleCodeChange = (value) => {
    if (!selectedChallenge) return;
    const key = `${selectedChallenge.id}_${language}`;
    const next = {
      ...codeMap,
      [key]: value
    };
    setCodeMap(next);
    try {
      localStorage.setItem(`msa_codemap_${assessmentId}_${sectionData?.id || 'section'}`, JSON.stringify(next));
    } catch (_) {}
  };

  const doSectionSubmit = useCallback(() => {
    const allAnswers = {};
    challenges.forEach(ch => {
      const key = `${ch.id}_${language}`;
      allAnswers[ch.id] = codeMap[key] || ch.boilerplates?.[language] || FREE_BOILERPLATES[language] || '';
    });

    const totalMax = challenges.reduce((acc, q) => acc + (q.weight || 20), 0);
    const totalEarned = challenges.reduce((acc, q) => acc + (questionScores[q.id]?.score || 0), 0);
    const percentage = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

    // Clean up active Coding state from localStorage
    localStorage.removeItem(codingStateKey);

    if (onSubmitRef.current) {
      onSubmitRef.current({
        answers: allAnswers,
        timeSpentPerQ,
        completed: completedChallenges,
        questionScores,
        score: totalEarned,
        totalQuestions: challenges.length,
        percentage
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges, language, codeMap, questionScores, timeSpentPerQ, completedChallenges, codingStateKey]);

  // Resizable split panels states & mouse drag hooks
  const [leftPaneWidth, setLeftPaneWidth] = useState(42); // percentage
  const [outputPaneHeight, setOutputPaneHeight] = useState(220); // pixels
  const isDraggingVertRef = useRef(false);
  const isDraggingHorizRef = useRef(false);
  const workspaceBodyRef = useRef(null);
  const rightPaneRef = useRef(null);

  const startVertDrag = useCallback((e) => {
    e.preventDefault();
    isDraggingVertRef.current = true;
    const startX = e.clientX;
    const startWidth = leftPaneWidth;
    const body = workspaceBodyRef.current;
    const totalW = body ? body.getBoundingClientRect().width : window.innerWidth;

    const onMove = (mv) => {
      if (!isDraggingVertRef.current) return;
      const delta = mv.clientX - startX;
      const newPct = Math.min(65, Math.max(25, startWidth + (delta / totalW) * 100));
      setLeftPaneWidth(newPct);
    };
    const onUp = () => {
      isDraggingVertRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftPaneWidth]);

  const startHorizDrag = useCallback((e) => {
    e.preventDefault();
    isDraggingHorizRef.current = true;
    const startY = e.clientY;
    const startH = outputPaneHeight;
    const rp = rightPaneRef.current;
    const totalH = rp ? rp.getBoundingClientRect().height : 500;

    const onMove = (mv) => {
      if (!isDraggingHorizRef.current) return;
      const delta = startY - mv.clientY;
      const newH = Math.min(totalH * 0.6, Math.max(80, startH + delta));
      setOutputPaneHeight(Math.round(newH));
    };
    const onUp = () => {
      isDraggingHorizRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [outputPaneHeight]);

  // Compile & execute standard test cases
  const handleRunCode = async () => {
    if (!selectedChallenge) return;
    setIsRunning(true);
    setRunResults(null);
    setActiveResultTab('results');
    setStdout("Compiling and executing sample test cases...");
    setStderr("");

    const codeText = codeMap[`${selectedChallenge.id}_${language}`] || "";
    const sampleTests = selectedChallenge.sampleTests || selectedChallenge.sampleTestCases || [];
    const bridgeLang = language === 'python3' ? 'python' : language;

    if (!isRunningInPyQt()) {
      setIsRunning(false);
      setStdout("");
      setStderr("⚠️ Code execution requires the SEED-IT Desktop App. Your code has been saved.");
      setRunResults([]);
      return;
    }

    let results = [];
    try {
      for (let i = 0; i < sampleTests.length; i++) {
        const tc = sampleTests[i];
        const resRaw = await desktopBridge.runDirectSandbox(bridgeLang, codeText, tc.input);
        const res = typeof resRaw === 'string' ? JSON.parse(resRaw) : resRaw;
        const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
        const passed = res.stdout !== undefined &&
            res.stdout.replace(/\r\n/g, "\n").trim() === (tc.expected || "").replace(/\r\n/g, "\n").trim() &&
            !res.error && (exit === 0 || exit === null);

        results.push({
          index: i + 1,
          input: tc.input,
          expected: tc.expected || "",
          actual: res.stdout || "",
          stderr: res.stderr || res.error || "",
          passed: passed
        });
      }

      // Run Custom Input if checked
      if (useCustomInput) {
        const resRaw = await desktopBridge.runDirectSandbox(bridgeLang, codeText, customInput);
        const res = typeof resRaw === 'string' ? JSON.parse(resRaw) : resRaw;
        const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
        const passed = !res.error && (exit === 0 || exit === null);
        results.push({
          index: 'Custom',
          input: customInput,
          expected: 'N/A (Custom Run)',
          actual: res.stdout || "",
          stderr: res.stderr || res.error || "",
          passed: passed
        });
      }

      setRunResults(results);

      // Set stdout/stderr of the last case for output display tab fallback
      const lastCase = results[results.length - 1];
      if (lastCase) {
        setStdout(lastCase.actual);
        setStderr(lastCase.stderr);
      }
    } catch (err) {
      console.error("Local sandbox execute error:", err);
      setStderr(`Compiler execution failure: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Evaluate code against hidden test cases
  const handleTestCode = async () => {
    if (!selectedChallenge) return;
    setIsTesting(true);
    setEvalResults(null);
    setActiveResultTab('results');

    const codeText = codeMap[`${selectedChallenge.id}_${language}`] || "";
    const hiddenTests = selectedChallenge.hiddenTests || selectedChallenge.sampleTestCases || selectedChallenge.sampleTests || [];
    const bridgeLang = language === 'python3' ? 'python' : language;

    let passedCount = 0;
    let results = [];
    let evalError = null;

    if (!isRunningInPyQt()) {
      setIsTesting(false);
      setCustomNotice({
        title: 'Desktop App Required',
        message: 'Code evaluation requires the SEED-IT Desktop App. Your code has been saved locally.',
        type: 'warning'
      });
      return;
    }

    try {
      for (let i = 0; i < hiddenTests.length; i++) {
        const tc = hiddenTests[i];
        const resRaw = await desktopBridge.runDirectSandbox(bridgeLang, codeText, tc.input);
        const res = typeof resRaw === 'string' ? JSON.parse(resRaw) : resRaw;

        const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
        const cleanOut = (res.stdout || "").replace(/\r\n/g, "\n").trim();
        const cleanExp = (tc.expected || "").replace(/\r\n/g, "\n").trim();
        const passed = cleanOut === cleanExp && !res.error && (exit === 0 || exit === null);

        if (passed) passedCount++;
        results.push({ index: i + 1, passed, error: res.error || res.stderr || "" });
      }

      const total = hiddenTests.length;
      const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;
      const earnedWeight = total > 0 ? (passedCount / total) * (selectedChallenge.weight || 20) : 0;

      const newScores = {
        ...questionScores,
        [selectedChallenge.id]: {
          score: earnedWeight,
          percentage: score,
          passed: passedCount,
          total: total,
          submitted: true
        }
      };
      setQuestionScores(newScores);
      setEvalResults(results);

      if (score === 100) {
        setCompletedChallenges(prev => ({ ...prev, [selectedChallenge.id]: true }));
      }
    } catch (err) {
      console.error("Submit question evaluation failed:", err);
      evalError = err.message;
    } finally {
      setIsTesting(false);
      if (evalError) {
        setCustomNotice({ title: 'Evaluation Failed', message: `Evaluation failed: ${evalError}`, type: 'error' });
      } else {
        const total = hiddenTests.length;
        const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;
        setCustomNotice({
          title: 'Question Submitted ✅',
          message: `Hidden Tests Passed: ${passedCount}/${total} \u00a0\u00a0 Score: ${score}%`,
          type: score === 100 ? 'success' : 'warning'
        });
      }
    }
  };

  const handleResetCode = () => {
    const b = selectedChallenge?.boilerplates?.[language] || FREE_BOILERPLATES[language] || '';
    handleCodeChange(b);
  };

  const toggleBookmark = (qId) => {
    setBookmarkedChallenges(prev => ({ ...prev, [qId]: !prev[qId] }));
  };

  const getGridBubbleClass = (q) => {
    const score = questionScores[q.id];
    const isBookmarked = bookmarkedChallenges[q.id];
    const isVisited = visitedChallenges[q.id];

    if (score && score.submitted && score.percentage === 100) return 'grid-bubble-green';
    if (isBookmarked) return 'grid-bubble-blue';
    if (isVisited && (!score || !score.submitted)) return 'grid-bubble-red';
    return 'grid-bubble-gray';
  };

  const monacoLanguage = language === 'cpp' ? 'cpp' : language === 'c' ? 'c' : language === 'java' ? 'java' : 'python';
  const isChLocked = selectedChallenge ? lockedChallenges.includes(selectedChallenge.id) : false;

  const handlePrev = () => {
    if (settings.forwardOnly || (settings.questionTimers && settings.questionTimers.length > 0)) return;
    if (currentChallengeIndex > 0) {
      setSelectedChallenge(challenges[currentChallengeIndex - 1]);
      setVisitedChallenges(v => ({ ...v, [challenges[currentChallengeIndex - 1].id]: true }));
    }
  };

  const handleNext = () => {
    if (currentChallengeIndex < challenges.length - 1 && currentChallengeIndex !== -1) {
      if (settings.questionTimers && settings.questionTimers.length > 0 && selectedChallenge) {
        setLockedChallenges(l => [...l, selectedChallenge.id]);
      }
      setSelectedChallenge(challenges[currentChallengeIndex + 1]);
      setVisitedChallenges(v => ({ ...v, [challenges[currentChallengeIndex + 1].id]: true }));
    }
  };

  const formatRemainingTime = () => {
    const mins = Math.floor(secTimer / 60);
    const secs = secTimer % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (challenges.length === 0) {
    return (
      <div className="msa-loading">
        <div className="msa-spinner" />
        <p>Loading coding challenges...</p>
      </div>
    );
  }

  return (
    <div
      className="coding-workspace-page"
      onCopy={e => { e.preventDefault(); setCustomNotice({ title: 'Action Blocked', message: 'Copying is disabled.', type: 'error' }); }}
      onPaste={e => { e.preventDefault(); setCustomNotice({ title: 'Action Blocked', message: 'Pasting is disabled.', type: 'error' }); }}
      onCut={e => { e.preventDefault(); setCustomNotice({ title: 'Action Blocked', message: 'Cutting is disabled.', type: 'error' }); }}
    >
      {/* Audio Proctoring Engine — noise bar fixed bottom-right */}
      {settings.audioProctored && codingUser?.Email && (
        <AudioProctoringEngine
          studentID={codingUser.Email}
          testID={assessmentId || sectionData?.id || 'coding-section'}
          isTestActive={true}
          maxViolations={settings.maxAudioViolations || 3}
          onViolationUpdate={(info) => {
            console.warn('[CodingSection] Audio violation:', info);
          }}
        />
      )}
      {/* Submit confirm overlay */}
      {showSubmitConfirm && (
        <div className="passkey-modal-overlay" style={{ zIndex: 10050 }}>
          <div className="passkey-modal" style={{ maxWidth: '520px', width: '90%' }}>
            <div className="passkey-modal-header" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderBottom: '1px solid #334155' }}>
              <h3 style={{ color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaExclamationTriangle style={{ color: '#f59e0b' }} /> Submit Section?
              </h3>
              <button onClick={() => setShowSubmitConfirm(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.1rem' }}><FaTimes /></button>
            </div>
            <div className="passkey-modal-body" style={{ padding: '20px', background: '#0f172a' }}>
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '10px', padding: '12px 16px', marginBottom: '18px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <FaLock style={{ color: '#ef4444', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, color: '#fca5a5', fontWeight: '700', fontSize: '0.9rem' }}>⚠️ Cannot Re-Attempt Section</p>
                  <p style={{ margin: '4px 0 0', color: '#fda4af', fontSize: '0.82rem', lineHeight: '1.4' }}>
                    Once submitted, this coding section is locked. You will proceed to the next section and cannot return.
                  </p>
                </div>
              </div>
              <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '12px' }}>Question status overview:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {challenges.map((q, idx) => {
                  const qs = questionScores[q.id];
                  const submitted = qs?.submitted;
                  const passed = qs?.passed || 0;
                  const total = qs?.total || (q.hiddenTests?.length || q.sampleTests?.length || 0);
                  const pct = qs?.percentage || 0;
                  return (
                    <div key={q.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: submitted ? 'rgba(16,185,129,0.08)' : 'rgba(100,116,139,0.08)', border: `1px solid ${submitted ? 'rgba(16,185,129,0.25)' : 'rgba(100,116,139,0.2)'}`, borderRadius: '8px', padding: '9px 14px' }}>
                      <span style={{ color: '#cbd5e1', fontSize: '0.88rem', fontWeight: '600' }}>Q{idx + 1}: {q.title || 'Challenge'}</span>
                      {submitted ? (
                        <span style={{ background: pct === 100 ? 'rgba(16,185,129,0.2)' : pct > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)', color: pct === 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#ef4444', border: `1px solid ${pct === 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#ef4444'}`, borderRadius: '20px', padding: '2px 10px', fontSize: '0.78rem', fontWeight: '700' }}>{passed}/{total} passed</span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.78rem', fontStyle: 'italic' }}>Not evaluated</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="passkey-modal-footer" style={{ background: '#0f172a', borderTop: '1px solid #1e293b', justifyContent: 'space-between', display: 'flex', padding: '14px 20px' }}>
              <button className="cancel-btn" onClick={() => setShowSubmitConfirm(false)}>Cancel</button>
              <button className="confirm-btn" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }} onClick={() => { setShowSubmitConfirm(false); doSectionSubmit(); }}>Confirm &amp; Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Header bar */}
      <header className="workspace-header">
        <div className="header-left">
          <button className="exit-workspace-btn" onClick={() => setShowSubmitConfirm(true)}>
            <FaArrowLeft /> Submit Section
          </button>
          <span className="assessment-title-label">
            {assessmentName && <span>{assessmentName} › </span>}{sectionData?.name || 'Coding Workspace'}
          </span>
        </div>

        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className="timer-pill">
            <FaClock />
            <span className="remaining-timer-span">{formatRemainingTime()}</span>
          </div>
          {!settings.timerRestrictedSubmit && (
            <button className="submit-assessment-btn" onClick={() => setShowSubmitConfirm(true)}>
              Submit Section
            </button>
          )}
        </div>
      </header>

      {/* Workspace Column Split */}
      {selectedChallenge ? (
        <div className="workspace-body" ref={workspaceBodyRef}>

          {/* LEFT COLUMN */}
          <div className="workspace-left-pane" style={{ width: `${leftPaneWidth}%` }}>
            {/* Question nav grid */}
            <div className="left-pane-card question-nav-card">
              <div className="card-header-label">Question Navigation</div>
              <div className="question-grid">
                {challenges.map((q, idx) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      if (settings.forwardOnly || (settings.questionTimers && settings.questionTimers.length > 0)) return;
                      setSelectedChallenge(q);
                      setVisitedChallenges(prev => ({ ...prev, [q.id]: true }));
                    }}
                    className={`grid-bubble ${q.id === selectedChallenge.id ? 'grid-bubble-active' : ''} ${getGridBubbleClass(q)}`}
                    style={(settings.forwardOnly || (settings.questionTimers && settings.questionTimers.length > 0)) ? { cursor: 'not-allowed' } : {}}
                  >
                    Q{idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Problem statement scroll panel */}
            <div className="left-pane-card problem-statement-card">
              <div className="card-header-flex">
                <div className="card-header-label" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {selectedChallenge.title}
                  <div className="challenge-nav-buttons" style={{ display: 'inline-flex', gap: '4px', marginLeft: '8px' }}>
                    <button onClick={handlePrev} disabled={currentChallengeIndex <= 0 || (settings.questionTimers && settings.questionTimers.length > 0)} className="nav-arrow-btn" style={{ padding: '2px 8px', fontSize: '0.75rem', height: '24px', display: 'flex', alignItems: 'center' }} title="Previous Challenge"><FaChevronLeft /></button>
                    <button onClick={handleNext} disabled={currentChallengeIndex >= challenges.length - 1 || currentChallengeIndex === -1} className="nav-arrow-btn" style={{ padding: '2px 8px', fontSize: '0.75rem', height: '24px', display: 'flex', alignItems: 'center' }} title="Next Challenge"><FaChevronRight /></button>
                  </div>
                </div>
                <div className="header-tags-row">
                  {settings.questionTimers && settings.questionTimers.length > 0 && (
                    <span className="difficulty-badge" style={{ background: qTimerRemaining <= 60 ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)', color: qTimerRemaining <= 60 ? '#ef4444' : '#6366f1', border: qTimerRemaining <= 60 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(99,102,241,0.3)', fontWeight: 'bold' }}>
                      ⏳ Locks in: {Math.floor(qTimerRemaining / 60)}:{(qTimerRemaining % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                  <span className={`difficulty-badge diff-${selectedChallenge.difficulty?.toLowerCase() || 'medium'}`}>
                    {selectedChallenge.difficulty}
                  </span>
                  <button
                    onClick={() => toggleBookmark(selectedChallenge.id)}
                    className={`bookmark-btn ${bookmarkedChallenges[selectedChallenge.id] ? 'bookmarked' : ''}`}
                    title="Bookmark challenge"
                  >
                    <FaBookmark />
                  </button>
                </div>
              </div>
              <div className="problem-content-scroll">
                <div className="problem-statement-text">
                  {isChLocked && (
                    <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', color: '#ef4444', marginBottom: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FaLock /><span>This question's timer has expired. The workspace is locked.</span>
                    </div>
                  )}

                  <p>{selectedChallenge.description}</p>

                  {selectedChallenge.instructions && (
                    <>
                      <h4>Input Format &amp; Instructions</h4>
                      <p>{selectedChallenge.instructions}</p>
                    </>
                  )}

                  {selectedChallenge.constraints && (
                    <>
                      <h4>Constraints</h4>
                      <pre className="constraints-block">{selectedChallenge.constraints}</pre>
                    </>
                  )}

                  {selectedChallenge.sampleTestCases && selectedChallenge.sampleTestCases.map((st, i) => (
                    <div key={i} className="example-io-block">
                      <h4>Sample Test Case {i + 1}</h4>
                      <div className="io-row">
                        <div className="io-col">
                          <strong>Input:</strong>
                          <pre>{st.input || "No Input"}</pre>
                        </div>
                        <div className="io-col">
                          <strong>Expected Output:</strong>
                          <pre>{st.expected}</pre>
                        </div>
                      </div>
                      {st.explanation && (
                        <div className="io-explanation">
                          <strong>Explanation:</strong>
                          <p>{st.explanation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* VERTICAL DIVIDER */}
          <div className="pane-divider-vertical" onMouseDown={startVertDrag} title="Drag to resize columns" />

          {/* RIGHT COLUMN */}
          <div className="workspace-right-pane" ref={rightPaneRef} style={{ width: `${100 - leftPaneWidth}%` }}>
            {/* Editor container */}
            <div className="editor-container-card" style={{ flex: 1, minHeight: 0 }}>
              <div className="editor-toolbar">
                <div className="toolbar-left">
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    className="language-selector"
                  >
                    <option value="cpp">C++ (GCC G++)</option>
                    <option value="c">C (GCC GCC)</option>
                    <option value="python">Python 3 (Python)</option>
                    <option value="java">Java (OpenJDK javac)</option>
                  </select>
                </div>
                <div className="toolbar-right">
                  <button className="editor-control-btn reset-btn" onClick={handleResetCode} disabled={isChLocked}>
                    <FaUndo /> Reset Boilerplate
                  </button>
                </div>
              </div>

              <div className="monaco-wrapper">
                <Editor
                  key={`${selectedChallenge.id}_${language}`}
                  height="100%"
                  language={monacoLanguage}
                  value={codeMap[`${selectedChallenge.id}_${language}`] || ""}
                  onChange={handleCodeChange}
                  theme={['light', 'red-light'].includes(localStorage.getItem('portal_theme')) ? 'light' : 'vs-dark'}
                  options={{
                    readOnly: isChLocked,
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', Courier, monospace",
                    minimap: { enabled: false },
                    scrollbar: { vertical: 'visible', horizontal: 'visible' },
                    automaticLayout: true,
                    cursorBlinking: 'smooth',
                    wordWrap: 'on'
                  }}
                />
              </div>

              <div className="editor-footer-actions">
                <div className="footer-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    className="run-btn"
                    onClick={handleRunCode}
                    disabled={isRunning || isTesting || isChLocked}
                  >
                    {isRunning ? (
                      <><div className="button-spinner"></div> Compiling...</>
                    ) : (
                      <><FaPlay /> Run Code</>
                    )}
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8', userSelect: 'none', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={useCustomInput}
                      onChange={e => setUseCustomInput(e.target.checked)}
                      style={{ cursor: 'pointer', width: '15px', height: '15px', margin: 0 }}
                    />
                    Run along with sample test cases
                  </label>
                </div>
                <div className="footer-right">
                  <button
                    className="solve-question-btn"
                    onClick={handleTestCode}
                    disabled={isRunning || isTesting || isChLocked}
                  >
                    {isTesting ? (
                      <><div className="button-spinner"></div> Evaluating...</>
                    ) : (
                      <>Submit Question</>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* HORIZONTAL DIVIDER */}
            <div className="pane-divider-horizontal" onMouseDown={startHorizDrag} title="Drag to resize output pane" />

            {/* Console Output Card */}
            <div className="console-output-card" style={{ height: `${outputPaneHeight}px`, flexShrink: 0 }}>
              <div className="tabs-header">
                <button className={`tab-btn ${activeResultTab === 'input' ? 'active' : ''}`} onClick={() => setActiveResultTab('input')}>Custom Input</button>
                <button className={`tab-btn ${activeResultTab === 'output' ? 'active' : ''}`} onClick={() => setActiveResultTab('output')}>Stdout Logs</button>
                <button className={`tab-btn ${activeResultTab === 'results' ? 'active' : ''}`} onClick={() => setActiveResultTab('results')}>Test Results</button>
              </div>
              <div className="tab-body-scroll">
                {activeResultTab === 'input' && (
                  <textarea
                    className="custom-stdin-input"
                    placeholder="Type standard input (stdin) values here..."
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                  />
                )}

                {activeResultTab === 'output' && (
                  <div className="compiler-output-display">
                    {stderr && (
                      <pre className="output-stderr-pre">
                        <strong>Stderr / Errors:</strong><br />
                        {stderr}
                      </pre>
                    )}
                    {stdout && (
                      <pre className="output-stdout-pre">
                        <strong>Stdout:</strong><br />
                        {stdout}
                      </pre>
                    )}
                    {!stdout && !stderr && (
                      <span className="no-output-hint">Click 'Run Code' to compile and execute program.</span>
                    )}
                  </div>
                )}

                {activeResultTab === 'results' && (
                  <div className="test-results-list" style={{ padding: '12px' }}>
                    {isRunning && (
                      <div className="console-loader"><div className="mini-spinner" /><span>Compiling &amp; Executing Sample Cases...</span></div>
                    )}
                    {isTesting && (
                      <div className="console-loader"><div className="mini-spinner" /><span>Evaluating Hidden Test Cases...</span></div>
                    )}
                    
                    {!isRunning && !isTesting && runResults && (
                      <div className="results-group">
                        <h4 style={{ color: '#38bdf8', marginBottom: '8px', fontSize: '0.9rem' }}>Sample Test Cases Execution Logs:</h4>
                        <table className="results-table">
                          <thead>
                            <tr>
                              <th>Case</th>
                              <th>Status</th>
                              <th>Actual</th>
                              <th>Expected</th>
                            </tr>
                          </thead>
                          <tbody>
                            {runResults.map(r => (
                              <tr key={r.index}>
                                <td>Case {r.index}</td>
                                <td className={r.passed ? 'pass-cell' : 'fail-cell'}>
                                  {r.passed ? 'PASSED' : 'FAILED'}
                                </td>
                                <td><pre className="inline-io">{r.actual || '[Empty]'}</pre></td>
                                <td><pre className="inline-io">{r.expected}</pre></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {!isRunning && !isTesting && evalResults && (
                      <div className="results-group">
                        <h4 style={{ color: '#38bdf8', marginBottom: '8px', fontSize: '0.9rem' }}>Hidden Test Cases Evaluation Result:</h4>
                        <div className="hidden-cases-badges">
                          {evalResults.map(r => (
                            <span
                              key={r.index}
                              className={`hidden-badge ${r.passed ? 'badge-pass' : 'badge-fail'}`}
                              title={r.error ? r.error : 'Passed Case'}
                            >
                              Case {r.index}: {r.passed ? 'PASS' : 'FAIL'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {!isRunning && !isTesting && !runResults && !evalResults && (
                      <span className="no-output-hint">Run Code or Submit to view verified test cases.</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="workspace-loading-fallback">
          <div className="learn-spinner"></div>
          <p>Loading Workspace Questions...</p>
        </div>
      )}

      {/* Custom Notice Overlay */}
      {customNotice && (
        <div className="passkey-modal-overlay" style={{ zIndex: 10080 }}>
          <div className="passkey-modal" style={{ maxWidth: '400px' }}>
            <div className="passkey-modal-header" style={{ backgroundColor: customNotice.type === 'error' ? '#fee2e2' : '#f0fdf4' }}>
              <h3 style={{ color: customNotice.type === 'error' ? '#991b1b' : '#166534', margin: 0 }}>
                {customNotice.title}
              </h3>
              <button onClick={() => setCustomNotice(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8' }}><FaTimes /></button>
            </div>
            <div className="passkey-modal-body">
              <p style={{ margin: 0, color: '#334155', fontSize: '0.95rem', lineHeight: '1.5' }}>
                {customNotice.message}
              </p>
            </div>
            <div className="passkey-modal-footer" style={{ backgroundColor: customNotice.type === 'error' ? '#fee2e2' : '#f0fdf4', justifyContent: 'flex-end', display: 'flex' }}>
              <button
                className="confirm-btn"
                style={{ backgroundColor: customNotice.type === 'error' ? '#ef4444' : '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}
                onClick={() => { const cb = customNotice.onConfirm; setCustomNotice(null); if (cb) cb(); }}
              >OK</button>
            </div>
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

  // ── Block back/forward navigation during exam & hide PyQt SEB nav buttons
  useEffect(() => {
    window.history.pushState({ msaActive: true }, '');
    const handler = () => window.history.pushState({ msaActive: true }, '');
    window.addEventListener('popstate', handler);

    // Hide PyQt SEB navigation controls
    window.__seedHideNavControls = true;

    return () => {
      window.removeEventListener('popstate', handler);
      window.__seedHideNavControls = false;
    };
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
    if (restoredProgress.currentSecIdx !== undefined && restoredProgress.currentSecIdx >= 0) {
      console.log('[MSA] Resuming active section index:', restoredProgress.currentSecIdx);
      setCurrentSecIdx(restoredProgress.currentSecIdx);
      setSecStarted(restoredProgress.secStarted || false);
      setSecTimer(restoredProgress.secTimer || 0);
    } else {
      const nextIdx = (restoredProgress.lastSectionIdx ?? -1) + 1;
      const sectionsCount = (assessment.sections || []).length;
      if (nextIdx < sectionsCount) {
        handleStartSection(nextIdx);
      } else {
        setExamFinished(true);
      }
    }
    setRestoredProgress(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment, restoredProgress]);

  // ── Continuous progress save to localStorage
  useEffect(() => {
    if (!assessment || currentSecIdx < 0 || !secStarted) return;
    const progressKey = `msaProgress_${assessment.id}`;
    const snapshot = {
      assessmentId: assessment.id,
      email: user?.Email || '',
      completedSections: secCompleted,
      examResults,
      currentSecIdx,
      secStarted,
      secTimer,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(progressKey, JSON.stringify(snapshot));
  }, [assessment, user, secCompleted, examResults, currentSecIdx, secStarted, secTimer]);

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
            if (sec.type === 'coding') {
              let ids = [];
              if (Array.isArray(data.questionIds)) {
                ids = data.questionIds;
              } else if (Array.isArray(data.questions)) {
                ids = data.questions.map(q => typeof q === 'string' ? q : (q.id || q.questionId));
              }

              if (ids.length > 0) {
                try {
                  const resolved = await fetchQuestionsForContest(ids);
                  data.questions = resolved.map(normalizeQuestion);
                } catch (resErr) {
                  console.error('[MSA] Failed to resolve questions from bank:', resErr);
                  data.questions = [];
                }
              } else if (Array.isArray(data.questions)) {
                data.questions = data.questions.map(normalizeQuestion);
              } else {
                data.questions = [];
              }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          timerRestrictedSubmit: isTruthy(activeSection.timerRestrictedSubmit),
          questionTimer: activeSection.questionTimer || 0,
          forwardOnly: isTruthy(activeSection.forwardOnly) || (activeSection.questionTimer > 0),
          proctored: isTruthy(assessment.proctored) || isTruthy(activeSection.proctored),
          audioProctored: isTruthy(assessment.audioProctored) || isTruthy(activeSection.audioProctored),
          maxViolations: Number(assessment.maxViolations) || 7,
          maxAudioViolations: Number(assessment.maxAudioViolations) || 3
        }
      : {
          timerRestrictedSubmit: isTruthy(activeSection.timerRestrictedSubmit),
          questionTimers: codingQTimers,
          forwardOnly: isTruthy(activeSection.forwardOnly) || (codingQTimers.length > 0),
          audioProctored: isTruthy(assessment.audioProctored) || isTruthy(activeSection.audioProctored),
          maxAudioViolations: Number(assessment.maxAudioViolations) || 3
        };
    const sectionView = activeSection.type === 'mcq'
      ? (
        <MCQSectionView
          key={`mcq-${activeSection.sectionId}`}
          sectionData={activeSecData}
          secTimer={secTimer}
          settings={sectionSettings}
          onSectionSubmit={autoSubmitSection}
          assessmentName={assessment.name || ''}
          assessmentId={assessment.id || ''}
        />
      )
      : (
        <CodingSectionView
          key={`coding-${activeSection.sectionId}`}
          sectionData={activeSecData}
          secTimer={secTimer}
          settings={sectionSettings}
          onSectionSubmit={autoSubmitSection}
          assessmentName={assessment.name || ''}
          assessmentId={assessment.id || ''}
        />
      );

    return (
      <>
        {sectionView}
        {/* Pre-section countdown overlay */}
        {sectionCountdown !== null && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'var(--bg-primary)',
            color: 'var(--text-main)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', zIndex: 99999, fontFamily: "'Inter',sans-serif"
          }}>
            <div style={{ textAlign: 'center', maxWidth: '500px', padding: '20px' }}>
              <div className="msa-spinner" style={{ width: '60px', height: '60px', borderTopColor: 'var(--accent-coding)', margin: '0 auto 24px' }} />
              <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '8px', color: 'var(--accent-coding)', letterSpacing: '-0.02em' }}>
                Preparing Section Workspace...
              </h2>
              {assessment?.name && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700', marginBottom: '6px' }}>
                  {assessment.name}
                </p>
              )}
              <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '32px', lineHeight: '1.6' }}>
                Entering Section: <strong style={{ color: 'var(--text-main)' }}>{assessment?.sections?.[countdownSecIdx]?.name}</strong>.
                <br />Loading questions and preparing environment.
              </p>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px 32px', display: 'inline-block' }}>
                <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '700' }}>
                  Section Starts In
                </div>
                <div style={{ fontSize: '3.5rem', fontWeight: '900', color: 'var(--text-main)', fontFamily: 'monospace', lineHeight: '1' }}>
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
